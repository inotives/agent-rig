import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Agent, readAgents, requireWorkspace, validSlug } from "../workspace/workspace.js";
import { createWorkflowStore, MarkdownWorkflowStore, SQLiteWorkflowStore, parseHandoff, readWorkspaceWorkflowConfig, resolveTaskPhase, serializeTask, validateNewHandoff, WorkflowHandoff, WorkflowStore, WorkflowTask } from "./index.js";
import { replaceFrontmatter } from "./migration.js";

export type SharedTask = {
  id: string;
  status: string;
  type: string;
  phase: string;
  title: string;
  assigned_to: string;
  priority: string;
  depends_on: string[];
  dependency_count: number;
  dependency_ready: boolean;
  blocked_by: string[];
  path: string;
  file: string;
  meta: Record<string, unknown>;
  body: string;
  record: Record<string, unknown>;
  workflow: WorkflowTask;
  store: WorkflowStore;
  projectIdentifier: string;
  cwd: string;
};

export type LoopRunResult = {
  exitStatus: number;
  stdout: string;
  stderr: string;
  error: string;
  failureSummary: string;
  runDir: string;
};

type LoopLauncher = (root: string, cwd: string, agent: Agent, task: SharedTask) => LoopRunResult;

const loopLaunchers: Record<string, LoopLauncher> = {
  codex: runCodexLoop,
  opencode: runOpenCodeLoop,
  claude: runClaudeLoop
};

const taskStatuses = new Set(["todo", "ready", "in_progress", "blocked", "review", "done"]);
const taskTypes = new Set(["task", "bug", "story", "epic", "chore", "research", "doc"]);
const priorities = new Set(["low", "normal", "high"]);
const unblockStatuses = new Set(["todo", "ready", "in_progress"]);
const githubTypeLabels = new Map([
  ["bug", "bug"],
  ["documentation", "doc"],
  ["docs", "doc"],
  ["research", "research"],
  ["chore", "chore"],
  ["epic", "epic"],
  ["story", "story"]
]);

export function runTasks(args: string[], cwd: string) {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h" || command === "help") return tasksHelp();
  if (command === "create") return tasksCreate(rest, cwd);
  if (command === "mark-final-review") return tasksMarkFinalReview(rest, cwd);
  if (command === "show") return tasksShow(rest, cwd);
  if (command === "update-body") return tasksUpdateBody(rest, cwd);
  if (command === "set-status") return tasksSetStatus(rest, cwd);
  if (command === "assign") return tasksAssign(rest, cwd);
  if (command === "set-type") return tasksSetType(rest, cwd);
  if (command === "set-phase") return tasksSetPhase(rest, cwd);
  if (command === "block") return tasksBlock(rest, cwd);
  if (command === "unblock") return tasksUnblock(rest, cwd);
  if (command === "done") return tasksDone(rest, cwd);
  if (command === "handoff") return tasksHandoff(rest, cwd);
  if (command === "next") return tasksNext(rest, cwd);
  if (command === "sync") return tasksSync(rest, cwd);
  return tasksList(args, cwd);
}

function tasksHelp() {
  console.log(`Usage: agent-rig tasks [command] [options]

Commands:
  create <title>              Create a shared workflow task with --body-file
  mark-final-review <task-id> Mark an eligible planner-owned final review
  show <task-id>              Print the task as Markdown
  update-body <task-id>       Replace the full task brief with --body-file
  set-status <task-id> <status> [--admin-override]
  assign <task-id> <agent-name>
  set-type <task-id> <type>
  set-phase <task-id> <phase>
  block <task-id> --reason <reason>
  unblock <task-id> --status <todo|ready|in_progress>
  done <task-id> [--message <message>] [--admin-override]
  handoff <task-id> --sender <role> --recipient <role> --status <status> --message <text>
  handoff <task-id> --source-file <path>  Append late source evidence with its original timestamp
  next [--agent <agent-name>] [--json] [--claim]
  sync github [--label <label>] [--limit <number>] [--dry-run] [--json]

List options:
  --status <status>           Filter listed tasks
  --json                      Emit JSON

Statuses: todo, ready, in_progress, blocked, review, done
Types: task, bug, story, epic, chore, research, doc`);
  return 0;
}

function tasksCreate(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const title = args[0];
    if (!title || title.startsWith("--")) return fail("Usage: agent-rig tasks create <title> --body-file <path> [--assigned-to <agent>] [--status <status>] [--type <type>] [--priority <priority>] [--phase <phase>] [--parent <task-id>] [--depends-on <task-id[,task-id]>] [--created-by <name>]");

    const allowed = new Set(["--body-file", "--assigned-to", "--status", "--type", "--priority", "--phase", "--parent", "--depends-on", "--created-by"]);
    const options = parseOptions(args.slice(1), allowed);
    const bodyFile = option(options, "--body-file");
    if (!bodyFile) return fail("Task creation requires --body-file with Context, Goal, Scope, Planner Notes, Implementation Plan, and Acceptance Criteria sections.");
    const body = readTaskBrief(resolve(cwd, bodyFile));
    const status = option(options, "--status") ?? "todo";
    const type = option(options, "--type") ?? "task";
    const priority = option(options, "--priority") ?? "normal";
    if (!taskStatuses.has(status)) return fail(`Invalid status: ${status}`);
    if (status === "done") return fail("Create the task before completing it; completion requires worker and reviewer handoffs");
    if (!taskTypes.has(type)) return fail(`Invalid type: ${type}`);
    if (!priorities.has(priority)) return fail(`Invalid priority: ${priority}`);

    const today = dateStamp(new Date());
    const { store, projectIdentifier } = createWorkflowStore(cwd);
    const requestedId = readWorkspaceProvider(cwd) === "markdown" ? nextSharedTaskId(sharedTasksDir(root)) : "";
    const created = store.createTask({
      projectIdentifier,
      id: requestedId,
      title,
      type,
      status,
      assignedTo: option(options, "--assigned-to") ?? "",
      createdBy: option(options, "--created-by") ?? "human",
      createdOn: today,
      updatedOn: today,
      priority,
      phase: option(options, "--phase"),
      parent: option(options, "--parent") ?? "",
      dependsOn: dependsOn(options),
      dependencyReady: true,
      blockedBy: [],
      body,
      metadata: {}
    });
    console.log(`Created ${created.id}${readWorkspaceProvider(cwd) === "markdown" ? `: ${relative(cwd, join(sharedTasksDir(root), `${created.id}_${slug(title)}.md`))}` : ""}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksMarkFinalReview(args: string[], cwd: string) {
  try {
    const [id] = args;
    if (!id || args.length !== 1) return fail("Usage: agent-rig tasks mark-final-review <task-id>");
    const task = requireSharedTask(cwd, id);
    if (task.workflow.assignedTo !== "planner" || !/\bfinal\b.*\breview\b/i.test(task.workflow.title)) {
      return fail("Only tasks assigned to planner with a final review title can be marked");
    }
    task.store.updateTask(task.projectIdentifier, id, {
      metadata: { ...task.workflow.metadata, planner_owned_final_review: true }
    });
    console.log(`Marked ${id} as planner-owned final review`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksUpdateBody(args: string[], cwd: string) {
  try {
    const id = args[0];
    if (!id) return fail("Usage: agent-rig tasks update-body <task-id> --body-file <path>");
    const options = parseOptions(args.slice(1), new Set(["--body-file"]));
    const bodyFile = option(options, "--body-file");
    if (!bodyFile || args.length !== 3) return fail("Usage: agent-rig tasks update-body <task-id> --body-file <path>");
    const task = requireSharedTask(cwd, id);
    const body = readTaskBrief(resolve(cwd, bodyFile));
    updateSharedTask(task, { updated_on: dateStamp(new Date()) }, body);
    console.log(`Updated ${id} task brief.`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksList(args: string[], cwd: string) {
  try {
    const json = args.includes("--json");
    const allowed = new Set(["--status", "--json"]);
    const options = parseOptions(args, allowed, new Set(["--json"]));
    const status = option(options, "--status");
    if (status && !taskStatuses.has(status)) return fail(`Invalid status: ${status}`);

    const tasks = readSharedTasks(requireWorkspace(cwd), cwd).filter((task) => !status || task.status === status);
    if (json) console.log(JSON.stringify(tasks.map((task) => task.record), null, 2));
    else {
      console.log("id\tstatus\ttype\tassigned_to\tpriority\tdepends\tready\ttitle");
      for (const task of tasks) console.log(`${task.id}\t${task.status}\t${task.type}\t${task.assigned_to || "-"}\t${task.priority || "normal"}\t${task.dependency_count}\t${task.dependency_ready ? "yes" : "no"}\t${task.title}`);
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksShow(args: string[], cwd: string) {
  try {
    const id = args[0];
    if (!id || args.length !== 1) return fail("Usage: agent-rig tasks show <task-id>");
    const task = readSharedTasks(requireWorkspace(cwd), cwd).find((item) => item.id === id);
    if (!task) return fail(`Task not found: ${id}`);
    process.stdout.write(serializeTask(task.workflow));
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksSetStatus(args: string[], cwd: string) {
  try {
    const [id, status] = args;
    if (!id || !status) return fail("Usage: agent-rig tasks set-status <task-id> <status> [--admin-override]");
    const options = parseOptions(args.slice(2), new Set(["--admin-override"]), new Set(["--admin-override"]));
    if (!taskStatuses.has(status)) return fail(`Invalid status: ${status}`);
    if (options.has("--admin-override") && status !== "done") return fail("--admin-override applies only to completion");
    const task = requireSharedTask(cwd, id);
    if (status === "done" && process.env.AGENT_RIG_LOOP_REVIEW_TASK === id) {
      updateSharedTask(task, { pending_completion: true, updated_on: dateStamp(new Date()) });
      console.log(`Pending reviewer completion for ${id}`);
      return 0;
    }
    // This is the agent-facing backend-neutral mutation command. Loop
    // transitions pair completion with a handoff; direct task maintenance
    // must remain usable with both workflow providers.
    if (status === "done") task.store.completeTask(task.projectIdentifier, id, options.has("--admin-override"));
    updateSharedTask(task, { status, pending_completion: undefined, updated_on: dateStamp(new Date()) });
    console.log(`Updated ${id}: status=${status}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksAssign(args: string[], cwd: string) {
  try {
    const [id, agentName] = args;
    if (!id || !agentName || args.length !== 2) return fail("Usage: agent-rig tasks assign <task-id> <agent-name>");
    const root = requireWorkspace(cwd);
    requireAgent(root, agentName);
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, { assigned_to: agentName, updated_on: dateStamp(new Date()) });
    console.log(`Updated ${id}: assigned_to=${agentName}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksSetType(args: string[], cwd: string) {
  try {
    const [id, type] = args;
    if (!id || !type || args.length !== 2) return fail("Usage: agent-rig tasks set-type <task-id> <type>");
    if (!taskTypes.has(type)) return fail(`Invalid type: ${type}`);
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, { type, updated_on: dateStamp(new Date()) });
    console.log(`Updated ${id}: type=${type}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksSetPhase(args: string[], cwd: string) {
  try {
    const [id, phase] = args;
    if (!id || !phase || args.length !== 2) return fail("Usage: agent-rig tasks set-phase <task-id> <phase>");
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, { phase, updated_on: dateStamp(new Date()) });
    console.log(`Updated ${id}: phase=${phase}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksBlock(args: string[], cwd: string) {
  try {
    const id = args[0];
    if (!id) return fail("Usage: agent-rig tasks block <task-id> --reason <reason>");
    const options = parseOptions(args.slice(1), new Set(["--reason"]));
    const reason = option(options, "--reason");
    if (!reason) return fail("Usage: agent-rig tasks block <task-id> --reason <reason>");
    const today = dateStamp(new Date());
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, {
      status: "blocked",
      blocked_reason: reason,
      blocked_on: today,
      updated_on: today
    }, appendBlocker(task.body, today, reason));
    console.log(`Blocked ${id}: ${reason}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksUnblock(args: string[], cwd: string) {
  try {
    const id = args[0];
    if (!id) return fail("Usage: agent-rig tasks unblock <task-id> --status <todo|ready|in_progress>");
    const options = parseOptions(args.slice(1), new Set(["--status"]));
    const status = option(options, "--status");
    if (!status || !unblockStatuses.has(status)) return fail("Usage: agent-rig tasks unblock <task-id> --status <todo|ready|in_progress>");
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, { status, blocked_reason: undefined, blocked_on: undefined, updated_on: dateStamp(new Date()) });
    console.log(`Unblocked ${id}: status=${status}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksDone(args: string[], cwd: string) {
  try {
    const id = args[0];
    if (!id) return fail("Usage: agent-rig tasks done <task-id> [--message <message>] [--admin-override]");
    const options = parseOptions(args.slice(1), new Set(["--message", "--admin-override"]), new Set(["--admin-override"]));
    const updates: Record<string, unknown> = { status: "done", updated_on: dateStamp(new Date()) };
    const msg = option(options, "--message");
    if (msg) updates.message = msg;
    const task = requireSharedTask(cwd, id);
    if (process.env.AGENT_RIG_LOOP_REVIEW_TASK === id) {
      updateSharedTask(task, { ...updates, status: "review", pending_completion: true });
      console.log(`Recorded reviewer approval for ${id}; planner completion is required.`);
      return 0;
    }
    task.store.completeTask(task.projectIdentifier, id, options.has("--admin-override"));
    updateSharedTask(task, updates);
    console.log(`Done ${id}${msg ? `: ${msg}` : ""}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksHandoff(args: string[], cwd: string) {
  try {
    const id = args[0];
    if (!id) return fail("Usage: agent-rig tasks handoff <task-id> --sender <role> --recipient <role> --status <status> --message <text> | --source-file <path>");
    const options = parseOptions(args.slice(1), new Set(["--sender", "--recipient", "--status", "--message", "--source-file"]));
    const task = requireSharedTask(cwd, id);
    const source = option(options, "--source-file");
    let handoff: WorkflowHandoff;
    if (source) {
      if (!(task.store instanceof SQLiteWorkflowStore)) return fail("--source-file requires the SQLite workflow store");
      const file = resolve(cwd, source);
      if (realpathSync(dirname(file)) !== realpathSync(join(cwd, ".agent-rig", "_shared", "handoff_logs"))) return fail("Handoff source must be in .agent-rig/_shared/handoff_logs/");
      const raw = readFileSync(file, "utf8");
      if (/^storage_status:\s*migrated\s*$/m.test(raw)) return fail(`Handoff already imported: ${basename(file)}`);
      handoff = parseHandoff(file, basename(file));
      if (handoff.taskId !== id) return fail(`Handoff task does not match ${id}`);
      handoff.projectIdentifier = task.projectIdentifier;
      const previous = task.store.listHandoffs(task.projectIdentifier, id).at(-1);
      const sourceCreatedAt = handoff.createdAt;
      handoff.createdAt = new Date().toISOString();
      if (sourceCreatedAt) {
        handoff.metadata.source_created_at = sourceCreatedAt;
        if (previous?.createdAt && new Date(sourceCreatedAt) < new Date(previous.createdAt)) handoff.metadata.source_order_conflict = true;
      }
    } else {
      const sender = option(options, "--sender");
      const recipient = option(options, "--recipient");
      const status = option(options, "--status");
      const message = option(options, "--message");
      if (!sender || !recipient || !status || !message) return fail("Handoff requires --sender, --recipient, --status, and --message");
      handoff = { projectIdentifier: task.projectIdentifier, taskId: id, sequence: 0, sender, recipient, status, message, createdAt: new Date().toISOString(), metadata: {} };
    }
    handoff.sequence = task.store.listHandoffs(task.projectIdentifier, id).length + 1;
    if (!source) validateNewHandoff(handoff);
    task.store.addHandoff(handoff);
    if (source) replaceFrontmatter(resolve(cwd, source), new Date().toISOString());
    console.log(`Recorded handoff ${id} #${handoff.sequence}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksNext(args: string[], cwd: string) {
  try {
    const json = args.includes("--json");
    const claim = args.includes("--claim");
    const options = parseOptions(args, new Set(["--agent", "--json", "--claim"]), new Set(["--json", "--claim"]));
    const root = requireWorkspace(cwd);
    const agentName = option(options, "--agent");
    if (agentName) requireAgent(root, agentName);
    const skipped: string[] = [];
    const task = nextActionableTask(readSharedTasks(root, cwd), agentName, skipped);

    for (const warning of skipped) console.warn(warning);
    if (!task) {
      if (json) console.log("null");
      else console.log("No ready task.");
      return 0;
    }

    if (claim) {
      updateSharedTask(task, { status: "in_progress", updated_on: dateStamp(new Date()) });
      task.status = "in_progress";
      task.record.status = "in_progress";
    }

    if (json) console.log(JSON.stringify(task.record, null, 2));
    else console.log(`${task.id}\t${task.status}\t${task.type}\t${task.assigned_to}\t${task.title}`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksSync(args: string[], cwd: string) {
  try {
    const [provider, ...rest] = args;
    if (provider !== "github") return fail("Usage: agent-rig tasks sync github [--label <label>] [--limit <number>] [--dry-run] [--json]");
    const options = parseOptions(rest, new Set(["--label", "--limit", "--dry-run", "--json"]), new Set(["--dry-run", "--json"]));
    const limitText = option(options, "--limit") ?? "100";
    const limit = Number(limitText);
    if (!Number.isInteger(limit) || limit < 1) return fail(`Invalid limit: ${limitText}`);

    const root = requireWorkspace(cwd);
    const { store, projectIdentifier } = createWorkflowStore(cwd);
    const workflowProvider = readWorkspaceProvider(cwd);

    const repo = githubRepo(cwd);
    const issues = githubIssues(cwd, limit, option(options, "--label"));
    const existing = readSharedTasks(root, cwd);
    const dryRun = options.has("--dry-run");
    const json = options.has("--json");
    const today = dateStamp(new Date());
    const imported: Record<string, unknown>[] = [];
    const skipped: Record<string, unknown>[] = [];
    let nextNumber = existing.reduce((max, task) => Math.max(max, Number(task.id.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1;

    for (const issue of issues) {
      const duplicate = existing.find((task) => githubSourceMatches(task.meta.source, repo, issue.number));
      if (duplicate) {
        skipped.push({ issue: issue.number, task: duplicate.id });
        continue;
      }

       const id = `task-${String(nextNumber++).padStart(4, "0")}`;
      const labels = issue.labels.map((label) => label.name);
       const metadata = { source: {
          provider: "github",
          repo,
          issue: issue.number,
          url: issue.url,
          state_at_import: "open",
          imported_at: today,
          labels
         } };
       if (!dryRun) store.createTask({ projectIdentifier, id, title: issue.title, type: githubIssueType(labels), status: "todo", assignedTo: "", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "github-sync", createdOn: today, updatedOn: today, body: githubIssueTaskBody(issue), metadata });
       imported.push({ issue: issue.number, task: id, ...(workflowProvider === "markdown" ? { path: relative(cwd, join(sharedTasksDir(root), `${id}_${slug(issue.title)}.md`)) } : {}) });
    }

    if (json) console.log(JSON.stringify({ repo, imported, skipped_existing: skipped, dry_run: dryRun, limit }, null, 2));
    else {
      console.log(`GitHub repo: ${repo}`);
      console.log(`Dry run: ${dryRun}`);
      for (const item of imported) console.log(`${dryRun ? "Would create" : "Created"} ${item.task} from issue #${item.issue}: ${issues.find((issue) => issue.number === item.issue)?.title ?? ""}`);
      for (const item of skipped) console.log(`Skipped existing issue #${item.issue}: ${item.task}`);
      console.log(`Imported: ${imported.length}`);
      console.log(`Skipped existing: ${skipped.length}`);
      console.log(`Limit: ${limit}`);
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

export { runLoop, runWatch } from "./loop.js";

export function finish(root: string, agent: Agent, task: SharedTask, runDir: string, runId: string, status: "done" | "blocked", msg: string, administrativeOverride = false) {
  const finished = new Date().toISOString();
  updateSharedTaskAndHandoff(task, { status, run_id: runId, finished_at: finished, message: msg, updated_on: dateStamp(new Date()) }, agent, runId, status, msg, administrativeOverride);
  writeJson(join(runDir, "result.json"), { status, message: msg, handoff: handoffFileName(agent, runId, new Date()) });
  if (status === "blocked") addBlocker(root, agent.name, msg);
  updateAgentSession(root, agent, status === "done" ? "idle" : "blocked");
}

export function assemblePrompt(root: string, agent: Agent, task: SharedTask) {
  const agentInstructionsPath = join(".agent-rig", agent.name, "instructions.md");
  const agentContextPath = join(".agent-rig", agent.name, "context.md");
  const sharedContextPath = join(".agent-rig", "_shared", "context.md");
  const agentSkillsPath = join(".agent-rig", agent.name, "skills");
  const sharedSkillsPath = join(".agent-rig", "_shared", "skills");
  const agentToolsPath = join(".agent-rig", agent.name, "tools");
  const sharedToolsPath = join(".agent-rig", "_shared", "tools");
  const phaseDocPath = inferPhaseDocPath(task);
  const provider = readWorkspaceWorkflowConfig(task.cwd).workflow_store.provider;
  const cli = process.argv[1]?.endsWith("/dist/index.js")
    ? `"${process.execPath}" "${resolve(process.argv[1])}"`
    : "agent-rig";
  const recentHandoffs = task.store.listHandoffs(task.projectIdentifier, task.id).slice(-6);
  return [
    "# AgentRig Loop Prompt",
    `Agent: ${agent.name}`,
    `Role: ${agent.role}`,
    `Task ID: ${task.id}`,
    `Project: ${task.projectIdentifier}`,
    `Active workflow provider: ${provider}`,
    `AgentRig command for this run: ${cli}`,
    "Use that command for task status and handoff mutations. In SQLite mode, never edit migrated task or handoff Markdown; it is historical reference only.",
    phaseDocPath ? `Phase doc: ${phaseDocPath}` : "Phase doc: not inferred",
    "",
    "# Required Task Outcome",
    lifecycleInstructions(agent.role),
    "",
    "# Skill And Tool Precedence",
    `1. Read applicable skills from \`${agentSkillsPath}/\` first.`,
    `2. Then read applicable shared skills from \`${sharedSkillsPath}/\`.`,
    "3. Use global Codex skills only when no AgentRig-local skill applies.",
    `4. Check \`${agentToolsPath}/\` before \`${sharedToolsPath}/\`.`,
    "5. Do not assume a project-local tool exists unless an actual file or script exists there.",
    "6. Do not treat AgentRig local tools as native Codex tools in this run.",
    "",
    "# Shared Context File",
    sharedContextPath,
    "",
    readFileSync(join(root, "_shared", "context.md"), "utf8").trim(),
    "",
    "# Agent Instructions File",
    agentInstructionsPath,
    "",
    readFileSync(join(root, agent.name, "instructions.md"), "utf8").trim(),
    "",
    "# Agent Context File",
    agentContextPath,
    "",
    readFileSync(join(root, agent.name, "context.md"), "utf8").trim(),
    "",
    "# Recent Task Handoffs (oldest to newest)",
    recentHandoffs.length ? recentHandoffs.map((handoff) =>
      `## #${handoff.sequence} ${handoff.sender} → ${handoff.recipient} (${handoff.status}, ${handoff.createdAt})\n${handoff.message.trim()}`
    ).join("\n\n") : "No handoffs recorded yet.",
    "",
    "# Task",
    `Project: ${task.projectIdentifier}`,
    `Task ID: ${task.id}`,
    "",
    task.body.trim()
  ].join("\n") + "\n";
}

export function buildLoopPrompt(cwd: string, agentName: string, taskId: string) {
  const root = requireWorkspace(cwd);
  const agent = requireAgent(root, agentName);
  const task = requireSharedTask(cwd, taskId);
  return assemblePrompt(root, agent, task);
}

export function runLoopAgent(root: string, cwd: string, agent: Agent, task: SharedTask): LoopRunResult {
  const launcher = loopLaunchers[agent.tool];
  if (!launcher) throw new Error(`Unsupported loop tool "${agent.tool}" for ${agent.role} agent "${agent.name}". Supported tools: codex, opencode, claude.`);
  return launcher(root, cwd, agent, task);
}

function runCodexLoop(root: string, cwd: string, agent: Agent, task: SharedTask): LoopRunResult {
  const started = new Date();
  const runId = nextRunId(join(root, agent.name, "runs"), task.id, started);
  const runDir = join(root, agent.name, "runs", runId);
  const prompt = assemblePrompt(root, agent, task);
  const lastMessagePath = join(runDir, "last-message.md");
  const baseArgs = ["exec", "--ephemeral", "--ignore-user-config", "-C", cwd, "--sandbox", "workspace-write"];

  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "prompt.md"), prompt, "utf8");
  if (!existsSync(lastMessagePath)) writeFileSync(lastMessagePath, "", "utf8");

  const preferredArgs = [...baseArgs, "--output-last-message", lastMessagePath, "-"];
  const fallbackArgs = [...baseArgs, "-"];
  let args = preferredArgs;
  const codexRuntime = codexLoopEnvironment(agent, task);
  const env = codexRuntime.env;
  let result = spawnSync("codex", args, { cwd, input: prompt, encoding: "utf8", env });
  if (codexDoesNotSupportLastMessage(result)) {
    args = fallbackArgs;
    result = spawnSync("codex", args, { cwd, input: prompt, encoding: "utf8", env });
  }
  try { rmSync(codexRuntime.home, { recursive: true, force: true }); } catch { /* preserve the child result */ }
  if (!existsSync(lastMessagePath)) writeFileSync(lastMessagePath, "", "utf8");

  const finalTask = requireSharedTask(cwd, task.id);
  const exitStatus = result.status ?? (result.error ? 1 : 0);
  const stdout = spawnText(result.stdout);
  const stderr = spawnText(result.stderr);
  const error = result.error ? message(result.error) : "";
  const failureSummary = exitStatus === 0 ? "" : loopFailureMessage(agent.tool, exitStatus, agent.name, agent.role, task.id, stderr, error);
  writeJson(join(runDir, "result.json"), loopResultRecord(agent, task.id, args, exitStatus, started, finalTask.status, stdout, stderr, error, failureSummary));
  return { exitStatus, stdout, stderr, error, failureSummary, runDir };
}

function codexLoopEnvironment(agent: Agent, task: SharedTask) {
  const runtimeRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
  const home = mkdtempSync(join(runtimeRoot, "agent-rig-codex-home-"));
  const configuredCodexHome = process.env.CODEX_HOME || (process.env.HOME ? join(process.env.HOME, ".codex") : "");
  const codexHome = join(home, ".codex");
  mkdirSync(codexHome);
  const authFile = configuredCodexHome ? join(configuredCodexHome, "auth.json") : "";
  if (authFile && existsSync(authFile)) {
    try {
      symlinkSync(authFile, join(codexHome, "auth.json"));
    } catch {
      // Let Codex report an authentication failure if the link cannot be created.
    }
  }
  const env = { ...process.env };
  delete env.CODEX_HOME;
  return { env: { ...env, HOME: home, AGENT_RIG_ROLE: agent.role, ...(agent.role === "reviewer" ? { AGENT_RIG_LOOP_REVIEW_TASK: task.id } : {}) }, home };
}

function runOpenCodeLoop(root: string, cwd: string, agent: Agent, task: SharedTask): LoopRunResult {
  const started = new Date();
  const runId = nextRunId(join(root, agent.name, "runs"), task.id, started);
  const runDir = join(root, agent.name, "runs", runId);
  const prompt = assemblePrompt(root, agent, task);
  const promptPath = join(runDir, "prompt.md");
  const lastMessagePath = join(runDir, "last-message.md");
  const args = [
    "run",
    "--dir",
    cwd,
    "--file",
    promptPath,
    "--title",
    `AgentRig ${agent.role} ${task.id}`,
    "Read the attached AgentRig loop prompt and follow it exactly."
  ];

  mkdirSync(runDir, { recursive: true });
  writeFileSync(promptPath, prompt, "utf8");
  const result = spawnSync("opencode", args, { cwd, encoding: "utf8", env: { ...process.env, AGENT_RIG_ROLE: agent.role, ...(agent.role === "reviewer" ? { AGENT_RIG_LOOP_REVIEW_TASK: task.id } : {}) } });
  const finalTask = requireSharedTask(cwd, task.id);
  const exitStatus = result.status ?? (result.error ? 1 : 0);
  const stdout = spawnText(result.stdout);
  const stderr = spawnText(result.stderr);
  const error = result.error ? message(result.error) : "";
  writeFileSync(lastMessagePath, stdout, "utf8");
  const failureSummary = exitStatus === 0 ? "" : loopFailureMessage(agent.tool, exitStatus, agent.name, agent.role, task.id, stderr, error);
  writeJson(join(runDir, "result.json"), loopResultRecord(agent, task.id, args, exitStatus, started, finalTask.status, stdout, stderr, error, failureSummary));
  return { exitStatus, stdout, stderr, error, failureSummary, runDir };
}

function runClaudeLoop(root: string, cwd: string, agent: Agent, task: SharedTask): LoopRunResult {
  const started = new Date();
  const runId = nextRunId(join(root, agent.name, "runs"), task.id, started);
  const runDir = join(root, agent.name, "runs", runId);
  const prompt = assemblePrompt(root, agent, task);
  const args = ["-p"];

  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "prompt.md"), prompt, "utf8");
  const result = spawnSync("claude", args, { cwd, input: prompt, encoding: "utf8", env: { ...process.env, AGENT_RIG_ROLE: agent.role, ...(agent.role === "reviewer" ? { AGENT_RIG_LOOP_REVIEW_TASK: task.id } : {}) } });
  const finalTask = requireSharedTask(cwd, task.id);
  const exitStatus = result.status ?? (result.error ? 1 : 0);
  const stdout = spawnText(result.stdout);
  const stderr = spawnText(result.stderr);
  const error = result.error ? message(result.error) : "";
  writeFileSync(join(runDir, "last-message.md"), stdout, "utf8");
  const failureSummary = exitStatus === 0 ? "" : loopFailureMessage(agent.tool, exitStatus, agent.name, agent.role, task.id, stderr, error);
  writeJson(join(runDir, "result.json"), loopResultRecord(agent, task.id, args, exitStatus, started, finalTask.status, stdout, stderr, error, failureSummary));
  return { exitStatus, stdout, stderr, error, failureSummary, runDir };
}

function loopResultRecord(agent: Agent, taskId: string, args: string[], exitStatus: number, started: Date, finalTaskStatus: string, stdout: string, stderr: string, error: string, failureSummary: string) {
  return {
    agent: agent.name,
    role: agent.role,
    tool: agent.tool,
    task_id: taskId,
    command_args: args,
    exit_status: exitStatus,
    started_at: started.toISOString(),
    finished_at: new Date().toISOString(),
    final_task_status: finalTaskStatus,
    stdout,
    stderr,
    error,
    failure_summary: failureSummary
  };
}

export function handleLoopResult(cwd: string, result: LoopRunResult, agent: Agent, taskId: string, handoffCount: number) {
  const task = requireSharedTask(cwd, taskId);
  const handoffs = task.store.listHandoffs(task.projectIdentifier, task.id);
  const latestHandoff = handoffs.at(-1);
  const reviewerDecision = agent.role === "reviewer"
    && handoffs.length > handoffCount
    && latestHandoff?.sender === agent.role
    && ["approved", "changes_requested", "done"].includes(latestHandoff.status);
  if (result.exitStatus !== 0) {
    const reason = result.failureSummary || loopFailureMessage(agent.tool, result.exitStatus, agent.name, agent.role, taskId, result.stderr, result.error);
    if (isInfrastructureFailure(result)) {
      retryLoopTask(task, agent, reason);
    } else {
      blockLoopTask(task, reason);
    }
  } else if (agent.role === "worker" && task.status === "in_progress") {
    blockLoopTask(task, staleLoopTaskMessage(agent, taskId, "in_progress"));
  } else if (agent.role === "reviewer" && task.status === "review" && task.meta.pending_completion !== true && !reviewerDecision) {
    blockLoopTask(task, staleLoopTaskMessage(agent, taskId, "review"));
  }
  if (result.exitStatus === 0 && task.status !== "blocked") {
    const messagePath = join(result.runDir, "last-message.md");
    const handoffMessage = existsSync(messagePath) ? readFileSync(messagePath, "utf8") : "";
    const updates = {
      status: task.status,
      pending_completion: undefined,
      run_id: basename(result.runDir),
      finished_at: new Date().toISOString(),
      message: handoffMessage,
      infrastructure_failure: undefined,
      updated_on: dateStamp(new Date())
    };
    if (handoffs.length > handoffCount && handoffs.at(-1)?.sender === agent.role) {
      updateSharedTask(task, updates);
    } else {
      updateSharedTaskAndHandoff(task, updates, agent, basename(result.runDir), updates.status, handoffMessage);
    }
  }
  const finalTask = requireSharedTask(cwd, taskId);
  updateLoopResult(result.runDir, {
    final_task_status: finalTask.status,
    failure_summary: finalTask.status === "blocked"
      ? String(finalTask.meta.blocked_reason ?? result.failureSummary ?? "")
      : result.failureSummary
  });
}

function retryLoopTask(task: SharedTask, agent: Agent, reason: string) {
  const status = agent.role === "reviewer" ? "review" : "ready";
  updateSharedTask(task, {
    status,
    infrastructure_failure: reason,
    run_id: undefined,
    finished_at: new Date().toISOString(),
    message: reason,
    updated_on: dateStamp(new Date())
  });
}

function isInfrastructureFailure(result: LoopRunResult) {
  return Boolean(result.error) || /(?:could not create PATH aliases|failed to initialize in-process app-server client|Operation not permitted|failed to lookup address information|getaddrinfo|failed to refresh available models|workspace routing discovery failed|connection failed|error sending request|failed to connect)/i.test(`${result.stderr}\n${result.failureSummary}`);
}

function blockLoopTask(task: SharedTask, reason: string) {
  const today = dateStamp(new Date());
  updateSharedTask(task, {
    status: "blocked",
    blocked_reason: reason,
    blocked_on: today,
    message: reason,
    updated_on: today
  }, appendBlocker(task.body, today, reason));
}

function updateLoopResult(runDir: string, updates: Record<string, unknown>) {
  const file = join(runDir, "result.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  writeJson(file, { ...data, ...updates });
}

function codexDoesNotSupportLastMessage(result: ReturnType<typeof spawnSync>) {
  if (result.status === 0 || !result.stderr) return false;
  const stderr = spawnText(result.stderr);
  return /output-last-message|unknown option|unsupported option/i.test(stderr);
}

function spawnText(value: string | NodeJS.ArrayBufferView | null | undefined) {
  if (!value) return "";
  const text = typeof value === "string" ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  return text.replace(/(?:\r\n|\n)+$/, "\n");
}

export function loopFailureMessage(tool: string, exitStatus: number, agentName: string, role: string, taskId: string, stderr: string, error: string) {
  if (isMissingExecutable(error)) {
    return `${tool} executable not found for ${role} ${agentName} on ${taskId}. Install ${toolName(tool)} or make \`${tool}\` available on PATH.`;
  }
  const detail = firstNonEmptyLine(stderr) || error;
  return detail
    ? `${tool} exited with status ${exitStatus} for ${role} ${agentName} on ${taskId}: ${detail}`
    : `${tool} exited with status ${exitStatus} for ${role} ${agentName} on ${taskId}.`;
}

function firstNonEmptyLine(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function isMissingExecutable(error: string) {
  return /ENOENT/i.test(error);
}

function toolName(tool: string) {
  if (tool === "opencode") return "OpenCode";
  if (tool === "claude") return "Claude";
  return "Codex";
}

function staleLoopTaskMessage(agent: Agent, taskId: string, status: string) {
  const location = status.startsWith("in_") ? status : `in ${status}`;
  return `${agent.role} ${agent.name} left ${taskId} ${location} after ${agent.tool} run`;
}

function lifecycleInstructions(role: string) {
  if (role === "reviewer") {
    return "Review the task against the phase docs and current repo behavior. Send an `approved` handoff to the planner when accepted and leave the task in `review`; leave it `ready` when fixes are required, or `blocked` if progress is impossible.";
  }
  return "Implement only the assigned task. Before you finish, leave the task in exactly one terminal state for this run: `review` when the work is ready for review, or `blocked` when you cannot continue.";
}

function inferPhaseDocPath(task: SharedTask) {
  const match = `${task.title}\n${task.body}`.match(/docs\/phases\/[a-z0-9._-]+\.md/i);
  return match?.[0] ?? "";
}

function updateSharedTaskAndHandoff(task: SharedTask, updates: Record<string, unknown>, agent: Agent, runId: string, status: string, msg: string, administrativeOverride = false) {
  const createdAt = new Date().toISOString();
  const handoffs = task.store.listHandoffs(task.projectIdentifier, task.id);
  const handoffRoute = status === "blocked"
    ? { recipient: "planner", decision: "blocked" }
    : agent.role === "worker"
      ? { recipient: "reviewer", decision: "review" }
      : agent.role === "reviewer"
        ? task.meta.pending_completion === true
          ? { recipient: "planner", decision: "approved" }
          : { recipient: "worker", decision: "changes_requested" }
        : { recipient: "worker", decision: "changes_requested" };
  const handoff: WorkflowHandoff = {
    projectIdentifier: task.projectIdentifier,
    taskId: task.id,
    sequence: handoffs.length + 1,
    sender: agent.role,
    recipient: handoffRoute.recipient,
    status: handoffRoute.decision,
    message: msg,
    createdAt,
    metadata: {
      agent: agent.name,
      tool: agent.tool,
      run: runId,
      task_title: task.title,
      ...(task.store.constructor.name === "MarkdownWorkflowStore" ? { filename: handoffFileName(agent, runId, new Date()) } : {})
    }
  };
  const patch = taskPatch(task, updates, task.body);
  if (task.store.updateTaskWithHandoff) {
    task.store.updateTaskWithHandoff(task.projectIdentifier, task.id, patch, { ...handoff, sequence: undefined }, { administrativeOverride });
    const updated = task.store.getTask(task.projectIdentifier, task.id);
    if (!updated) throw new Error(`Task not found: ${task.id}`);
    Object.assign(task, toSharedTask(task.cwd, updated, task.store));
    return;
  }
  updateSharedTask(task, updates);
  task.store.addHandoff(handoff);
}

export function updateAgentSession(root: string, agent: Agent, status: string) {
  const file = join(root, "_shared", "session.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.agents = data.agents ?? {};
  data.agents[agent.name] = { ...(data.agents[agent.name] ?? {}), role: agent.role, tool: agent.tool, status, last_seen_at: new Date().toISOString() };
  data.updated_at = new Date().toISOString();
  writeJson(file, data);
}

function addBlocker(root: string, agent: string, msg: string) {
  const file = join(root, "_shared", "session.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.blockers = Array.isArray(data.blockers) ? data.blockers : [];
  data.blockers.push({ id: `blocker-${timestamp(new Date())}`, agent, message: msg, created_at: new Date().toISOString() });
  data.updated_at = new Date().toISOString();
  writeJson(file, data);
}

export function requireAgent(root: string, name: string) {
  if (!validSlug(name)) throw new Error(`Unknown agent: ${name}`);
  const agent = readAgents(root).find((item) => item.name === name);
  if (!agent) throw new Error(`Unknown agent: ${name}`);
  return agent;
}

export function nextRunId(dir: string, taskId: string, date: Date) {
  mkdirSync(dir, { recursive: true });
  const base = `${timestamp(date)}_${taskId}`;
  let id = base;
  for (let i = 2; existsSync(join(dir, id)); i++) id = `${base}-${i}`;
  return id;
}

function timestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function handoffFileName(agent: Agent, runId: string, date: Date) {
  return `${timestamp(date).slice(0, -2)}_${runId}_${agent.tool}_${agent.role}.md`;
}

export function loopHelp() {
  console.log(`Usage: agent-rig loop [--once] [--worker <agent>] [--reviewer <agent>] [--interval <seconds>]

Supports loop agents with \`tool = "codex"\`, \`tool = "opencode"\`, or \`tool = "claude"\`.
OpenCode uses its configured default model; AgentRig does not pass \`--model\` or \`--auto\`.
Claude receives the assembled prompt on stdin.

Options:
  --once                Run one loop tick and exit
  --worker <agent>      Worker agent name (default: worker)
  --reviewer <agent>    Reviewer agent name (default: reviewer)
  --interval <seconds>  Poll interval for continuous mode (default: 60)

Examples:
  agent-rig loop
  agent-rig loop --once
  agent-rig loop --worker worker
  agent-rig loop --reviewer reviewer
  agent-rig loop --interval 60`);
  return 0;
}

export async function withLock(cwd: string, lockName: string, lockError: string, fn: () => Promise<number>) {
  const cleanup = lock(cwd, lockName, lockError);
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    const handler = () => {
      cleanup();
      process.exit(code);
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  try {
    return await fn();
  } finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    cleanup();
  }
}

export function loopMaxTicks() {
  const value = Number(process.env.AGENT_RIG_LOOP_MAX_TICKS ?? "0");
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function loopIntervalMs(intervalSeconds: number) {
  const override = Number(process.env.AGENT_RIG_LOOP_INTERVAL_MS ?? "");
  return Number.isInteger(override) && override >= 0 ? override : intervalSeconds * 1000;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function lock(cwd: string, lockName: string, lockError: string) {
  const file = join(requireWorkspace(cwd), "_shared", lockName);
  try {
    writeFileSync(file, String(process.pid), { flag: "wx" });
  } catch {
    throw new Error(lockError);
  }
  return () => {
    if (existsSync(file)) unlinkSync(file);
  };
}

export function requireLoopAgent(root: string, name: string, label: string) {
  const agent = requireAgent(root, name);
  if (!loopLaunchers[agent.tool]) throw new Error(`Unsupported loop tool "${agent.tool}" for ${label} agent "${name}". Supported tools: codex, opencode, claude.`);
  return agent;
}

function sharedTasksDir(root: string) {
  return join(root, "_shared", "tasks");
}

export function readSharedTasks(root: string, cwd: string) {
  const { store, projectIdentifier } = createWorkflowStore(cwd);
  return store.listTasks(projectIdentifier).map((task) => toSharedTask(cwd, task, store)).sort((a, b) => a.id.localeCompare(b.id));
}

function toSharedTask(cwd: string, workflow: WorkflowTask, store: WorkflowStore): SharedTask {
  const meta = workflowMetadata(workflow);
  const file = store instanceof MarkdownWorkflowStore ? taskSourcePath(cwd, workflow.id, workflow.title) : "";
  const record = {
    id: workflow.id,
    title: workflow.title,
    type: workflow.type,
    phase: resolveTaskPhase(workflow, file),
    status: workflow.status,
    assigned_to: workflow.assignedTo,
    priority: workflow.priority,
    dependency_count: workflow.dependsOn.length,
    dependency_ready: workflow.dependencyReady,
    blocked_by: workflow.blockedBy,
    path: file ? relative(cwd, file) : "",
    project_identifier: workflow.projectIdentifier
  };
  return { ...record, depends_on: workflow.dependsOn, file, meta, body: workflow.body, record, workflow, store, projectIdentifier: workflow.projectIdentifier, cwd };
}

function taskSourcePath(cwd: string, id: string, title: string): string {
  const directory = sharedTasksDir(requireWorkspace(cwd));
  if (existsSync(directory)) {
    const source = readdirSync(directory).find((name) => name.startsWith(`${id}_`) && name.endsWith(".md"));
    if (source) return join(directory, source);
  }
  return join(directory, `${id}_${slug(title)}.md`);
}

function workflowMetadata(task: WorkflowTask) {
  return {
    ...task.metadata,
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    assigned_to: task.assignedTo,
    created_by: task.createdBy,
    created_on: task.createdOn,
    updated_on: task.updatedOn,
    priority: task.priority,
    parent: task.parent,
    ...(task.phase ? { phase: task.phase } : {}),
    depends_on: task.dependsOn
  };
}

function readWorkspaceProvider(cwd: string) {
  return readWorkspaceWorkflowConfig(cwd).workflow_store.provider;
}

function requireSharedTask(cwd: string, id: string) {
  const task = readSharedTasks(requireWorkspace(cwd), cwd).find((item) => item.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  return task;
}

export function nextActionableTask(tasks: SharedTask[], agentName: string | undefined, skipped: string[]) {
  for (const task of tasks) {
    if (task.status !== "ready") continue;
    if (agentName && task.assigned_to !== agentName) continue;
    if (!task.assigned_to) {
      skipped.push(`${task.id} ready but has no assigned_to; skipped by watch`);
      continue;
    }
    if (!task.dependency_ready) continue;
    return task;
  }
  return undefined;
}

export function selectLoopTask(tasks: SharedTask[], workerName: string) {
  const reviewTask = tasks.find((task) => task.status === "review");
  if (reviewTask) {
    const latestHandoff = reviewTask.store.listHandoffs(reviewTask.projectIdentifier, reviewTask.id).at(-1);
    if (["reviewer", "planner"].includes(latestHandoff?.sender ?? "") && latestHandoff?.status === "changes_requested") {
      return { kind: "worker" as const, task: reviewTask };
    }
    return { kind: "review" as const, task: reviewTask };
  }
  const workerTask = nextActionableTask(tasks, workerName, []);
  if (workerTask) return { kind: "worker" as const, task: workerTask };
  return { kind: "none" as const };
}

type GithubIssue = {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: { name: string }[];
};

function githubRepo(cwd: string) {
  const data = ghJson(cwd, ["repo", "view", "--json", "nameWithOwner"]);
  if (!data || typeof data.nameWithOwner !== "string" || !data.nameWithOwner) throw new Error(githubSetupMessage());
  return data.nameWithOwner;
}

function githubIssues(cwd: string, limit: number, label?: string) {
  const args = ["issue", "list", "--state", "open", "--limit", String(limit), "--json", "number,title,body,url,labels"];
  if (label) args.push("--label", label);
  const data = ghJson(cwd, args);
  if (!Array.isArray(data)) throw new Error("GitHub issue list returned unexpected data.");
  return data.map((item): GithubIssue => {
    if (!item || typeof item !== "object") throw new Error("GitHub issue list returned unexpected data.");
    const record = item as Record<string, unknown>;
    const labels = Array.isArray(record.labels) ? record.labels.map((raw) => {
      if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string") return { name: String((raw as Record<string, unknown>).name) };
      return { name: String(raw ?? "") };
    }).filter((raw) => raw.name) : [];
    return {
      number: Number(record.number),
      title: String(record.title ?? ""),
      body: String(record.body ?? ""),
      url: String(record.url ?? ""),
      labels
    };
  }).filter((issue) => Number.isInteger(issue.number) && issue.title && issue.url);
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
  return "GitHub sync requires the GitHub CLI. Install gh and run `gh auth login`.";
}

function githubSourceMatches(source: unknown, repo: string, issue: number) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const record = source as Record<string, unknown>;
  return record.provider === "github" && record.repo === repo && Number(record.issue) === issue;
}

function githubIssueType(labels: string[]) {
  for (const label of labels) {
    const mapped = githubTypeLabels.get(label.toLowerCase());
    if (mapped) return mapped;
  }
  return "task";
}

function githubIssueTaskBody(issue: GithubIssue) {
  const body = issue.body.trim() || "(No issue body.)";
  return `# Task

## Context

Imported from GitHub Issue #${issue.number}. Needs planner review before moving to ready.

## Source Issue

${body}

## Planner Notes


## Implementation Plan


## Acceptance Criteria

- [ ] Planner has converted the source issue into verifiable criteria.

## Notes

`;
}

export function updateSharedTask(task: SharedTask, updates: Record<string, unknown>, body = task.body) {
  const patch = taskPatch(task, updates, body);
  task.store.updateTask(task.projectIdentifier, task.id, patch as never);
  const updated = task.store.getTask(task.projectIdentifier, task.id);
  if (!updated) throw new Error(`Task not found: ${task.id}`);
  Object.assign(task, toSharedTask(task.cwd, updated, task.store));
}

function taskPatch(task: SharedTask, updates: Record<string, unknown>, body: string) {
  const meta = { ...task.meta };
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "undefined" || value === "") delete meta[key];
    else meta[key] = value;
  }
  const patch: Record<string, unknown> = { body, metadata: {} };
  const fields: Record<string, string> = { title: "title", type: "type", status: "status", assigned_to: "assignedTo", priority: "priority", parent: "parent", phase: "phase", depends_on: "dependsOn", updated_on: "updatedOn" };
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!(key in fields) && !["id", "created_by", "created_on"].includes(key)) metadata[key] = value;
  }
  for (const [key, field] of Object.entries(fields)) if (key in meta) patch[field] = meta[key];
  patch.metadata = metadata;
  return patch;
}

function readSharedTaskMarkdown(file: string) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`Task file is missing frontmatter: ${file}`);
  const meta = parseYaml(match[1]);
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error(`Task frontmatter must be an object: ${file}`);
  return { meta: meta as Record<string, unknown>, body: text.slice(match[0].length) };
}

function sharedTaskMarkdown(meta: Record<string, unknown>, body?: string) {
  const ordered = orderedFrontmatter(meta);
  const taskBody = body ?? defaultTaskBody();
  return `---\n${stringifyYaml(ordered).trimEnd()}\n---\n\n${taskBody.trimEnd()}\n`;
}

function defaultTaskBody() {
  return "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n";
}

function readTaskBrief(file: string) {
  if (!existsSync(file)) throw new Error(`Task brief not found: ${file}`);
  const body = readFileSync(file, "utf8");
  const required = ["Context", "Goal", "Scope", "Planner Notes", "Implementation Plan", "Acceptance Criteria"];
  const missing = required.filter((section) => {
    const content = taskBriefSection(body, section);
    return !content.trim() || (section === "Acceptance Criteria" && !/^- \[[ xX]\] .+/m.test(content));
  });
  if (missing.length) throw new Error(`Task brief is incomplete. Add non-empty sections and acceptance checkboxes: ${missing.join(", ")}`);
  return body;
}

function taskBriefSection(body: string, section: string) {
  const heading = `## ${section}`;
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

function orderedFrontmatter(meta: Record<string, unknown>) {
  const order = ["id", "title", "type", "status", "assigned_to", "created_by", "created_on", "updated_on", "priority", "parent", "depends_on", "blocked_reason", "blocked_on", "message", "run_id", "started_at", "finished_at", "source"];
  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (typeof meta[key] !== "undefined") out[key] = meta[key];
  }
  for (const key of Object.keys(meta).sort()) {
    if (!(key in out) && typeof meta[key] !== "undefined") out[key] = meta[key];
  }
  return out;
}

function appendBlocker(body: string, date: string, reason: string) {
  const line = `- ${date}: ${reason}`;
  const heading = body.match(/^## Blockers\b.*$/m);
  if (!heading || typeof heading.index !== "number") return `${body.trimEnd()}\n\n## Blockers\n\n${line}\n`;
  const insertAt = nextHeadingIndex(body, heading.index + heading[0].length);
  const before = body.slice(0, insertAt).trimEnd();
  const after = body.slice(insertAt);
  return `${before}\n${line}\n${after}`;
}

function nextHeadingIndex(body: string, from: number) {
  const rest = body.slice(from);
  const match = rest.match(/\n## /);
  return match && typeof match.index === "number" ? from + match.index : body.length;
}

function nextSharedTaskId(dir: string) {
  return `task-${String(nextSharedTaskNumber(dir)).padStart(4, "0")}`;
}

function nextSharedTaskNumber(dir: string) {
  let max = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^task-(\d{4})[_-]/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "task";
}

export function dateStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseOptions(args: string[], allowed: Set<string>, booleanFlags = new Set<string>()) {
  const out = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (booleanFlags.has(arg)) {
      out.set(arg, [...(out.get(arg) ?? []), "true"]);
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    out.set(arg, [...(out.get(arg) ?? []), value]);
  }
  return out;
}

export function option(options: Map<string, string[]>, key: string) {
  const values = options.get(key);
  return values?.[values.length - 1];
}

function dependsOn(options: Map<string, string[]>) {
  return (options.get("--depends-on") ?? []).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}

function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function fail(text: string) {
  console.error(text);
  return 1;
}

export function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
