import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { issuePlanPath, readIssuePlan, writeIssuePlan } from "../workflow/plan.js";
import { createWorkflowStore, readWorkspaceWorkflowConfig, type WorkflowTask } from "../workflow/index.js";

type GithubComment = {
  author?: { login?: string };
  body?: string;
  createdAt?: string;
};

type GithubIssue = {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: { name: string }[];
  comments?: GithubComment[];
};

export function runPlan(args: string[], cwd: string) {
  const [command, issueNumber] = args.filter((arg) => arg !== "--json");
  const json = args.includes("--json");
  if (command === "tasks") return runIssueTasks(issueNumber, cwd);
  if (command === "branch") return runIssueBranch(issueNumber, cwd);
  if (command === "resume") return runIssueResume(issueNumber, cwd);
  if (command === "approve") return runIssueApproval(issueNumber, cwd);
  if (command !== "github-issue" || args.filter((arg) => arg !== "--json").length > 2) {
    return fail("Usage: agent-rig plan github-issue [<number>] [--json] | plan branch <number> | plan resume <number> | plan approve <number> | plan tasks <number>");
  }

  try {
    const repo = githubRepo(cwd);
    if (issueNumber === undefined) {
      const issues = githubIssues(cwd, repo);
      if (json) console.log(JSON.stringify({ repo, issues }, null, 2));
      else printIssueList(repo, issues);
      return 0;
    }

    if (!/^\d+$/.test(issueNumber) || Number(issueNumber) < 1) return fail("Issue number must be a positive integer.");
    const issue = githubIssue(cwd, repo, Number(issueNumber));
    if (json) console.log(JSON.stringify({ repo, issue }, null, 2));
    else printIssue(repo, issue);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

export type PlannedTask = {
  key: string;
  title: string;
  sections: Record<string, string>;
  dependsOn: string[];
  type: string;
  priority: string;
  assignedTo: string;
  phase?: string;
};

const taskBriefSections = ["Context", "Goal", "Scope", "Planner Notes", "Implementation Plan", "Acceptance Criteria"];

export function parseTaskBreakdown(body: string): PlannedTask[] {
  const heading = /^## Task Breakdown\s*$/m.exec(body);
  if (!heading || typeof heading.index !== "number") throw new Error("Issue plan is incomplete: missing Task Breakdown section");
  const sectionStart = heading.index + heading[0].length;
  const remainder = body.slice(sectionStart);
  const nextSection = /^##\s+/m.exec(remainder);
  const section = remainder.slice(0, nextSection?.index ?? remainder.length);
  const blocks = [...section.matchAll(/^###\s+(?:Task\s+)?([^\n]+)$/gm)];
  if (!blocks.length) throw new Error("Issue plan Task Breakdown must contain task headings");
  return blocks.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = blocks[index + 1]?.index ?? section.length;
    const raw = section.slice(start, end).trim();
    const title = heading[1].replace(/^\d+[.:)-]\s*/, "").trim();
    const sections: Record<string, string> = {};
    const fieldPattern = /^(?:####\s+|[-*]\s+\*\*|[-*]\s+)?(Context|Goal|Scope|Planner Notes|Implementation Plan|Acceptance Criteria|Depends On|Type|Priority|Assigned To|Phase):?\*{0,2}\s*(.*)$/i;
    let current = "";
    for (const line of raw.split(/\r?\n/)) {
      const section = line.match(/^####\s+(Context|Goal|Scope|Planner Notes|Implementation Plan|Acceptance Criteria)\s*$/i);
      if (section) { current = section[1]; sections[current] = ""; continue; }
      const field = line.match(fieldPattern);
      if (field) { current = field[1]; sections[current] = field[2].trim(); continue; }
      if (current) sections[current] = `${sections[current]}${sections[current] ? "\n" : ""}${line}`.trim();
    }
    const normalized = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key.toLowerCase(), value.trim()])) as Record<string, string>;
    const missing = taskBriefSections.filter((section) => !normalized[section.toLowerCase()]);
    if (missing.length) throw new Error(`Task ${index + 1} is incomplete: missing ${missing.join(", ")}`);
    const dependencyText = normalized["depends on"] ?? "";
    return {
      key: String(index + 1), title, sections: normalized,
      dependsOn: dependencyText.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean),
      type: normalized.type || "task", priority: normalized.priority || "normal", assignedTo: normalized["assigned to"] || "worker",
      ...(normalized.phase ? { phase: normalized.phase } : {})
    };
  });
}

export function validateTaskDependencies(tasks: PlannedTask[]): void {
  const keys = new Set(tasks.map((task) => task.key));
  for (const task of tasks) {
    const seen = new Set<string>();
    for (const dependency of task.dependsOn) {
      if (dependency === task.key) {
        throw new Error(`Task ${task.key} cannot depend on itself`);
      }
      if (!keys.has(dependency)) {
        throw new Error(`Task ${task.key} depends on unknown task ${dependency}`);
      }
      if (seen.has(dependency)) {
        throw new Error(`Task ${task.key} has duplicate dependency ${dependency}`);
      }
      seen.add(dependency);
    }
  }
}

export function dependencySafeOrder(tasks: PlannedTask[]): PlannedTask[] {
  const remaining = new Map(tasks.map((task) => [task.key, task]));
  const ordered: PlannedTask[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((task) => task.dependsOn.every((dependency) => !remaining.has(dependency)));
    if (!ready.length) throw new Error("Task dependencies contain a cycle");
    for (const task of ready) {
      remaining.delete(task.key);
      ordered.push(task);
    }
  }
  return ordered;
}

export function taskBrief(task: PlannedTask): string {
  return `# Task\n\n${taskBriefSections.map((section) => `## ${section}\n\n${task.sections[section.toLowerCase()]}`).join("\n\n")}\n`;
}

function runIssueTasks(issueNumber: string | undefined, cwd: string) {
  if (!issueNumber || !/^\d+$/.test(issueNumber) || Number(issueNumber) < 1) return fail("Usage: agent-rig plan tasks <number>");
  try {
    const repo = githubRepo(cwd);
    const issue = githubIssue(cwd, repo, Number(issueNumber));
    const planFile = issuePlanPath(cwd, issue.number, issue.title);
    if (!existsSync(planFile)) throw new Error(`Issue plan does not exist: ${planFile}`);
    const plan = readIssuePlan(planFile);
    if (plan.frontmatter.status !== "approved") throw new Error(`Issue plan must have status approved before task generation.`);
    if (plan.frontmatter.issue !== issue.number || plan.frontmatter.source_url !== issue.url) throw new Error(`Issue plan metadata does not match issue #${issue.number}.`);
    const planned = parseTaskBreakdown(plan.body);
    validateTaskDependencies(planned);
    const { store, projectIdentifier } = createWorkflowStore(cwd);
    const existing = store.listTasks(projectIdentifier);
    const source = { provider: "github", repo, issue: issue.number, url: issue.url };
    const planPath = relative(cwd, planFile);
    if (existing.some((task) => task.metadata.plan_path === planPath)) throw new Error(`Implementation tasks already exist for GitHub issue ${repo}#${issue.number}.`);
    const matches = existing.filter((task) => githubTaskSourceMatches(task, source));
    if (matches.length > 1) throw new Error(`Multiple live tasks match GitHub issue ${repo}#${issue.number}; resolve the duplicate before generation.`);
    const ids = new Set(existing.map((task) => task.id));
    let next = Math.max(0, ...existing.map((task) => Number(task.id.match(/^task-(\d+)$/)?.[1] ?? 0))) + 1;
    const parent = matches[0]?.id ?? "";
    const idsForPlan = planned.map(() => `task-${String(next++).padStart(4, "0")}`);
    for (const id of idsForPlan) if (ids.has(id) && id !== matches[0]?.id) throw new Error(`Task ID already exists: ${id}`);
    const keyToId = new Map(planned.map((task, index) => [task.key, idsForPlan[index]]));
    const created: WorkflowTask[] = [];
    for (const task of dependencySafeOrder(planned)) {
      const index = planned.indexOf(task);
      const dependsOn = task.dependsOn.map((dependency) => keyToId.get(dependency) ?? dependency);
      const workflowTask: WorkflowTask = {
        projectIdentifier, id: idsForPlan[index], title: task.title, type: task.type, status: dependsOn.length ? "blocked" : "ready",
         assignedTo: task.assignedTo, priority: task.priority, parent, phase: task.phase, dependsOn, dependencyReady: !dependsOn.length,
        blockedBy: dependsOn, createdBy: "planner", createdOn: new Date().toISOString(), updatedOn: new Date().toISOString(), body: taskBrief(task),
        metadata: {
          phase: task.phase ?? "phase-21", issue: issue.number, plan_path: planPath, source,
          ...(isPlannerOwnedFinalReview(task) ? { planner_owned_final_review: true } : {})
        }
      };
      store.createTask(workflowTask);
      created.push(workflowTask);
    }
    if (readWorkspaceWorkflowConfig(cwd).workflow_store.provider === "markdown") {
      const taskDir = ".agent-rig/_shared/tasks";
      const taskFiles = created.map((task) => readdirSync(join(cwd, taskDir)).find((file) => file.startsWith(`${task.id}_`))).filter((file): file is string => Boolean(file));
      git(cwd, ["add", ...taskFiles.map((file) => `${taskDir}/${file}`)]);
      git(cwd, ["commit", "-m", `tasks: generate issue ${issue.number} plan`]);
    }
    console.log(`Generated ${created.length} implementation task(s) for GitHub issue #${issue.number}.`);
    console.log(`Manager loop: agent-rig loop --once`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function githubTaskSourceMatches(task: WorkflowTask, source: { provider: string; repo: string; issue: number; url: string }) {
  const value = task.metadata.source;
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).provider === source.provider && (value as Record<string, unknown>).repo === source.repo && Number((value as Record<string, unknown>).issue) === source.issue);
}

function isPlannerOwnedFinalReview(task: PlannedTask): boolean {
  return task.assignedTo.trim().toLowerCase() === "planner" && /\bfinal\s+integrated[-\s]+review\b/i.test(task.title);
}

export type WorktreeCheck = {
  allowed: string[];
  unexpected: string[];
};

const allowedRuntimePaths = [
  ".agent-rig/_shared/workflow.sqlite",
  ".agent-rig/_shared/workflow.sqlite-wal",
  ".agent-rig/_shared/workflow.sqlite-shm",
  ".agent-rig/_shared/loop.lock"
];

export function issueBranchName(issue: number, title: string): string {
  if (!Number.isInteger(issue) || issue < 1) throw new Error("Issue number must be a positive integer.");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "issue";
  return `issue/${issue}-${slug}`;
}

export function issueCompareUrl(repo: string, branch: string): string {
  return `https://github.com/${repo}/compare/main...${branch}`;
}

export function checkWorktreeStatus(status: string): WorktreeCheck {
  const allowed: string[] = [];
  const unexpected: string[] = [];
  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const path = line.slice(3);
    const normalized = path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
    if (isAllowedRuntimePath(normalized)) allowed.push(normalized);
    else unexpected.push(line);
  }
  return { allowed, unexpected };
}

function runIssueBranch(issueNumber: string | undefined, cwd: string) {
  if (!issueNumber || !/^\d+$/.test(issueNumber) || Number(issueNumber) < 1) return fail("Usage: agent-rig plan branch <number>");
  try {
    const repo = githubRepo(cwd);
    const issue = githubIssue(cwd, repo, Number(issueNumber));
    const branch = issueBranchName(issue.number, issue.title);
    const planFile = issuePlanPath(cwd, issue.number, issue.title);
    if (existsSync(planFile)) throw new Error(`Issue plan already exists: ${planFile}. Use \`agent-rig plan resume ${issue.number}\` for an unapproved plan.`);
    const worktree = checkWorktreeStatus(git(cwd, ["status", "--porcelain=v1"]));
    if (worktree.allowed.length) console.log(`Allowed AgentRig runtime artifacts: ${worktree.allowed.join(", ")}`);
    if (worktree.unexpected.length) {
      throw new Error(`Worktree is not clean. Resolve tracked changes or unexpected untracked files before creating ${branch}:\n${worktree.unexpected.join("\n")}`);
    }
    if (branchExists(cwd, branch)) throw new Error(`Branch already exists: ${branch}`);

    git(cwd, ["switch", "main"]);
    git(cwd, ["pull", "--ff-only", "origin", "main"]);
    git(cwd, ["switch", "-c", branch]);
    const createdAt = new Date().toISOString();
    writeIssuePlan(planFile, issuePlanFrontmatter(issue, branch, "draft", createdAt), issuePlanBody(issue));
    git(cwd, ["add", planFile]);
    git(cwd, ["commit", "-m", `docs: add issue ${issue.number} plan`]);
    git(cwd, ["push", "--set-upstream", "origin", branch]);
    writeIssuePlan(planFile, issuePlanFrontmatter(issue, branch, "pushed", createdAt), issuePlanBody(issue));
    git(cwd, ["add", planFile]);
    git(cwd, ["commit", "-m", `docs: mark issue ${issue.number} plan pushed`]);
    git(cwd, ["push"]);
    const compare = issueCompareUrl(repo, branch);
    console.log(`Created and pushed issue plan ${planFile}`);
    console.log(`Branch: ${branch}`);
    console.log(`Compare: ${compare}`);
    console.log("Review the plan, then use the explicit approval command before creating implementation tasks.");
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function runIssueResume(issueNumber: string | undefined, cwd: string) {
  if (!issueNumber || !/^\d+$/.test(issueNumber) || Number(issueNumber) < 1) return fail("Usage: agent-rig plan resume <number>");
  try {
    const repo = githubRepo(cwd);
    const issue = githubIssue(cwd, repo, Number(issueNumber));
    const branch = issueBranchName(issue.number, issue.title);
    const planFile = issuePlanPath(cwd, issue.number, issue.title);
    if (!existsSync(planFile)) throw new Error(`Issue plan does not exist: ${planFile}`);
    const plan = readIssuePlan(planFile);
    if (plan.frontmatter.issue !== issue.number || plan.frontmatter.branch !== branch) {
      throw new Error(`Issue plan metadata does not match issue #${issue.number}.`);
    }
    if (plan.frontmatter.status === "approved") {
      throw new Error(`Issue plan is already approved. Use the existing implementation tasks for issue #${issue.number}.`);
    }
    if (!branchExists(cwd, branch)) throw new Error(`Issue plan branch does not exist: ${branch}`);
    git(cwd, ["switch", branch]);
    git(cwd, ["push", "--set-upstream", "origin", branch]);
    if (plan.frontmatter.status !== "pushed") {
      writeIssuePlan(planFile, { ...plan.frontmatter, status: "pushed" }, plan.body);
      git(cwd, ["add", planFile]);
      git(cwd, ["commit", "-m", `docs: mark issue ${issue.number} plan pushed`]);
      git(cwd, ["push"]);
    }
    console.log(`Resumed issue plan ${planFile}`);
    console.log(`Branch: ${branch}`);
    console.log(`Compare: ${issueCompareUrl(repo, branch)}`);
    console.log("Review the plan, then use the explicit approval command before creating implementation tasks.");
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function runIssueApproval(issueNumber: string | undefined, cwd: string) {
  if (!issueNumber || !/^\d+$/.test(issueNumber) || Number(issueNumber) < 1) return fail("Usage: agent-rig plan approve <number>");
  try {
    const repo = githubRepo(cwd);
    const issue = githubIssue(cwd, repo, Number(issueNumber));
    const branch = issueBranchName(issue.number, issue.title);
    const planFile = issuePlanPath(cwd, issue.number, issue.title);
    if (!existsSync(planFile)) throw new Error(`Issue plan does not exist: ${planFile}`);
    const plan = readIssuePlan(planFile);
    if (plan.frontmatter.issue !== issue.number || plan.frontmatter.branch !== branch) {
      throw new Error(`Issue plan metadata does not match issue #${issue.number}.`);
    }
    if (plan.frontmatter.status === "approved") {
      throw new Error(`Issue plan is already approved. No approval commit was created.`);
    }
    if (plan.frontmatter.status !== "pushed") {
      throw new Error(`Issue plan must have status pushed before approval.`);
    }
    validateIssuePlanBody(plan.body, planFile);
    const currentBranch = git(cwd, ["branch", "--show-current"]).trim();
    if (currentBranch !== branch) throw new Error(`Current branch is ${currentBranch || "detached"}; switch to ${branch} before approval.`);
    if (!branchExists(cwd, branch)) throw new Error(`Issue plan branch does not exist: ${branch}`);

    const approvedAt = new Date().toISOString();
    writeIssuePlan(planFile, { ...plan.frontmatter, status: "approved", approved_at: approvedAt }, plan.body);
    git(cwd, ["add", planFile]);
    git(cwd, ["commit", "-m", `docs: approve issue ${issue.number} plan`]);
    git(cwd, ["push"]);
    console.log(`Approved issue plan ${planFile}`);
    console.log(`Branch: ${branch}`);
    console.log(`Approved at: ${approvedAt}`);
    console.log("The plan is approved. Create implementation tasks separately.");
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function validateIssuePlanBody(body: string, file: string) {
  const requiredSections = ["Goal", "Scope", "Decisions", "Implementation Plan", "Task Breakdown", "Review State"];
  const missing = requiredSections.filter((section) => !new RegExp(`^## ${section}$`, "m").test(body));
  if (missing.length) throw new Error(`Issue plan is incomplete: missing sections in ${file}: ${missing.join(", ")}`);
}

function issuePlanFrontmatter(issue: GithubIssue, branch: string, status: "draft" | "pushed", createdAt: string) {
  return {
    issue: issue.number,
    source_url: issue.url,
    branch,
    status,
    created_at: createdAt
  } as const;
}

function issuePlanBody(issue: GithubIssue): string {
  const comments = issue.comments?.length
    ? issue.comments.map((comment) => {
      const author = comment.author?.login || "unknown";
      const timestamp = comment.createdAt || "unknown time";
      return `- @${author} (${timestamp})\n\n  ${String(comment.body ?? "").trim() || "(empty comment)"}`;
    }).join("\n\n")
    : "(No issue comments.)";
  return `# Issue #${issue.number}: ${issue.title}\n\n## Goal\n\n${issue.body.trim() || "Define the goal from the issue request."}\n\n## Scope\n\n- Include only the work required by this issue.\n- Keep unrelated cleanup out of this plan.\n\n## Decisions\n\n- Record accepted decisions here before implementation starts.\n- Treat issue comments below as context until a decision is accepted.\n\n## Implementation Plan\n\n1. Confirm the design and acceptance criteria.\n2. Implement the smallest change that satisfies the approved plan.\n3. Run focused checks and record the results.\n\n## Task Breakdown\n\n- Create dependency-gated implementation tasks only after human approval.\n- Add one final integrated review task.\n\n## Review State\n\n- Status: waiting for human review.\n- Do not create implementation tasks before approval.\n\n## Issue Comments (Context Only)\n\n${comments}\n`;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr ?? "").trim();
    throw new Error(detail || `git ${args.join(" ")} failed.`);
  }
  return result.stdout;
}

function branchExists(cwd: string, branch: string): boolean {
  if (git(cwd, ["branch", "--list", branch]).trim()) return true;
  if (git(cwd, ["branch", "--remotes", "--list", `origin/${branch}`]).trim()) return true;
  const result = spawnSync("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr ?? "").trim();
    throw new Error(detail || `git ls-remote --heads origin refs/heads/${branch} failed.`);
  }
  return Boolean(result.stdout.trim());
}

function isAllowedRuntimePath(path: string): boolean {
  return allowedRuntimePaths.includes(path) || path.startsWith(".agent-rig/_shared/profile-backups/");
}

function githubRepo(cwd: string) {
  const data = ghJson(cwd, ["repo", "view", "--json", "nameWithOwner"]);
  if (!data || typeof data.nameWithOwner !== "string" || !data.nameWithOwner) throw new Error(githubSetupMessage());
  return data.nameWithOwner;
}

function githubIssues(cwd: string, repo: string) {
  const data = ghJson(cwd, ["issue", "list", "--repo", repo, "--state", "open", "--limit", "1000", "--json", "number,title,body,url,labels"]);
  if (!Array.isArray(data)) throw new Error("GitHub issue list returned unexpected data.");
  return data.map(normalizeIssue).filter((issue) => !issue.url.includes("/pull/"));
}

function githubIssue(cwd: string, repo: string, number: number) {
  const data = normalizeIssue(ghJson(cwd, ["issue", "view", String(number), "--repo", repo, "--json", "number,title,body,url,labels,comments"]));
  if (data.url.includes("/pull/")) throw new Error(`GitHub item #${number} is a pull request, not an issue.`);
  if (data.number !== number) throw new Error(`GitHub issue #${number} was not found.`);
  return data;
}

function normalizeIssue(value: unknown): GithubIssue {
  if (!value || typeof value !== "object") throw new Error("GitHub issue returned unexpected data.");
  const record = value as Record<string, unknown>;
  const labels = Array.isArray(record.labels) ? record.labels.map((label) => {
    if (label && typeof label === "object" && typeof (label as Record<string, unknown>).name === "string") return { name: String((label as Record<string, unknown>).name) };
    return { name: String(label ?? "") };
  }).filter((label) => label.name) : [];
  const comments = Array.isArray(record.comments) ? record.comments.filter((comment): comment is GithubComment => Boolean(comment && typeof comment === "object")) : undefined;
  return {
    number: Number(record.number),
    title: String(record.title ?? ""),
    body: String(record.body ?? ""),
    url: String(record.url ?? ""),
    labels,
    comments,
  };
}

function ghJson(cwd: string, args: string[]) {
  const result = spawnSync("gh", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(githubSetupMessage());
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub CLI returned invalid JSON.");
  }
}

function githubSetupMessage() {
  return "GitHub issue planning requires the GitHub CLI. Install gh and run `gh auth login`.";
}

function printIssueList(repo: string, issues: GithubIssue[]) {
  if (!issues.length) {
    console.log(`No open GitHub issues found in ${repo}.`);
    return;
  }
  console.log(`Open GitHub issues in ${repo}:`);
  for (const issue of issues) {
    const labels = issue.labels.length ? ` [${issue.labels.map((label) => label.name).join(", ")}]` : "";
    console.log(`#${issue.number} ${issue.title}${labels}\n  ${issue.url}`);
  }
  console.log("Select one issue explicitly with: agent-rig plan github-issue <number>");
}

function printIssue(repo: string, issue: GithubIssue) {
  console.log(`#${issue.number} ${issue.title}`);
  console.log(`Repository: ${repo}`);
  console.log(`URL: ${issue.url}`);
  console.log(`Labels: ${issue.labels.map((label) => label.name).join(", ") || "(none)"}`);
  console.log(`\n${issue.body.trim() || "(No issue body.)"}`);
  console.log("\nComments:");
  for (const comment of issue.comments ?? []) {
    const author = comment.author?.login || "unknown";
    const timestamp = comment.createdAt || "unknown time";
    console.log(`- @${author} (${timestamp})\n  ${String(comment.body ?? "").trim() || "(empty comment)"}`);
  }
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function fail(text: string) {
  console.error(text);
  return 1;
}
