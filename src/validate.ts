import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "@iarna/toml";

type Problem = { path: string; message: string };
type Result = { errors: Problem[]; warnings: Problem[] };

const roles = new Set(["supervisor", "planner", "worker", "verifier", "reviewer", "tester", "custom"]);
const tools = new Set(["claude", "codex", "opencode", "custom"]);
const flatKeys = new Set(["name", "role", "tool", "instructions", "context", "queue", "handoff_log", "shared_context", "shared_queue"]);
const topKeys = new Set([...flatKeys, "agent", "permissions"]);
const agentKeys = new Set(flatKeys);
const permissionKeys = new Set(["writable_paths"]);

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

function validateWorkspace(cwd: string): Result {
  const result: Result = { errors: [], warnings: [] };
  const root = join(cwd, ".agent-rig");

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    error(result, ".agent-rig", "Missing .agent-rig/ in the current directory.");
    return result;
  }

  validateShared(root, result);
  validateCreds(cwd, root, result);

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || ["_shared", "human", "skills", "tools", "channels"].includes(entry.name)) continue;
    const agentDir = join(root, entry.name);
    const tomlPath = join(agentDir, "agent.toml");
    if (existsSync(tomlPath)) validateAgent(entry.name, agentDir, tomlPath, result);
  }

  return result;
}

function validateShared(root: string, result: Result) {
  jsonObject(join(root, "_shared", "agent-rig.json"), result, ["workspace_version", "scaffold_version", "created_by"], (data) => {
    if (!isRecord(data.created_by) || typeof data.created_by.name === "undefined" || typeof data.created_by.version === "undefined") {
      error(result, "_shared/agent-rig.json", "created_by.name and created_by.version are required.");
    }
  });
  jsonObject(join(root, "_shared", "session.json"), result, ["version", "created_at", "updated_at", "agents", "current_task_id", "blockers"]);
  jsonArray(join(root, "_shared", "task_queue.json"), result);
  nonEmptyMarkdown(join(root, "_shared", "context.md"), result);
}

function validateAgent(name: string, dir: string, tomlPath: string, result: Result) {
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

  for (const key of ["instructions", "context", "queue"]) {
    if (!stringField(agentTable, key)) error(result, rel(tomlPath), `${key} is required.`);
  }

  validateLocalRef(agentTable, "instructions", dir, result, true);
  validateLocalRef(agentTable, "context", dir, result, true);
  validateLocalRef(agentTable, "queue", dir, result, false);
  validateLocalRef(agentTable, "handoff_log", dir, result, false);
  validateSharedRef(agentTable, "shared_context", dir, result, true);
  validateSharedRef(agentTable, "shared_queue", dir, result, false);

  const queue = stringField(agentTable, "queue");
  if (queue) jsonArray(resolve(dir, queue), result);

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
    for (const file of tracked) error(result, file, "Credential files must not be tracked by git.");
    return;
  }

  const ignore = join(root, ".creds", ".gitignore");
  if (!existsSync(ignore)) error(result, rel(ignore), ".creds/.gitignore is required outside git repos.");
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
