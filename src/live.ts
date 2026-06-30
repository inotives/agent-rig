import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@iarna/toml";
import { readAgents, requireWorkspace, tools } from "./workspace.js";

const handoffName = /^\d{4}-\d{2}-\d{2}-\d{4}_.+_[a-z0-9-]+_[a-z][a-z0-9-]*\.md$/;

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
        last_seen_at: live.last_seen_at ?? null,
        queue: queueState(cwd, join(root, agent.name, "queue.json"))
      };
    }),
    handoffs: handoffs(cwd, join(root, "_shared", "handoff_logs"))
  };
}

function queueState(cwd: string, file: string) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(data)) throw new Error("not an array");
    return {
      path: relative(cwd, file),
      status: "ok",
      pending: data.filter((item) => isRecord(item) && item.status === "ready").length,
      running: data.filter((item) => isRecord(item) && item.status === "running").length,
      blocked: data.filter((item) => isRecord(item) && item.status === "blocked").length,
      done: data.filter((item) => isRecord(item) && item.status === "done").length
    };
  } catch {
    return { path: relative(cwd, file), status: "error", pending: null, running: null, blocked: null, done: null };
  }
}

function tasksState(cwd: string, dir: string) {
  try {
    const tasks = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => readTaskStatus(join(dir, entry.name))) : [];
    return {
      path: relative(cwd, dir),
      status: "ok",
      pending: tasks.filter((status) => status === "todo" || status === "ready").length,
      running: tasks.filter((status) => status === "in_progress").length,
      blocked: tasks.filter((status) => status === "blocked").length,
      done: tasks.filter((status) => status === "done").length
    };
  } catch {
    return { path: relative(cwd, dir), status: "error", pending: null, running: null, blocked: null, done: null };
  }
}

function readTaskStatus(file: string) {
  const text = readFileSync(file, "utf8");
  return text.match(/^---\r?\n[\s\S]*?\bstatus:\s*([^\r\n]+)[\s\S]*?\r?\n---\r?\n?/)?.[1]?.trim() ?? "";
}

function handoffs(cwd: string, dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && handoffName.test(entry.name))
    .map((entry) => ({ file: entry.name, path: relative(cwd, join(dir, entry.name)) }))
    .sort((a, b) => b.file.localeCompare(a.file))
    .slice(0, 5);
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
  console.log("Agents:");
  for (const agent of model.agents) {
    console.log(`  ${agent.name}\trole=${agent.role}\ttool=${agent.tool}\tstatus=${agent.status}\tqueue=${formatQueue(agent.queue)}`);
  }
  console.log("Handoffs:");
  if (!model.handoffs.length) console.log("  none");
  for (const handoff of model.handoffs) console.log(`  ${handoff.file}`);
}

function printCredScope(cwd: string, name: string, scope: { env: string; keys: string[] }) {
  console.log(`  ${name} env: ${relative(cwd, scope.env)}`);
  console.log(`  ${name} keys: ${scope.keys.length ? scope.keys.join(", ") : "(none declared)"}`);
}

function formatQueue(queue: { status: string; pending: number | null; running: number | null; blocked: number | null; done: number | null }) {
  return queue.status === "ok" ? `${queue.pending} pending, ${queue.running} running, ${queue.blocked} blocked, ${queue.done} done` : "error";
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
