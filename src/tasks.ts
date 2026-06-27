import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Agent, readAgents, requireWorkspace, validSlug } from "./workspace.js";

type QueueTask = Record<string, unknown> & {
  id: string;
  status: string;
  title: string;
  task_file: string;
  agent?: string;
};

const states = new Set(["ready", "running", "done", "blocked"]);

export function runTask(args: string[], cwd: string) {
  const [command, ...rest] = args;
  if (command === "add") return taskAdd(rest, cwd);
  return fail("Usage: agent-rig task add --agent <name> --title <title> (--body <body>|--body-file <path>)");
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

  count += processQueue(cwd, root, join(root, "_shared", "task_queue.json"));
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
    states.has((value as QueueTask).status) &&
    typeof (value as QueueTask).title === "string" &&
    typeof (value as QueueTask).task_file === "string";
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
