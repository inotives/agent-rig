import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@iarna/toml";
import { parse as parseYaml } from "yaml";
import { readAgents, requireWorkspace, tools } from "./workspace.js";

const handoffName = /^\d{4}-\d{2}-\d{2}-\d{4}_.+_[a-z0-9-]+_[a-z][a-z0-9-]*\.md$/;
const noteName = /^\d{4}-\d{2}-\d{2}-\d{4}_[a-z][a-z0-9-]*_.+\.md$/;

export function runStatus(args: string[], cwd: string) {
  try {
    if (args.some((arg) => arg !== "--json")) return fail("Usage: agent-rig status [--json]");
    const model = statusModel(cwd);
    if (args.includes("--json")) console.log(JSON.stringify(model, null, 2));
    else printStatus(model);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

export function runStart(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const agentName = flag(args, "--agent");
    if (!agentName) return fail("Usage: agent-rig start --agent <name>");

    const agent = readAgents(root).find((item) => item.name === agentName);
    if (!agent) return fail(`Unknown agent: ${agentName}`);
    if (!tools.has(agent.tool)) return fail(`Unknown tool for ${agentName}: ${agent.tool}`);

    const entry = join(root, agent.name, "instructions.md");
    const sharedCreds = credScope(root, "_shared");
    const agentCreds = credScope(root, agent.name);
    const resume = resumeContext(cwd, root, agent.role);

    console.log(`Agent: ${agent.name}`);
    console.log(`Role: ${agent.role}`);
    console.log(`Tool: ${agent.tool}`);
    console.log(`Project cwd: ${cwd}`);
    console.log(`Entry instructions: ${relative(cwd, entry)}`);
    console.log("");
    console.log(`Start ${agent.tool} in this project directory and load or reference ${relative(cwd, entry)}.`);
    console.log("Do not preload the whole agent folder; read additional files only when the instructions ask for them.");
    console.log("");
    console.log("Credentials:");
    printCredScope(cwd, "shared", sharedCreds);
    printCredScope(cwd, agent.name, agentCreds);
    console.log("");
    printResumeContext(resume);
    console.log("");
    console.log("Skill precedence: agent-local skills, then shared AgentRig skills, then global tool skills.");
    console.log("warning: subscription tools may also load global skills or config; AgentRig assumes local AgentRig skills take precedence when names overlap.");
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function statusModel(cwd: string) {
  const root = requireWorkspace(cwd);
  const session = readJson(join(root, "_shared", "session.json"));
  const sessionAgents = isRecord(session?.agents) ? session.agents : {};
  const tasks = readLoopTasks(cwd, join(root, "_shared", "tasks"));
  return {
    workspace: cwd,
    session: {
      path: ".agent-rig/_shared/session.json",
      version: session?.version ?? null,
      current_task_id: session?.current_task_id ?? null,
      blockers: Array.isArray(session?.blockers) ? session.blockers : []
    },
    queues: {
      shared: tasksState(cwd, join(root, "_shared", "tasks"))
    },
    agents: readAgents(root).map((agent) => {
      const live = isRecord(sessionAgents[agent.name]) ? sessionAgents[agent.name] : {};
      return {
        name: agent.name,
        role: agent.role,
        tool: agent.tool,
        status: typeof live.status === "string" ? live.status : "unknown",
        last_seen_at: live.last_seen_at ?? null
      };
    }),
    handoffs: handoffs(cwd, join(root, "_shared", "handoff_logs")),
    loop: {
      lock: loopLock(cwd, join(root, "_shared", "loop.lock")),
      next_action: nextLoopAction(tasks),
      latest_runs: {
        worker: latestLoopRun(cwd, join(root, "worker", "runs"), "worker"),
        reviewer: latestLoopRun(cwd, join(root, "reviewer", "runs"), "reviewer")
      }
    }
  };
}

type LoopTask = {
  id: string;
  title: string;
  status: string;
  assigned_to: string;
  dependency_ready: boolean;
};

function loopLock(cwd: string, file: string) {
  if (!existsSync(file)) return { locked: false, pid: null, path: relative(cwd, file) };
  return { locked: true, pid: readPid(file), path: relative(cwd, file) };
}

function readPid(file: string) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function nextLoopAction(tasks: LoopTask[]) {
  const reviewTask = tasks.find((task) => task.status === "review");
  if (reviewTask) return loopAction("review", reviewTask, "reviewer");

  const workerTask = tasks.find((task) => task.status === "ready" && task.assigned_to === "worker" && task.dependency_ready);
  if (workerTask) return loopAction("worker", workerTask, "worker");

  return { kind: "idle", task_id: null, title: null, agent: null };
}

function loopAction(kind: "review" | "worker", task: LoopTask, agent: "reviewer" | "worker") {
  return {
    kind,
    task_id: task.id,
    title: task.title,
    agent
  };
}

function readLoopTasks(cwd: string, dir: string) {
  if (!existsSync(dir)) return [];
  const parsed = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => readLoopTaskSafe(join(dir, entry.name)))
    .filter((task): task is ReturnType<typeof readLoopTask> => task !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  const done = new Set(parsed.filter((task) => task.status === "done").map((task) => task.id));
  const ids = new Set(parsed.map((task) => task.id));
  return parsed.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    assigned_to: task.assigned_to,
    dependency_ready: task.depends_on.every((id) => ids.has(id) && done.has(id))
  }));
}

function readLoopTaskSafe(file: string) {
  try {
    return readLoopTask(file);
  } catch {
    return null;
  }
}

function readLoopTask(file: string) {
  const meta = readFrontmatter(file);
  return {
    id: String(meta.id ?? ""),
    title: String(meta.title ?? ""),
    status: String(meta.status ?? ""),
    assigned_to: String(meta.assigned_to ?? ""),
    depends_on: Array.isArray(meta.depends_on) ? meta.depends_on.filter((item): item is string => typeof item === "string") : []
  };
}

function readFrontmatter(file: string) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`Task file is missing frontmatter: ${file}`);
  const meta = parseYaml(match[1]);
  if (!isRecord(meta)) throw new Error(`Task frontmatter must be an object: ${file}`);
  return meta;
}

function latestLoopRun(cwd: string, dir: string, agent: "worker" | "reviewer") {
  if (!existsSync(dir)) return null;
  const latest = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))[0];
  if (!latest) return null;
  return loopRunSummary(cwd, join(dir, latest, "result.json"), agent, join(dir, latest));
}

function loopRunSummary(cwd: string, file: string, agent: "worker" | "reviewer", runDir: string) {
  const data = readLoopRunJson(file);
  if (!isRecord(data)) return null;
  return {
    agent: typeof data.agent === "string" ? data.agent : agent,
    role: typeof data.role === "string" ? data.role : null,
    tool: typeof data.tool === "string" ? data.tool : null,
    task_id: typeof data.task_id === "string" ? data.task_id : null,
    exit_status: typeof data.exit_status === "number" ? data.exit_status : null,
    final_task_status: typeof data.final_task_status === "string" ? data.final_task_status : null,
    failure_summary: typeof data.failure_summary === "string" ? data.failure_summary : null,
    path: relative(cwd, runDir)
  };
}

function readLoopRunJson(file: string) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function tasksState(cwd: string, dir: string) {
  try {
    const tasks = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => readTaskStatus(join(dir, entry.name))) : [];
    return {
      path: relative(cwd, dir),
      status: "ok",
      todo: tasks.filter((status) => status === "todo").length,
      ready: tasks.filter((status) => status === "ready").length,
      in_progress: tasks.filter((status) => status === "in_progress").length,
      blocked: tasks.filter((status) => status === "blocked").length,
      review: tasks.filter((status) => status === "review").length,
      done: tasks.filter((status) => status === "done").length
    };
  } catch {
    return { path: relative(cwd, dir), status: "error", todo: null, ready: null, in_progress: null, blocked: null, review: null, done: null };
  }
}

function readTaskStatus(file: string) {
  const text = readFileSync(file, "utf8");
  return text.match(/^---\r?\n[\s\S]*?\bstatus:\s*([^\r\n]+)[\s\S]*?\r?\n---\r?\n?/)?.[1]?.trim() ?? "";
}

function handoffs(cwd: string, dir: string) {
  return handoffEntries(cwd, dir).slice(0, 5);
}

function handoffEntries(cwd: string, dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && handoffName.test(entry.name))
    .map((entry) => ({ file: entry.name, path: relative(cwd, join(dir, entry.name)) }))
    .sort((a, b) => b.file.localeCompare(a.file));
}

function recentNotes(cwd: string, dir: string, limit: number) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && noteName.test(entry.name))
    .map((entry) => ({ file: entry.name, path: relative(cwd, join(dir, entry.name)) }))
    .sort((a, b) => b.file.localeCompare(a.file))
    .slice(0, limit);
}

function resumeContext(cwd: string, root: string, role: string) {
  const allHandoffs = handoffEntries(cwd, join(root, "_shared", "handoff_logs"));
  const plannerHandoff = allHandoffs.find((entry) => entry.file.endsWith("_planner.md")) ?? null;
  const latestHandoff = allHandoffs[0] ?? null;
  const notes = recentNotes(cwd, join(root, "_shared", "notes"), 3);
  const includeLatest = Boolean(latestHandoff && (!plannerHandoff || latestHandoff.file !== plannerHandoff.file) && (role === "planner" || role === "worker" || role === "reviewer"));
  return { plannerHandoff, latestHandoff: includeLatest ? latestHandoff : null, notes };
}

function printResumeContext(model: { plannerHandoff: { path: string } | null; latestHandoff: { path: string } | null; notes: { path: string }[] }) {
  console.log("Resume context:");
  if (!model.plannerHandoff && !model.latestHandoff && !model.notes.length) {
    console.log("  none");
    return;
  }
  if (model.plannerHandoff) console.log(`  Planner handoff: ${model.plannerHandoff.path}`);
  if (model.latestHandoff) console.log(`  Latest handoff: ${model.latestHandoff.path}`);
  if (model.notes.length) {
    console.log("  Shared findings notes:");
    for (const note of model.notes) console.log(`    ${note.path}`);
  }
}

function credScope(root: string, name: string) {
  const base = join(root, ".creds", name);
  return {
    env: `${base}.env`,
    keys: readDeclaredKeys(`${base}.toml`)
  };
}

function readDeclaredKeys(file: string) {
  if (!existsSync(file)) return [];
  const data = parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return isRecord(data.keys) ? Object.keys(data.keys).sort() : [];
}

function readJson(file: string) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function printStatus(model: ReturnType<typeof statusModel>) {
  console.log(`Workspace: ${model.workspace}`);
  console.log(`Session: ${model.session.path}`);
  console.log(`Shared tasks: ${formatQueue(model.queues.shared)}`);
  console.log("Loop:");
  console.log(`  lock: ${formatLoopLock(model.loop.lock)}`);
  console.log(`  next: ${formatLoopNextAction(model.loop.next_action)}`);
  console.log(`  worker: ${formatLoopRun(model.loop.latest_runs.worker)}`);
  console.log(`  reviewer: ${formatLoopRun(model.loop.latest_runs.reviewer)}`);
  console.log("Agents:");
  for (const agent of model.agents) {
    console.log(`  ${agent.name}\trole=${agent.role}\ttool=${agent.tool}\tstatus=${agent.status}`);
  }
  console.log("Handoffs:");
  if (!model.handoffs.length) console.log("  none");
  for (const handoff of model.handoffs) console.log(`  ${handoff.file}`);
}

function printCredScope(cwd: string, name: string, scope: { env: string; keys: string[] }) {
  console.log(`  ${name} env: ${relative(cwd, scope.env)}`);
  console.log(`  ${name} keys: ${scope.keys.length ? scope.keys.join(", ") : "(none declared)"}`);
}

function formatQueue(queue: { status: string; todo: number | null; ready: number | null; in_progress: number | null; blocked: number | null; review: number | null; done: number | null }) {
  return queue.status === "ok" ? `${queue.todo} todo, ${queue.ready} ready, ${queue.in_progress} in_progress, ${queue.blocked} blocked, ${queue.review} review, ${queue.done} done` : "error";
}

function formatLoopLock(lock: { locked: boolean; pid: string | null; path: string }) {
  return lock.locked ? `locked pid=${lock.pid === null ? "(missing)" : JSON.stringify(lock.pid)} path=${lock.path}` : `unlocked path=${lock.path}`;
}

function formatLoopNextAction(action: { kind: string; task_id: string | null; title: string | null; agent: string | null }) {
  if (action.kind === "idle") return "idle";
  return `${action.kind} agent=${action.agent} task=${action.task_id} title=${action.title}`;
}

function formatLoopRun(run: { agent: string; role: string | null; tool: string | null; task_id: string | null; exit_status: number | null; final_task_status: string | null; failure_summary: string | null; path: string } | null) {
  if (!run) return "none";
  const parts = [
    `tool=${run.tool ?? "unknown"}`,
    `task=${run.task_id ?? "unknown"}`,
    `exit=${run.exit_status ?? "unknown"}`,
    `final=${run.final_task_status ?? "unknown"}`
  ];
  if (run.failure_summary) parts.push(`failure=${JSON.stringify(run.failure_summary)}`);
  parts.push(`path=${run.path}`);
  return parts.join(" ");
}

function flag(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(text: string) {
  console.error(text);
  return 1;
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
