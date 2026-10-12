import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parse } from "@iarna/toml";
import { requireWorkspace } from "../workspace/workspace.js";
import { requireAgent, validateTaskBrief } from "./commands.js";
import { createWorkflowStore } from "./store.js";
import { serializeTask } from "./markdown-store.js";
import { SQLiteWorkflowStore } from "./sqlite-store.js";
import type { WorkflowHandoff } from "./model.js";

const softLimit = 8000;

/** Assemble a complete child contract without launching an agent or writing state. */
export function buildTaskPrompt(cwd: string, agentName: string, taskId: string) {
  if (!["worker", "reviewer"].includes(agentName)) throw new Error("Prompt agent must be worker or reviewer");
  cwd = resolve(cwd);
  const root = requireWorkspace(cwd);
  const agent = requireAgent(root, agentName);
  if (agent.role !== agentName) throw new Error(`Agent ${agentName} must have role ${agentName}`);
  const dir = join(root, agentName);
  const configuration = requiredText(join(dir, "agent.toml"));
  const data = parse(configuration);
  const table = (typeof data.agent === "object" && data.agent !== null && !Array.isArray(data.agent) ? data.agent : data) as Record<string, unknown>;
  const instructions = roleAsset(dir, table.instructions, "instructions.md");
  const context = roleAsset(dir, table.context, "context.md");
  const sharedContext = requiredText(join(root, "_shared", "context.md"));
  const { store, projectIdentifier } = createWorkflowStore(cwd, { readonly: true });
  try {
    const task = store.getTask(projectIdentifier, taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.assignedTo !== "worker") throw new Error("Prompt task must be assigned to worker");
    const status = agentName === "worker" ? "in_progress" : "review";
    if (task.status !== status) throw new Error(`${agentName} prompt requires task status ${status}`);
    if (!task.dependencyReady) throw new Error(`Task dependencies are incomplete: ${task.blockedBy.join(", ")}`);
    validateTaskBrief(task.body);
    const handoffs = store.listHandoffs(projectIdentifier, taskId).sort((a, b) => a.sequence - b.sequence);
    const worker = latest(handoffs, "worker", "reviewer", "review");
    const reviewer = latest(handoffs, "reviewer", "worker", "changes_requested");
    const planner = latest(handoffs, "planner", "worker", "changes_requested");
    if (agentName === "reviewer" && !worker) throw new Error("Reviewer prompt requires a worker -> reviewer review handoff");
    if (agentName === "reviewer" && Math.max(reviewer?.sequence ?? 0, planner?.sequence ?? 0) > worker!.sequence) {
      throw new Error("Reviewer prompt requires a new worker handoff after requested changes");
    }
    const selected = agentName === "reviewer" ? [worker] : [worker, reviewer, planner];
    const relevant = selected.filter((item): item is WorkflowHandoff => Boolean(item)).sort((a, b) => a.sequence - b.sequence);
    for (const handoff of relevant) if (!handoff.message.trim()) throw new Error(`Required handoff #${handoff.sequence} is empty`);
    const prompt = [
      "# AgentRig Task Prompt",
      `Agent: ${agent.name}\nRole: ${agent.role}\nTask ID: ${task.id}\nProject: ${projectIdentifier}\nRepository root: ${cwd}`,
      "Work in this repository. Worker and reviewer use the same workspace.",
      "# Agent Instructions",
      instructions,
      "# Agent Context",
      context,
      "# Agent Configuration",
      "```toml\n" + configuration + "\n```",
      "# Shared Context",
      sharedContext,
      "# Task Brief And Acceptance Criteria",
      serializeTask(task).trim(),
      "# Latest Relevant Handoffs",
      relevant.length ? relevant.map((item) => `## #${item.sequence} ${item.sender} -> ${item.recipient} (${item.status})\n${item.message}`).join("\n\n") : "No relevant handoffs.",
      "# Scope And Required Checks",
      agentName === "reviewer"
        ? "Inspect the task, worker handoff, project docs, and current diff below. Run focused acceptance checks. Do not edit implementation files or repository notes."
        : "Implement only the task scope. For repairs, read the worker and changes_requested handoffs above. Run focused checks from the implementation plan and acceptance criteria. Report exact commands and results.",
      ...(agentName === "reviewer" ? ["# Current Diff", reviewDiff(cwd)] : []),
      "# Local Skill And Tool Precedence",
      `Use .agent-rig/${agentName}/skills/ before .agent-rig/_shared/skills/ and global skills. Check .agent-rig/${agentName}/tools/ before .agent-rig/_shared/tools/. Local role instructions take precedence over general project guidance.`,
      "# Forbidden Mutations",
      "The planner is the only workflow-state writer. Do not mutate tasks, dependencies, canonical handoffs, or workflow-store files. Do not select or claim tasks, launch agents, start nested loops, commit, or push. Return proposed handoff content to the planner for recording and routing.",
      "# Required Handoff Output",
      "Return Markdown with these six fields:",
      agentName === "worker"
        ? "- **Decision:** review or blocked.\n- **Recipient:** reviewer for review; planner for blocked."
        : "- **Decision:** approved, changes_requested, or blocked.\n- **Recipient:** planner for approved or blocked; worker for changes_requested.",
      "- **Summary:** State the result.\n- **Findings:** Give actionable findings with file and line references, or None.\n- **Evidence:** Give exact check commands, results, and checks that could not run.\n- **Requested action:** State the next action for the recipient."
    ].join("\n\n") + "\n";
    const estimatedTokens = Math.ceil(Buffer.byteLength(prompt, "utf8") / 4);
    if (estimatedTokens > softLimit) throw new Error(`Prompt exceeds the ${softLimit}-token soft limit: approximately ${estimatedTokens} tokens (UTF-8 bytes / 4). Reduce required inputs before retrying; no content was truncated.`);
    return { prompt, estimatedTokens };
  } finally {
    if (store instanceof SQLiteWorkflowStore) store.close();
  }
}

function requiredText(file: string) {
  const text = readFileSync(file, "utf8").trim();
  if (!text) throw new Error(`Required prompt input is empty: ${file}`);
  return text;
}

function roleAsset(dir: string, configured: unknown, fallback: string) {
  if (configured !== undefined && (typeof configured !== "string" || !configured.trim())) throw new Error(`Invalid role asset: ${fallback}`);
  const file = resolve(dir, typeof configured === "string" ? configured : fallback);
  const rel = relative(dir, file);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Role asset must be inside ${dir}`);
  return requiredText(file);
}

function latest(handoffs: WorkflowHandoff[], sender: string, recipient: string, status: string) {
  return handoffs.filter((item) => item.sender === sender && item.recipient === recipient && item.status === status).at(-1);
}

function reviewDiff(cwd: string) {
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    if (result.error || result.status !== 0) throw new Error(`Cannot read review diff: ${result.error?.message ?? result.stderr.trim()}`);
    return result.stdout;
  };
  const staged = git(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--"]);
  const unstaged = git(["diff", "--no-ext-diff", "--no-textconv", "--"]);
  const files = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  const untracked = files.map((file) => {
    const content = readFileSync(join(cwd, file), "utf8");
    if (content.includes("\0")) throw new Error(`Cannot include binary untracked file in review prompt: ${file}`);
    return `## Untracked file: ${file}\n${content}`;
  });
  return [
    "## Staged Diff (git diff --cached)", staged || "No staged changes.",
    "## Unstaged Diff (git diff)", unstaged || "No unstaged changes.",
    "## Untracked File Contents", ...(untracked.length ? untracked : ["No untracked files."])
  ].join("\n\n");
}
