import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Agent, readAgents, requireWorkspace, validSlug } from "./workspace.js";

type QueueTask = Record<string, unknown> & {
  id: string;
  status: string;
  title: string;
  task_file: string;
  agent?: string;
};

const queueStates = new Set(["ready", "running", "done", "blocked"]);
const taskStatuses = new Set(["todo", "ready", "in_progress", "blocked", "review", "done"]);
const priorities = new Set(["low", "normal", "high"]);

export function runTask(args: string[], cwd: string) {
  const [command, ...rest] = args;
  if (command === "add") return taskAdd(rest, cwd);
  return fail("Usage: agent-rig task add --agent <name> --title <title> (--body <body>|--body-file <path>)");
}

export function runTasks(args: string[], cwd: string) {
  const [command, ...rest] = args;
  if (command === "create") return tasksCreate(rest, cwd);
  if (command === "show") return tasksShow(rest, cwd);
  return tasksList(args, cwd);
}

function tasksCreate(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const title = args[0];
    if (!title || title.startsWith("--")) return fail("Usage: agent-rig tasks create <title> [--assigned-to <agent>] [--status <status>] [--priority <priority>] [--parent <task-id>] [--depends-on <task-id[,task-id]>] [--created-by <name>]");

    const allowed = new Set(["--assigned-to", "--status", "--priority", "--parent", "--depends-on", "--created-by"]);
    const options = parseOptions(args.slice(1), allowed);
    const status = option(options, "--status") ?? "todo";
    const priority = option(options, "--priority") ?? "normal";
    if (!taskStatuses.has(status)) return fail(`Invalid status: ${status}`);
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
      console.log("id\tstatus\tassigned_to\tpriority\tdepends\ttitle");
      for (const task of tasks) console.log(`${task.id}\t${task.status}\t${task.assigned_to || "-"}\t${task.priority || "normal"}\t${task.dependency_count}\t${task.title}`);
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

export async function runWatch(args: string[], cwd: string) {
  try {
    const once = args.includes("--once");
    if (args.some((arg) => arg !== "--once")) return fail("Usage: agent-rig watch [--once]");
    if (once) return withLock(cwd, () => processReady(cwd));

    const cleanup = lock(cwd);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });
    await processReady(cwd);
    setInterval(() => void processReady(cwd).catch((cause) => console.error(message(cause))), 1000);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function taskAdd(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const agentName = flag(args, "--agent");
    const title = flag(args, "--title");
    const body = flag(args, "--body");
    const bodyFile = flag(args, "--body-file");
    if (!agentName || !title || Number(Boolean(body)) + Number(Boolean(bodyFile)) !== 1) {
      return fail("Usage: agent-rig task add --agent <name> --title <title> (--body <body>|--body-file <path>)");
    }
    const agent = requireAgent(root, agentName);
    const text = bodyFile ? readFileSync(resolve(cwd, bodyFile), "utf8") : body!;
    const id = nextTaskId(join(root, agent.name, "tasks"));
    const taskFile = join(root, agent.name, "tasks", `${id}.md`);

    mkdirSync(dirname(taskFile), { recursive: true });
    writeFileSync(taskFile, taskMarkdown({ id, title, status: "ready", agent: agent.name, created_at: new Date().toISOString() }, text), "utf8");

    const queueFile = join(root, agent.name, "queue.json");
    const queue = readQueue(queueFile);
    queue.push({ id, status: "ready", title, task_file: `tasks/${id}.md` });
    writeJson(queueFile, queue);
    console.log(`Added task ${id} to ${agent.name}.`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

async function processReady(cwd: string) {
  const root = requireWorkspace(cwd);
  let count = 0;

  const sharedQueue = join(root, "_shared", "task_queue.json");
  if (existsSync(sharedQueue)) count += processQueue(cwd, root, sharedQueue);
  for (const agent of readAgents(root)) count += processQueue(cwd, root, join(root, agent.name, "queue.json"), agent.name);

  console.log(`Processed ${count} task${count === 1 ? "" : "s"}.`);
  return 0;
}

function processQueue(cwd: string, root: string, queueFile: string, localAgent?: string) {
  const queue = readQueue(queueFile);
  let changed = false;
  let count = 0;

  for (const task of queue) {
    if (!isTask(task) || task.status !== "ready") continue;
    const agentName = localAgent ?? task.agent;
    if (typeof agentName !== "string") continue;
    const agent = requireAgent(root, agentName);
    runOne(cwd, root, agent, task, queueFile);
    changed = true;
    count++;
  }

  if (changed) writeJson(queueFile, queue);
  return count;
}

function runOne(cwd: string, root: string, agent: Agent, task: QueueTask, queueFile: string) {
  const started = new Date();
  const runId = nextRunId(join(root, agent.name, "runs"), task.id, started);
  const taskFile = resolve(dirname(queueFile), task.task_file);
  const md = readTaskMarkdown(taskFile);

  mutateTask(task, md.meta, { status: "running", run_id: runId, started_at: started.toISOString(), message: "" });
  writeFileSync(taskFile, writeTaskMarkdown(md.meta, md.body), "utf8");
  updateAgentSession(root, agent, "running");

  try {
    const runDir = join(root, agent.name, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "prompt.md"), prompt(cwd, root, agent, task, md.body), "utf8");
    const blocked = task.simulate === "blocked";
    const status = blocked ? "blocked" : "done";
    const msg = `Fake adapter ${blocked ? "blocked" : "completed"} ${task.id}.`;
    finish(root, agent, task, taskFile, md.body, runDir, runId, status, msg);
  } catch (cause) {
    const msg = message(cause);
    const runDir = join(root, agent.name, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    finish(root, agent, task, taskFile, md.body, runDir, runId, "blocked", msg);
  }
}

function finish(root: string, agent: Agent, task: QueueTask, taskFile: string, body: string, runDir: string, runId: string, status: "done" | "blocked", msg: string) {
  const finished = new Date().toISOString();
  const md = readTaskMarkdown(taskFile);
  mutateTask(task, md.meta, { status, run_id: runId, finished_at: finished, message: msg });
  writeFileSync(taskFile, writeTaskMarkdown(md.meta, body), "utf8");
  writeJson(join(runDir, "result.json"), { status, message: msg, handoff: handoffFileName(agent, runId, new Date()) });
  writeHandoff(root, agent, task, runId, status, msg);
  if (status === "blocked") addBlocker(root, agent.name, msg);
  updateAgentSession(root, agent, status === "done" ? "idle" : "blocked");
}

function prompt(cwd: string, root: string, agent: Agent, task: QueueTask, taskBody: string) {
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
    `Task file: ${relative(cwd, join(root, agent.name, task.task_file))}`
  ].join("\n\n") + "\n";
}

function writeHandoff(root: string, agent: Agent, task: QueueTask, runId: string, status: string, msg: string) {
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

function mutateTask(task: QueueTask, meta: Record<string, string>, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    task[key] = value;
    meta[key] = value;
  }
}

function taskMarkdown(meta: Record<string, string>, body: string) {
  return writeTaskMarkdown(meta, `# ${meta.title}\n\n## Objective\n\n${body.trim()}\n\n## Context\n\n\n## Acceptance Criteria\n\n- \n\n## Notes\n\n`);
}

function readTaskMarkdown(file: string) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`Task file is missing frontmatter: ${file}`);
  return { meta: parseFrontmatter(match[1]), body: match[2] };
}

function writeTaskMarkdown(meta: Record<string, string>, body: string) {
  const keys = ["id", "title", "status", "agent", "created_at", "run_id", "started_at", "finished_at", "message"];
  const lines = keys.map((key) => `${key}: ${meta[key] ?? ""}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trimEnd()}\n`;
}

function parseFrontmatter(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index >= 0) out[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return out;
}

function readQueue(file: string) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data)) throw new Error(`Queue must be a JSON array: ${file}`);
  return data as QueueTask[];
}

function requireAgent(root: string, name: string) {
  if (!validSlug(name)) throw new Error(`Unknown agent: ${name}`);
  const agent = readAgents(root).find((item) => item.name === name);
  if (!agent) throw new Error(`Unknown agent: ${name}`);
  return agent;
}

function nextTaskId(dir: string) {
  mkdirSync(dir, { recursive: true });
  const base = `task-${timestamp(new Date())}`;
  let id = base;
  for (let i = 2; existsSync(join(dir, `${id}.md`)); i++) id = `${base}-${i}`;
  return id;
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

function isTask(value: unknown): value is QueueTask {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    typeof (value as QueueTask).id === "string" &&
    typeof (value as QueueTask).status === "string" &&
    queueStates.has((value as QueueTask).status) &&
    typeof (value as QueueTask).title === "string" &&
    typeof (value as QueueTask).task_file === "string";
}

function sharedTasksDir(root: string) {
  return join(root, "_shared", "tasks");
}

function readSharedTasks(root: string, cwd: string) {
  const dir = sharedTasksDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const file = join(dir, entry.name);
      const md = readSharedTaskMarkdown(file);
      const depends = Array.isArray(md.meta.depends_on) ? md.meta.depends_on.filter((item): item is string => typeof item === "string") : [];
      const record = {
        id: String(md.meta.id ?? ""),
        status: String(md.meta.status ?? ""),
        assigned_to: String(md.meta.assigned_to ?? ""),
        priority: String(md.meta.priority ?? "normal"),
        title: String(md.meta.title ?? ""),
        dependency_count: depends.length,
        path: relative(cwd, file)
      };
      return { ...record, file, record };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readSharedTaskMarkdown(file: string) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`Task file is missing frontmatter: ${file}`);
  const meta = parseYaml(match[1]);
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error(`Task frontmatter must be an object: ${file}`);
  return { meta: meta as Record<string, unknown>, body: text.slice(match[0].length) };
}

function sharedTaskMarkdown(meta: Record<string, unknown>) {
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n`;
}

function nextSharedTaskId(dir: string) {
  let max = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^task-(\d{4})[_-]/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `task-${String(max + 1).padStart(4, "0")}`;
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

function flag(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(text: string) {
  console.error(text);
  return 1;
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
