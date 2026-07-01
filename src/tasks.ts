import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Agent, readAgents, requireWorkspace, validSlug } from "./workspace.js";

type SharedTask = {
  id: string;
  status: string;
  type: string;
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
  if (command === "show") return tasksShow(rest, cwd);
  if (command === "set-status") return tasksSetStatus(rest, cwd);
  if (command === "assign") return tasksAssign(rest, cwd);
  if (command === "set-type") return tasksSetType(rest, cwd);
  if (command === "block") return tasksBlock(rest, cwd);
  if (command === "unblock") return tasksUnblock(rest, cwd);
  if (command === "done") return tasksDone(rest, cwd);
  if (command === "next") return tasksNext(rest, cwd);
  if (command === "sync") return tasksSync(rest, cwd);
  return tasksList(args, cwd);
}

function tasksHelp() {
  console.log(`Usage: agent-rig tasks [command] [options]

Commands:
  create <title>              Create a shared Markdown task
  show <task-id>              Print the canonical task Markdown
  set-status <task-id> <status>
  assign <task-id> <agent-name>
  set-type <task-id> <type>
  block <task-id> --reason <reason>
  unblock <task-id> --status <todo|ready|in_progress>
  done <task-id> [--message <message>]
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
    if (!title || title.startsWith("--")) return fail("Usage: agent-rig tasks create <title> [--assigned-to <agent>] [--status <status>] [--type <type>] [--priority <priority>] [--parent <task-id>] [--depends-on <task-id[,task-id]>] [--created-by <name>]");

    const allowed = new Set(["--assigned-to", "--status", "--type", "--priority", "--parent", "--depends-on", "--created-by"]);
    const options = parseOptions(args.slice(1), allowed);
    const status = option(options, "--status") ?? "todo";
    const type = option(options, "--type") ?? "task";
    const priority = option(options, "--priority") ?? "normal";
    if (!taskStatuses.has(status)) return fail(`Invalid status: ${status}`);
    if (!taskTypes.has(type)) return fail(`Invalid type: ${type}`);
    if (!priorities.has(priority)) return fail(`Invalid priority: ${priority}`);

    const dir = sharedTasksDir(root);
    mkdirSync(dir, { recursive: true });
    const id = nextSharedTaskId(dir);
    const filename = `${id}_${slug(title)}.md`;
    const file = join(dir, filename);
    if (existsSync(file)) return fail(`Task already exists: ${relative(cwd, file)}`);

    const today = dateStamp(new Date());
    const meta = {
      id,
      title,
      type,
      status,
      assigned_to: option(options, "--assigned-to") ?? "",
      created_by: option(options, "--created-by") ?? "human",
      created_on: today,
      updated_on: today,
      priority,
      parent: option(options, "--parent") ?? "",
      depends_on: dependsOn(options)
    };
    writeFileSync(file, sharedTaskMarkdown(meta), "utf8");
    console.log(`Created ${id}: ${relative(cwd, file)}`);
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
    process.stdout.write(readFileSync(task.file, "utf8"));
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function tasksSetStatus(args: string[], cwd: string) {
  try {
    const [id, status] = args;
    if (!id || !status || args.length !== 2) return fail("Usage: agent-rig tasks set-status <task-id> <status>");
    if (!taskStatuses.has(status)) return fail(`Invalid status: ${status}`);
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, { status, updated_on: dateStamp(new Date()) });
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
    if (!id) return fail("Usage: agent-rig tasks done <task-id> [--message <message>]");
    const options = parseOptions(args.slice(1), new Set(["--message"]));
    const updates: Record<string, unknown> = { status: "done", updated_on: dateStamp(new Date()) };
    const msg = option(options, "--message");
    if (msg) updates.message = msg;
    const task = requireSharedTask(cwd, id);
    updateSharedTask(task, updates);
    console.log(`Done ${id}${msg ? `: ${msg}` : ""}`);
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
    const dir = sharedTasksDir(root);
    mkdirSync(dir, { recursive: true });

    const repo = githubRepo(cwd);
    const issues = githubIssues(cwd, limit, option(options, "--label"));
    const existing = readSharedTasks(root, cwd);
    const dryRun = options.has("--dry-run");
    const json = options.has("--json");
    const today = dateStamp(new Date());
    const imported: Record<string, unknown>[] = [];
    const skipped: Record<string, unknown>[] = [];
    let nextNumber = nextSharedTaskNumber(dir);

    for (const issue of issues) {
      const duplicate = existing.find((task) => githubSourceMatches(task.meta.source, repo, issue.number));
      if (duplicate) {
        skipped.push({ issue: issue.number, task: duplicate.id });
        continue;
      }

      const id = `task-${String(nextNumber++).padStart(4, "0")}`;
      const file = join(dir, `${id}_${slug(issue.title)}.md`);
      const labels = issue.labels.map((label) => label.name);
      const meta = {
        id,
        title: issue.title,
        type: githubIssueType(labels),
        status: "todo",
        assigned_to: "",
        created_by: "github-sync",
        created_on: today,
        updated_on: today,
        priority: "normal",
        parent: "",
        depends_on: [],
        source: {
          provider: "github",
          repo,
          issue: issue.number,
          url: issue.url,
          state_at_import: "open",
          imported_at: today,
          labels
        }
      };
      if (!dryRun) writeFileSync(file, sharedTaskMarkdown(meta, githubIssueTaskBody(issue)), "utf8");
      imported.push({ issue: issue.number, task: id, path: relative(cwd, file) });
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

export async function runWatch(args: string[], cwd: string) {
  try {
    if (args.length !== 1 || args[0] !== "--once") return fail("Usage: agent-rig watch --once");
    return withLock(cwd, () => processReady(cwd));
  } catch (cause) {
    return fail(message(cause));
  }
}

async function processReady(cwd: string) {
  const root = requireWorkspace(cwd);
  const skipped: string[] = [];
  const task = nextActionableTask(readSharedTasks(root, cwd), undefined, skipped);
  for (const warning of skipped) console.warn(warning);
  if (task) {
    const agent = requireAgent(root, task.assigned_to);
    runOne(cwd, root, agent, task);
  }

  const count = task ? 1 : 0;
  console.log(`Processed ${count} task${count === 1 ? "" : "s"}.`);
  return 0;
}

function runOne(cwd: string, root: string, agent: Agent, task: SharedTask) {
  const started = new Date();
  const runId = nextRunId(join(root, agent.name, "runs"), task.id, started);

  updateSharedTask(task, { status: "in_progress", run_id: runId, started_at: started.toISOString(), message: "", updated_on: dateStamp(started) });
  updateAgentSession(root, agent, "running");

  try {
    const runDir = join(root, agent.name, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "prompt.md"), prompt(cwd, root, agent, task, task.body), "utf8");
    const blocked = task.meta.simulate === "blocked";
    const status = blocked ? "blocked" : "done";
    const msg = `Fake adapter ${blocked ? "blocked" : "completed"} ${task.id}.`;
    finish(root, agent, task, runDir, runId, status, msg);
  } catch (cause) {
    const msg = message(cause);
    const runDir = join(root, agent.name, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    finish(root, agent, task, runDir, runId, "blocked", msg);
  }
}

function finish(root: string, agent: Agent, task: SharedTask, runDir: string, runId: string, status: "done" | "blocked", msg: string) {
  const finished = new Date().toISOString();
  updateSharedTask(task, { status, run_id: runId, finished_at: finished, message: msg, updated_on: dateStamp(new Date()) });
  writeJson(join(runDir, "result.json"), { status, message: msg, handoff: handoffFileName(agent, runId, new Date()) });
  writeHandoff(root, agent, task, runId, status, msg);
  if (status === "blocked") addBlocker(root, agent.name, msg);
  updateAgentSession(root, agent, status === "done" ? "idle" : "blocked");
}

function prompt(cwd: string, root: string, agent: Agent, task: SharedTask, taskBody: string) {
  return [
    "# Shared Context",
    readFileSync(join(root, "_shared", "context.md"), "utf8").trim(),
    "# Agent Instructions",
    readFileSync(join(root, agent.name, "instructions.md"), "utf8").trim(),
    "# Agent Context",
    readFileSync(join(root, agent.name, "context.md"), "utf8").trim(),
    "# Task",
    `Title: ${task.title}`,
    "",
    taskBody.trim(),
    "",
    `Task file: ${task.path}`
  ].join("\n\n") + "\n";
}

function writeHandoff(root: string, agent: Agent, task: SharedTask, runId: string, status: string, msg: string) {
  const dir = join(root, "_shared", "handoff_logs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, handoffFileName(agent, runId, new Date())), `---\nagent: ${agent.name}\nrole: ${agent.role}\ntool: ${agent.tool}\ntask: ${task.id}\ntask_title: ${task.title}\nrun: ${runId}\nstatus: ${status}\n---\n\n# Handoff\n\n## Message\n\n${msg}\n`, "utf8");
}

function updateAgentSession(root: string, agent: Agent, status: string) {
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

function requireAgent(root: string, name: string) {
  if (!validSlug(name)) throw new Error(`Unknown agent: ${name}`);
  const agent = readAgents(root).find((item) => item.name === name);
  if (!agent) throw new Error(`Unknown agent: ${name}`);
  return agent;
}

function nextRunId(dir: string, taskId: string, date: Date) {
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

async function withLock(cwd: string, fn: () => Promise<number>) {
  const cleanup = lock(cwd);
  try {
    return await fn();
  } finally {
    cleanup();
  }
}

function lock(cwd: string) {
  const file = join(requireWorkspace(cwd), "_shared", "watch.lock");
  try {
    writeFileSync(file, String(process.pid), { flag: "wx" });
  } catch {
    throw new Error("watch.lock already exists. Stop the running watcher or remove the stale lock.");
  }
  return () => {
    if (existsSync(file)) unlinkSync(file);
  };
}

function sharedTasksDir(root: string) {
  return join(root, "_shared", "tasks");
}

function readSharedTasks(root: string, cwd: string) {
  const dir = sharedTasksDir(root);
  if (!existsSync(dir)) return [];
  const parsed = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const file = join(dir, entry.name);
      return { file, ...readSharedTaskMarkdown(file) };
    });
  const done = new Set(parsed.filter((task) => task.meta.status === "done").map((task) => String(task.meta.id ?? "")));
  const ids = new Set(parsed.map((task) => String(task.meta.id ?? "")));

  return parsed
    .map((task): SharedTask => toSharedTask(cwd, task.file, task.meta, task.body, done, ids))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function toSharedTask(cwd: string, file: string, meta: Record<string, unknown>, body: string, done: Set<string>, ids: Set<string>): SharedTask {
  const depends = Array.isArray(meta.depends_on) ? meta.depends_on.filter((item): item is string => typeof item === "string") : [];
  const blockedBy = depends.filter((id) => !ids.has(id) || !done.has(id));
  const record = {
    id: String(meta.id ?? ""),
    title: String(meta.title ?? ""),
    type: String(meta.type ?? "task"),
    status: String(meta.status ?? ""),
    assigned_to: String(meta.assigned_to ?? ""),
    priority: String(meta.priority ?? "normal"),
    dependency_count: depends.length,
    dependency_ready: blockedBy.length === 0,
    blocked_by: blockedBy,
    path: relative(cwd, file)
  };
  return { ...record, depends_on: depends, file, meta, body, record };
}

function requireSharedTask(cwd: string, id: string) {
  const task = readSharedTasks(requireWorkspace(cwd), cwd).find((item) => item.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  return task;
}

function nextActionableTask(tasks: SharedTask[], agentName: string | undefined, skipped: string[]) {
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

function updateSharedTask(task: SharedTask, updates: Record<string, unknown>, body = task.body) {
  const meta = { ...task.meta };
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "undefined" || value === "") delete meta[key];
    else meta[key] = value;
  }
  writeFileSync(task.file, sharedTaskMarkdown(meta, body), "utf8");
  task.meta = meta;
  task.body = body;
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
  const taskBody = body ?? "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n";
  return `---\n${stringifyYaml(ordered).trimEnd()}\n---\n\n${taskBody.trimEnd()}\n`;
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

function dateStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseOptions(args: string[], allowed: Set<string>, booleanFlags = new Set<string>()) {
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

function option(options: Map<string, string[]>, key: string) {
  const values = options.get(key);
  return values?.[values.length - 1];
}

function dependsOn(options: Map<string, string[]>) {
  return (options.get("--depends-on") ?? []).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}

function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fail(text: string) {
  console.error(text);
  return 1;
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
