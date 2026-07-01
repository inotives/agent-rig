import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "@iarna/toml";
import { parse as parseYaml } from "yaml";
import { credsGitignore, roles, tools } from "./workspace.js";
import { listWorkspaceProfiles } from "./profiles.js";

export type Problem = { path: string; message: string };
export type Result = { errors: Problem[]; warnings: Problem[] };

const flatKeys = new Set(["name", "role", "tool", "instructions", "context", "handoff_log", "shared_context"]);
const topKeys = new Set([...flatKeys, "agent", "permissions"]);
const agentKeys = new Set(flatKeys);
const permissionKeys = new Set(["writable_paths"]);
const handoffName = /^\d{4}-\d{2}-\d{2}-\d{4}_.+_[a-z0-9-]+_[a-z][a-z0-9-]*\.md$/;
const sharedTaskStatuses = new Set(["todo", "ready", "in_progress", "blocked", "review", "done"]);
const sharedTaskTypes = new Set(["task", "bug", "story", "epic", "chore", "research", "doc"]);
const taskPriorities = new Set(["low", "normal", "high"]);
const taskKeys = new Set(["id", "title", "type", "status", "assigned_to", "created_by", "created_on", "updated_on", "priority", "parent", "depends_on", "blocked_reason", "blocked_on", "message", "run_id", "started_at", "finished_at", "source", "simulate"]);

export function runValidate(args: string[], cwd: string) {
  const json = args.includes("--json");
  const unknown = args.filter((arg) => arg !== "--json");
  const result = unknown.length ? { errors: unknown.map((arg) => ({ path: ".", message: `Unknown option: ${arg}` })), warnings: [] } : validateWorkspace(cwd);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  return result.errors.length ? 1 : 0;
}

export function validateWorkspace(cwd: string): Result {
  const result: Result = { errors: [], warnings: [] };
  const root = join(cwd, ".agent-rig");

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    error(result, ".agent-rig", "Missing .agent-rig/ in the current directory.");
    return result;
  }

  validateShared(root, result);
  validateCreds(cwd, root, result);
  validateHandoffLogs(root, result);

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || ["_shared", "human", "skills", "tools", "channels"].includes(entry.name)) continue;
    const agentDir = join(root, entry.name);
    const tomlPath = join(agentDir, "agent.toml");
    if (existsSync(tomlPath)) validateAgent(entry.name, agentDir, tomlPath, result);
  }

  return result;
}

function validateShared(root: string, result: Result) {
  warnMissingDir(join(root, "_shared", "profiles"), result);
  warnMissingDir(join(root, "_shared", "tools"), result);
  for (const warning of listWorkspaceProfiles(root).warnings) warn(result, warning.path, warning.message);
  jsonObject(join(root, "_shared", "agent-rig.json"), result, ["workspace_version", "scaffold_version", "created_by"], (data) => {
    if (!isRecord(data.created_by) || typeof data.created_by.name === "undefined" || typeof data.created_by.version === "undefined") {
      error(result, "_shared/agent-rig.json", "created_by.name and created_by.version are required.");
    }
  });
  jsonObject(join(root, "_shared", "session.json"), result, ["version", "created_at", "updated_at", "agents", "current_task_id", "blockers"]);
  warnMissingDir(join(root, "_shared", "tasks"), result);
  validateSharedTasks(root, result);
  nonEmptyMarkdown(join(root, "_shared", "context.md"), result);
}

function validateAgent(name: string, dir: string, tomlPath: string, result: Result) {
  warnMissingDir(join(dir, "skills"), result);
  warnMissingDir(join(dir, "tools"), result);
  let data: unknown;
  try {
    data = parse(readFileSync(tomlPath, "utf8"));
  } catch (cause) {
    error(result, rel(tomlPath), `Invalid TOML: ${cause instanceof Error ? cause.message : String(cause)}`);
    return;
  }

  if (!isRecord(data)) {
    error(result, rel(tomlPath), "agent.toml must parse to a table.");
    return;
  }

  warnUnknown(data, topKeys, rel(tomlPath), result);
  const agentTable = isRecord(data.agent) ? data.agent : data;
  if (isRecord(data.agent)) warnUnknown(data.agent, agentKeys, rel(tomlPath), result);
  if (isRecord(data.permissions)) warnUnknown(data.permissions, permissionKeys, rel(tomlPath), result);

  const explicitName = stringField(agentTable, "name");
  if (explicitName && explicitName !== name) error(result, rel(tomlPath), `Agent name "${explicitName}" must match folder "${name}".`);

  const role = stringField(agentTable, "role");
  if (!role) error(result, rel(tomlPath), "role is required.");
  else if (!roles.has(role)) {
    if (/^[a-z][a-z0-9-]{0,39}$/.test(role)) warn(result, rel(tomlPath), `Unknown role "${role}".`);
    else error(result, rel(tomlPath), `Invalid role slug "${role}".`);
  }

  const tool = stringField(agentTable, "tool");
  if (!tool) error(result, rel(tomlPath), "tool is required.");
  else if (!tools.has(tool)) error(result, rel(tomlPath), `Unknown tool "${tool}".`);

  for (const key of ["instructions", "context"]) {
    if (!stringField(agentTable, key)) error(result, rel(tomlPath), `${key} is required.`);
  }

  validateLocalRef(agentTable, "instructions", dir, result, true);
  validateLocalRef(agentTable, "context", dir, result, true);
  validateLocalRef(agentTable, "handoff_log", dir, result, false);
  validateSharedRef(agentTable, "shared_context", dir, result, true);

  if (isRecord(data.permissions) && Array.isArray(data.permissions.writable_paths)) {
    for (const path of data.permissions.writable_paths) {
      if (typeof path === "string") ensureInside(resolve(dir, path), dir, rel(tomlPath), `writable path "${path}" must stay inside the agent folder.`, result);
    }
  }
}

function validateLocalRef(table: Record<string, unknown>, key: string, dir: string, result: Result, markdown: boolean) {
  const value = stringField(table, key);
  if (!value) return;
  const target = resolve(dir, value);
  if (!ensureInside(target, dir, rel(join(dir, "agent.toml")), `${key} must stay inside the agent folder.`, result)) return;
  if (markdown) nonEmptyMarkdown(target, result);
  else requireFile(target, result);
}

function validateSharedRef(table: Record<string, unknown>, key: string, dir: string, result: Result, markdown: boolean) {
  const value = stringField(table, key);
  if (!value) return;
  const shared = resolve(dir, "..", "_shared");
  const target = resolve(dir, value);
  if (!ensureInside(target, shared, rel(join(dir, "agent.toml")), `${key} must stay inside .agent-rig/_shared/.`, result)) return;
  if (markdown) nonEmptyMarkdown(target, result);
  else requireFile(target, result);
}

function validateCreds(cwd: string, root: string, result: Result) {
  const git = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (git.status === 0) {
    const tracked = spawnSync("git", ["-C", cwd, "ls-files", ".agent-rig/.creds"], { encoding: "utf8" }).stdout.trim().split(/\r?\n/).filter(Boolean);
    for (const file of tracked) {
      if (file.endsWith(".env") && !file.endsWith(".env.example")) error(result, file, "Real credential .env files must not be tracked by git.");
    }
  }

  const ignore = join(root, ".creds", ".gitignore");
  if (!existsSync(ignore)) error(result, rel(ignore), ".creds/.gitignore is required.");
  else if (readFileSync(ignore, "utf8") !== credsGitignore) error(result, rel(ignore), ".creds/.gitignore must allow *.toml and *.env.example while ignoring real *.env files.");

  const dir = join(root, ".creds");
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".toml")) validateCredDeclaration(join(dir, entry.name), result);
  }
}

function validateCredDeclaration(path: string, result: Result) {
  let data: unknown;
  try {
    data = parse(readFileSync(path, "utf8"));
  } catch (cause) {
    error(result, rel(path), `Invalid TOML: ${cause instanceof Error ? cause.message : String(cause)}`);
    return;
  }
  if (!isRecord(data) || !isRecord(data.keys)) {
    error(result, rel(path), "Credential declaration must contain a [keys] table.");
    return;
  }

  const scope = path.endsWith("_shared.toml") ? "SHARED" : path.split(/[\\/]/).pop()!.replace(/\.toml$/, "").toUpperCase().replaceAll("-", "_");
  const keys = Object.keys(data.keys);
  for (const key of keys) {
    const parts = key.match(/^AGENTRIG_([A-Z0-9]+)_([A-Z0-9_]+)_([A-Z0-9]+)$/);
    if (!parts || parts[2] !== scope) error(result, rel(path), `Invalid AgentRig credential key for ${scope}: ${key}`);
  }

  const example = path.replace(/\.toml$/, ".env.example");
  if (!requireFile(example, result)) return;
  const exampleKeys = readFileSync(example, "utf8").split(/\r?\n/).filter(Boolean).map((line) => line.split("=")[0]);
  for (const key of keys) if (!exampleKeys.includes(key)) error(result, rel(example), `Missing key from .env.example: ${key}`);
  for (const key of exampleKeys) if (!keys.includes(key)) error(result, rel(example), `Unexpected key in .env.example: ${key}`);
}

function validateHandoffLogs(root: string, result: Result) {
  const dir = join(root, "_shared", "handoff_logs");
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md") && !handoffName.test(entry.name)) {
      warn(result, rel(join(dir, entry.name)), "Handoff log filename should use <date-YYYY-MM-DD-hhmm>_<run_id>_<tool>_<role>.md.");
    }
  }
}

function validateSharedTasks(root: string, result: Result) {
  const dir = join(root, "_shared", "tasks");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;

  const agents = new Set(agentNames(root));
  const tasks = new Map<string, { file: string; meta: Record<string, unknown>; body: string }>();

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const file = join(dir, entry.name);
    const parsed = parseSharedTask(file, result);
    if (!parsed) continue;
    tasks.set(typeof parsed.meta.id === "string" ? parsed.meta.id : entry.name.replace(/\.md$/, ""), parsed);
  }

  for (const [id, task] of tasks) {
    warnUnknown(task.meta, taskKeys, rel(task.file), result);
    for (const key of ["id", "title", "type", "status", "assigned_to", "created_by", "created_on", "updated_on", "priority", "depends_on"]) {
      if (typeof task.meta[key] === "undefined") warn(result, rel(task.file), `Task frontmatter ${key} is required.`);
    }
    if (typeof task.meta.id === "string" && task.meta.id !== id) warn(result, rel(task.file), "Task frontmatter id should match the task record id.");
    if (typeof task.meta.type === "string" && !sharedTaskTypes.has(task.meta.type)) warn(result, rel(task.file), `Invalid task type "${task.meta.type}".`);
    if (typeof task.meta.status === "string" && !sharedTaskStatuses.has(task.meta.status)) warn(result, rel(task.file), `Invalid task status "${task.meta.status}".`);
    if (typeof task.meta.priority === "string" && !taskPriorities.has(task.meta.priority)) warn(result, rel(task.file), `Invalid task priority "${task.meta.priority}".`);
    if (typeof task.meta.assigned_to === "string" && task.meta.assigned_to && !agents.has(task.meta.assigned_to)) warn(result, rel(task.file), `Unknown assigned_to agent "${task.meta.assigned_to}".`);
    if (task.meta.status === "ready" && !task.meta.assigned_to) warn(result, rel(task.file), "Ready task is missing assigned_to and will be skipped by watch.");
    if (typeof task.meta.parent === "string" && task.meta.parent && !tasks.has(task.meta.parent)) warn(result, rel(task.file), `Missing parent task "${task.meta.parent}".`);
    if (typeof task.meta.depends_on !== "undefined" && !Array.isArray(task.meta.depends_on)) warn(result, rel(task.file), "Task frontmatter depends_on must be an array.");
    if (Array.isArray(task.meta.depends_on)) {
      for (const dep of task.meta.depends_on) {
        if (typeof dep !== "string") {
          warn(result, rel(task.file), "Task dependency IDs must be strings.");
          continue;
        }
        const dependency = tasks.get(dep);
        if (!dependency) warn(result, rel(task.file), `Missing dependency task "${dep}".`);
        else if (dependency.meta.status !== "done") warn(result, rel(task.file), `Dependency task "${dep}" is not done.`);
      }
    }
    if (!/^## Acceptance Criteria\b/m.test(task.body) || !/^- \[[ xX]\] /m.test(task.body)) {
      warn(result, rel(task.file), "Task acceptance criteria should use Markdown checklist items.");
    }
  }
}

function agentNames(root: string) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !["_shared", "human", "skills", "tools", "channels"].includes(entry.name))
    .filter((entry) => existsSync(join(root, entry.name, "agent.toml")))
    .map((entry) => entry.name);
}

function parseSharedTask(file: string, result: Result) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (cause) {
    error(result, rel(file), `Unable to read task file: ${cause instanceof Error ? cause.message : String(cause)}`);
    return undefined;
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    error(result, rel(file), "Task Markdown must contain YAML frontmatter.");
    return undefined;
  }
  try {
    const meta = parseYaml(match[1]);
    if (!isRecord(meta)) {
      error(result, rel(file), "Task frontmatter must be an object.");
      return undefined;
    }
    return { file, meta, body: text.slice(match[0].length) };
  } catch (cause) {
    error(result, rel(file), `Invalid task frontmatter: ${cause instanceof Error ? cause.message : String(cause)}`);
    return undefined;
  }
}

function jsonObject(path: string, result: Result, keys: string[], extra?: (data: Record<string, unknown>) => void) {
  const data = readJson(path, result);
  if (!isRecord(data)) {
    if (data !== undefined) error(result, rel(path), "Expected a JSON object.");
    return;
  }
  for (const key of keys) if (typeof data[key] === "undefined") error(result, rel(path), `${key} is required.`);
  extra?.(data);
}

function jsonArray(path: string, result: Result) {
  const data = readJson(path, result);
  if (data !== undefined && !Array.isArray(data)) error(result, rel(path), "Expected a JSON array.");
}

function readJson(path: string, result: Result) {
  if (!requireFile(path, result)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    error(result, rel(path), `Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    return undefined;
  }
}

function nonEmptyMarkdown(path: string, result: Result) {
  if (!requireFile(path, result)) return;
  if (!readFileSync(path, "utf8").trim()) error(result, rel(path), "Markdown file must not be empty.");
}

function requireFile(path: string, result: Result) {
  if (existsSync(path) && statSync(path).isFile()) return true;
  error(result, rel(path), "Missing referenced file.");
  return false;
}

function warnMissingDir(path: string, result: Result) {
  if (!existsSync(path) || !statSync(path).isDirectory()) warn(result, rel(path), "Missing recommended directory.");
}

function ensureInside(target: string, base: string, path: string, message: string, result: Result) {
  const outside = relative(base, target).startsWith("..") || relative(base, target) === "..";
  if (outside) error(result, path, message);
  return !outside;
}

function warnUnknown(data: Record<string, unknown>, known: Set<string>, path: string, result: Result) {
  for (const key of Object.keys(data)) if (!known.has(key)) warn(result, path, `Unknown field "${key}".`);
}

function stringField(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" ? data[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rel(path: string) {
  return path.includes(".agent-rig") ? path.slice(path.indexOf(".agent-rig")) : path;
}

function error(result: Result, path: string, message: string) {
  result.errors.push({ path, message });
}

function warn(result: Result, path: string, message: string) {
  result.warnings.push({ path, message });
}

function printHuman(result: Result) {
  if (!result.errors.length && !result.warnings.length) {
    console.log("AgentRig workspace is valid.");
    return;
  }
  for (const item of result.errors) console.error(`error ${item.path}: ${item.message}`);
  for (const item of result.warnings) console.warn(`warning ${item.path}: ${item.message}`);
}
