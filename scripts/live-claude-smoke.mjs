#!/usr/bin/env node
// Live Claude smoke test for `agent-rig loop`.
//
// WARNING: the run steps start real Claude agents. They use the Claude usage
// allowance of the person who runs them. This script is NOT part of `npm test`.
// Keep the tasks tiny and use --max-claude-runs to cap the cost.
//
// Usage:
//   node scripts/live-claude-smoke.mjs <step> [--workspace <name>] [--dry-run] [--no-sandbox] [--max-claude-runs <n>]
//
// Steps:
//   setup        Create a new scratch workspace and two tiny tasks. Starts no Claude.
//   run-happy    Run the happy-path task through worker, reviewer, and planner done.
//   run-repair   Run the repair cycle: planted flaw, changes_requested, repair, approved.
//   report       Print a Markdown report and the contract checks. Exit 1 on a failure or no evidence.
//   cleanup      Delete the workspace (one direct child of the fixed parent folder).
//
// Options:
//   --workspace <name>      A workspace NAME (run-YYYYMMDD-HHMMSS-xxxx), never a path. Default: the newest.
//   --dry-run               Print what the step would do. Starts no process that can change anything.
//   --no-sandbox            Run the loop without the sandbox runner (prints a warning).
//   --max-claude-runs <n>   Claude run limit for the workspace (default 6). The count is kept in the
//                           marker file and counted across calls. `setup` starts a new count.
//
// Path rules: all workspaces live in <realpath of os.tmpdir()>/agent-rig-live-smoke/. The script has
// no option that takes a path. `cleanup` deletes one direct child of that folder and refuses all else.
// The loop runs through .agent-rig/_shared/tools/sandbox-run.sh (macOS sandbox-exec) by default.

import { createHash, randomBytes } from "node:crypto";
import {
  accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync, copyFileSync
} from "node:fs";
import { homedir, tmpdir } from "node:os"; // safe-ops: not a delete target
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

export const PARENT_NAME = "agent-rig-live-smoke";
export const NAME_PATTERN = /^run-[0-9]{8}-[0-9]{6}-[a-z0-9]{4}$/;
export const MARKER_FILE = ".live-smoke-marker.json";
export const MARKER_KIND = "agent-rig-live-smoke";
export const MIN_PATH_COMPONENTS = 4;
export const DEFAULT_MAX_CLAUDE_RUNS = 6;
export const LOOP_TIMEOUT_MS = 15 * 60 * 1000;
export const MAX_ROUNDS = 4;
export const STEPS = ["setup", "run-happy", "run-repair", "report", "cleanup"];
export const HANDOFF_STATUSES = ["review", "changes_requested", "approved", "blocked"];
export const TASK_STATUSES = ["todo", "ready", "in_progress", "review", "blocked", "done"];
export const REVIEWER_DECISIONS = ["approved", "changes_requested", "blocked"];
export const SANDBOX_RUNNER = ".agent-rig/_shared/tools/sandbox-run.sh";
export const NESTED_LOOP_PATTERN = /agent-rig(?:\s+|\/dist\/index\.js["']?\s+)loop|index\.js["']?\s+loop/;

// Extra folders (relative to the home directory) that Claude writes to for its own
// configuration and cache. Only the ones that exist are allowed. Change this list
// when a run shows "Operation not permitted" for another path.
export const CLAUDE_EXTRA_WRITE_PATHS = [
  ".claude",
  ".claude.json",
  "Library/Caches/claude-cli-nodejs",
  ".cache/claude",
  ".local/state/claude",
  ".local/share/claude"
];

const repoRoot = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), ".."));

// ---------- names and paths ----------

export function isValidName(name) {
  return typeof name === "string" && NAME_PATTERN.test(name);
}

const pad = (n, width = 2) => String(n).padStart(width, "0");

export function generateName(now = new Date(), random = () => randomBytes(1)[0] / 256) {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) suffix += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return `run-${date}-${time}-${suffix}`;
}

export function fixedParent() {
  return join(realpathSync.native(tmpdir()), PARENT_NAME);
}

export function ensureParent(parent) {
  if (!existsSync(parent)) mkdirSync(parent, { mode: 0o700 });
  const stat = lstatSync(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`The parent folder is a symbolic link or not a directory: ${parent}`);
  return realpathSync.native(parent);
}

export function hasEnoughComponents(path) {
  return path.split("/").filter(Boolean).length >= MIN_PATH_COMPONENTS;
}

export function isDirectChild(child, parent) {
  return dirname(child) === parent && child !== parent && basename(child) !== "";
}

export function listWorkspaces(parent) {
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidName(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function newestWorkspace(parent) {
  return listWorkspaces(parent).at(-1);
}

// ---------- marker ----------

function readMarkerFile(dir, name) {
  const path = join(dir, MARKER_FILE);
  let stat;
  try { stat = lstatSync(path); } catch { throw new Error(`Refused: the marker file is missing in ${name}`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refused: the marker is not a regular file in ${name}`);
  let marker;
  try { marker = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`Refused: the marker is not valid JSON in ${name}`); }
  if (!marker || marker.kind !== MARKER_KIND || marker.name !== name) throw new Error(`Refused: the marker does not name the workspace ${name}`);
  return marker;
}

function writeMarkerFile(dir, marker) {
  writeFileSync(join(dir, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

// ---------- removal ----------

// Check every rule. Return the real path of the child. It deletes nothing.
export function checkRemovable(name, parent) {
  if (!isValidName(name)) throw new Error(`Refused: the workspace name is not valid: ${JSON.stringify(name)}`);
  let realParent;
  try { realParent = realpathSync.native(parent); } catch { throw new Error("Refused: the parent folder does not exist"); }
  const child = join(realParent, name);
  let stat;
  try { stat = lstatSync(child); } catch { throw new Error(`Refused: workspace not found, it does not exist: ${name}`); }
  if (stat.isSymbolicLink()) throw new Error(`Refused: ${name} is a symbolic link`);
  if (!stat.isDirectory()) throw new Error(`Refused: ${name} is not a real directory`);
  const realChild = realpathSync.native(child);
  if (!isDirectChild(realChild, realParent) || basename(realChild) !== name) throw new Error(`Refused: ${name} is not a direct child of the parent folder`);
  if (!hasEnoughComponents(realChild)) throw new Error(`Refused: the path has fewer than ${MIN_PATH_COMPONENTS} components`);
  readMarkerFile(realChild, name);
  return realChild;
}

// Delete exactly one workspace folder. The parent is a parameter, so tests pass a temporary parent.
export function removeWorkspace(name, parent) {
  const realChild = checkRemovable(name, parent);
  rmSync(realChild, { recursive: true });
  return realChild;
}

// ---------- arguments, environment, limits ----------

export function parseArgs(argv) {
  const [step, ...rest] = argv;
  if (!STEPS.includes(step)) throw new Error(`Usage: live-claude-smoke.mjs <${STEPS.join("|")}> [--workspace <name>] [--dry-run] [--no-sandbox] [--max-claude-runs <n>]`);
  const args = { step, workspace: undefined, dryRun: false, noSandbox: false, maxClaudeRuns: undefined };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--no-sandbox") args.noSandbox = true;
    else if (flag === "--workspace") {
      args.workspace = rest[++i];
      if (!isValidName(args.workspace)) throw new Error(`--workspace takes a workspace name like run-YYYYMMDD-HHMMSS-xxxx, not a path: ${JSON.stringify(args.workspace)}`);
    } else if (flag === "--max-claude-runs") {
      const text = rest[++i];
      args.maxClaudeRuns = Number(text);
      if (!/^[0-9]+$/.test(text ?? "") || args.maxClaudeRuns < 1) throw new Error(`--max-claude-runs takes a whole number of at least 1: ${text}`);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (step === "setup" && args.workspace) throw new Error("setup creates its own workspace. Do not pass --workspace.");
  return args;
}

export function cleanEnv(env) {
  const copy = { ...env };
  delete copy.AGENT_RIG_ROLE;
  delete copy.AGENT_RIG_LOOP_REVIEW_TASK;
  return copy;
}

export function effectiveMax(option, marker) {
  return option ?? marker.max_claude_runs ?? DEFAULT_MAX_CLAUDE_RUNS;
}

export function assertRunsLeft(marker, max) {
  if ((marker.claude_runs ?? 0) >= max) throw new Error(`Claude run limit reached: ${marker.claude_runs} of ${max} runs used. Raise it with --max-claude-runs.`);
}

export function reserveClaudeRun(marker, max) {
  assertRunsLeft(marker, max);
  return { ...marker, claude_runs: (marker.claude_runs ?? 0) + 1 };
}

// ---------- sandbox command ----------

export function claudeExtraPaths(home) {
  return CLAUDE_EXTRA_WRITE_PATHS.map((rel) => join(home, rel)).filter((path) => existsSync(path));
}

export function buildLoopCommand({ repo, workspace, sandbox, extraPaths, nodePath }) {
  const loop = [nodePath, join(repo, "dist", "index.js"), "loop", "--once"];
  if (!sandbox) return { command: loop[0], args: loop.slice(1) };
  const allow = [workspace, ...extraPaths].flatMap((path) => ["--allow-write", path]);
  return { command: join(repo, SANDBOX_RUNNER), args: [...allow, "--", ...loop] };
}

function loopCommandFor(workspace, noSandbox) {
  return buildLoopCommand({
    repo: repoRoot,
    workspace,
    sandbox: !noSandbox,
    extraPaths: claudeExtraPaths(homedir()), // safe-ops: not a delete target
    nodePath: process.execPath
  });
}

function shellText(cmd) {
  return [cmd.command, ...cmd.args].join(" ");
}

function probeRunner(workspace) {
  const runner = join(repoRoot, SANDBOX_RUNNER);
  try { accessSync(runner, constants.X_OK); } catch { throw new Error(`The sandbox runner is not usable (not executable): ${runner}. Use --no-sandbox only if you accept the risk.`); }
  const probe = loopCommandFor(workspace, false);
  const allow = probe.args.slice(0, probe.args.indexOf("--"));
  const result = spawnSync(runner, [...allow, "--", "/usr/bin/true"], { encoding: "utf8", env: cleanEnv(process.env) });
  if (result.status !== 0) {
    throw new Error(`The sandbox runner is not usable (status ${result.status}): ${(result.stderr || "").trim()}. Use --no-sandbox only if you accept the risk.`);
  }
}

// ---------- contract checks (pure functions) ----------

const result = (name, problems, info = []) => ({ name, ok: problems.length === 0, details: problems.length ? problems : info });
const ofSender = (task, sender) => task.handoffs.filter((h) => h.sender === sender);

export function checkWorkerNeverDone(tasks) {
  const problems = [];
  for (const task of tasks) {
    for (const h of ofSender(task, "worker")) {
      if (h.status === "done") problems.push(`${task.id}: the worker set done`);
      else if (h.status !== "review") problems.push(`${task.id}: the worker handoff status is ${h.status}, not review`);
    }
  }
  return result("worker never set done", problems, ["worker handoffs have status review"]);
}

export function checkReviewRounds(tasks) {
  const problems = [];
  for (const task of tasks) {
    const rounds = [];
    for (const h of task.handoffs) {
      if (h.sender === "worker") rounds.push({ reviewers: [] });
      else if (h.sender === "reviewer") {
        if (!rounds.length) problems.push(`${task.id}: a reviewer handoff comes before any worker handoff`);
        else rounds.at(-1).reviewers.push(h);
      }
    }
    rounds.forEach((round, index) => {
      const last = index === rounds.length - 1;
      if (round.reviewers.length > 1) problems.push(`${task.id}: round ${index + 1} has ${round.reviewers.length} reviewer handoffs`);
      for (const h of round.reviewers) if (!REVIEWER_DECISIONS.includes(h.status)) problems.push(`${task.id}: round ${index + 1} reviewer status ${h.status} is not a decision`);
      if (!round.reviewers.length && (!last || task.status === "done")) problems.push(`${task.id}: round ${index + 1} has no reviewer handoff${last ? " but the task is done" : ""}`);
    });
  }
  return result("one reviewer decision per round", problems, ["each round has one reviewer decision"]);
}

export function checkReviewerUnchanged(events) {
  const problems = [];
  for (const e of events.filter((x) => x.kind === "loop-tick" && x.role === "reviewer")) {
    if (!e.reviewer_before || !e.reviewer_after) problems.push(`${e.task}: no before/after hash for a reviewer run`);
    else if (e.reviewer_before !== e.reviewer_after) problems.push(`${e.task}: the reviewer run changed the deliverables`);
  }
  return result("reviewer left deliverables unchanged", problems, ["hash before and after each reviewer run is equal"]);
}

export function checkNoNestedLoop(texts) {
  const problems = texts.filter((t) => NESTED_LOOP_PATTERN.test(t.text)).map((t) => `${t.source}: contains an agent-rig loop command`);
  return result("no nested loop", problems, ["no loop command in last-message.md or result.json stdout (best effort: tool calls are not visible)"]);
}

export function checkCanonicalStatuses(tasks) {
  const problems = [];
  for (const task of tasks) {
    if (!TASK_STATUSES.includes(task.status)) problems.push(`${task.id}: task status ${task.status} is not canonical`);
    for (const h of task.handoffs) if (!HANDOFF_STATUSES.includes(h.status)) problems.push(`${task.id}: handoff status ${h.status} is not canonical`);
  }
  return result("canonical statuses", problems, ["all statuses are canonical"]);
}

export function checkStateChanges(tasks, events) {
  const problems = [];
  const planner = events.filter((e) => e.kind === "planner-action");
  for (const task of tasks) {
    if (task.status === "done" && !planner.some((e) => e.task === task.id && e.action === "done")) problems.push(`${task.id}: done without a planner action`);
  }
  for (const e of events.filter((x) => x.kind === "loop-tick" && x.final_status === "done")) problems.push(`${e.task}: a loop run ended with the task done`);
  const info = [
    ...planner.map((e) => `planner action: ${e.action} ${e.task}`),
    ...events.filter((e) => e.kind === "loop-tick").map((e) => `loop run: ${e.role} on ${e.task} (task status after: ${e.final_status})`)
  ];
  return result("state changes only by planner actions or the loop", problems, info);
}

export function evaluateContract({ tasks, events, texts, runFolders }) {
  const ticks = events.filter((e) => e.kind === "loop-tick").length;
  const evidence = runFolders > 0 || ticks > 0
    ? result("evidence", [], [`${runFolders} run folder(s), ${ticks} loop run event(s)`])
    : result("evidence", ["no evidence: no run folders and no loop run events"]);
  const checks = [
    evidence,
    checkWorkerNeverDone(tasks),
    checkReviewRounds(tasks),
    checkReviewerUnchanged(events),
    checkNoNestedLoop(texts),
    checkCanonicalStatuses(tasks),
    checkStateChanges(tasks, events)
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

export function renderReport({ tasks, events, evaluation }) {
  const lines = ["# Live Claude smoke report", ""];
  for (const task of tasks) {
    lines.push(`## ${task.id}: ${task.title ?? ""}`.trimEnd(), `Status: ${task.status}`, "");
    for (const h of task.handoffs) lines.push(`- #${h.sequence ?? "?"} ${h.sender} -> ${h.recipient}: ${h.status}`);
    lines.push("");
  }
  lines.push("## Planner actions and loop runs", "");
  for (const e of events) {
    if (e.kind === "planner-action") lines.push(`- planner action: ${e.action} ${e.task}${e.command ? ` (${e.command})` : ""}`);
    else if (e.kind === "loop-tick") lines.push(`- loop run ${e.run_number ?? "?"}: ${e.role} on ${e.task}, task status after: ${e.final_status}`);
    else lines.push(`- ${e.kind}: ${e.task ?? ""}`);
  }
  lines.push("", "## Contract checks", "");
  for (const c of evaluation.checks) {
    lines.push(`- ${c.ok ? "PASS" : "FAIL"}: ${c.name}`);
    for (const d of c.details) lines.push(`  - ${d}`);
  }
  lines.push("", "Note: `claude -p` shows only the final message, so tool calls are not visible. The nested loop check is best effort.", "");
  lines.push(`Result: ${evaluation.ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

// ---------- workspace store (read only) ----------

export function readWorkspaceData(dir) {
  const db = new Database(join(dir, ".agent-rig", "_shared", "workflow.sqlite"), { readonly: true, fileMustExist: true });
  try {
    const tasks = db.prepare("select task_id, title, status from tasks order by task_id").all();
    const handoffs = db.prepare("select task_id, sequence, sender, recipient, status, message_markdown from handoffs order by task_id, sequence").all();
    return tasks.map((t) => ({
      id: t.task_id,
      title: t.title,
      status: t.status,
      handoffs: handoffs.filter((h) => h.task_id === t.task_id).map((h) => ({ sequence: h.sequence, sender: h.sender, recipient: h.recipient, status: h.status, message: h.message_markdown }))
    }));
  } finally {
    db.close();
  }
}

// Read the text of each run: last-message.md and the stdout of result.json. Never prompt.md.
export function readRunTexts(dir) {
  const texts = [];
  let runFolders = 0;
  for (const agent of ["worker", "reviewer"]) {
    const runs = join(dir, ".agent-rig", agent, "runs");
    if (!existsSync(runs)) continue;
    for (const run of readdirSync(runs, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      runFolders += 1;
      const base = join(runs, run.name);
      const last = join(base, "last-message.md");
      if (existsSync(last)) texts.push({ source: `${agent}/runs/${run.name}/last-message.md`, text: readFileSync(last, "utf8") });
      const json = join(base, "result.json");
      if (existsSync(json)) {
        try { texts.push({ source: `${agent}/runs/${run.name}/result.json stdout`, text: String(JSON.parse(readFileSync(json, "utf8")).stdout ?? "") }); } catch { /* bad JSON: no text */ }
      }
    }
  }
  return { texts, runFolders };
}

// Hash of git status, git diff, and untracked file content. Files that the CLI and the loop write are excluded.
export function fingerprint(dir) {
  const git = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env: cleanEnv(process.env) }).stdout ?? "";
  const skip = (path) => path === MARKER_FILE || path.startsWith(".agent-rig/");
  const hash = createHash("sha256");
  hash.update(git(["status", "--porcelain=v1", "-uall"]).split("\n").filter((l) => l && !skip(l.slice(3))).join("\n"));
  hash.update("\0diff\0").update(git(["diff"]));
  for (const file of git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter((f) => f && !skip(f)).sort()) {
    const stat = lstatSync(join(dir, file));
    hash.update(`\0file ${file}\0`).update(stat.isSymbolicLink() ? readlinkSync(join(dir, file)) : readFileSync(join(dir, file)));
  }
  return hash.digest("hex");
}

// ---------- scenario content ----------

const HAPPY_CHECK = `import { readFileSync } from "node:fs";
const text = readFileSync("hello.txt", "utf8");
if (text !== "hello world\\n") { console.error("hello.txt must be exactly: hello world + newline"); process.exit(1); }
console.log("hello.txt ok");
`;

const REPAIR_CHECK = `import { readFileSync } from "node:fs";
const text = readFileSync("greeting.txt", "utf8");
if (text !== "good morning\\n") { console.error("greeting.txt must be exactly: good morning + newline"); process.exit(1); }
console.log("greeting.txt ok");
`;

const brief = (goal, file, content, check) => `# Task

## Context

A tiny live test of the AgentRig loop. Keep the change as small as possible.

## Goal

${goal}

## Scope

- Create or change only \`${file}\`.
- Do not change \`${check}\`.

## Planner Notes

\`${file}\` must contain exactly \`${content}\` and a newline. Run \`node ${check}\` before you hand off.

## Implementation Plan

1. Write \`${file}\`.
2. Run \`node ${check}\`. It must exit 0.

## Acceptance Criteria

- [ ] \`${file}\` contains exactly \`${content}\` and a newline.
- [ ] \`node ${check}\` exits 0.
`;

export const HAPPY_TITLE = "Live smoke: happy path, write hello.txt";
export const REPAIR_TITLE = "Live smoke: repair cycle, write greeting.txt";
export const PLANTED_CONTENT = "Good morning\n";

// ---------- process helpers ----------

class StepError extends Error {}

function cliArgs(args) {
  return [join(repoRoot, "dist", "index.js"), ...args];
}

function runCli(dir, args, extraEnv = {}) {
  return spawnSync(process.execPath, cliArgs(args), { cwd: dir, encoding: "utf8", env: { ...cleanEnv(process.env), ...extraEnv } });
}

function mustRun(label, spawned) {
  if (spawned.status !== 0) throw new StepError(`${label} failed (status ${spawned.status}): ${(spawned.stderr || spawned.stdout || "").trim()}`);
  return spawned.stdout;
}

// ---------- steps ----------

function loadContext(args, parent) {
  const realParent = ensureParent(parent);
  const name = args.workspace ?? newestWorkspace(realParent);
  if (!name) throw new StepError("No workspace found. Run the setup step first.");
  const dir = join(realParent, name);
  const stat = existsSync(dir) ? lstatSync(dir) : undefined;
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw new StepError(`Workspace not found: ${name}`);
  const realDir = realpathSync.native(dir);
  return { name, dir: realDir, marker: readMarkerFile(realDir, name), args };
}

function saveMarker(ctx) {
  writeMarkerFile(ctx.dir, ctx.marker);
}

function record(ctx, event) {
  ctx.marker.events.push({ at: new Date().toISOString(), ...event });
  saveMarker(ctx);
}

function warnNoSandbox(args) {
  if (args.noSandbox) console.error("warning: the sandbox is OFF (--no-sandbox). The loop and Claude can write anywhere you can.");
}

function placeholderDir(parent) {
  return join(parent, "run-YYYYMMDD-HHMMSS-xxxx");
}

function stepSetup(args) {
  const parent = fixedParent();
  const name = generateName();
  const dir = join(parent, name);
  if (args.dryRun) {
    console.log(`dry run: setup would create ${dir} (mode 0700 parent ${parent}), run git init and agent-rig init --yes there, set worker and reviewer to tool claude, and create two tasks.`);
    return 0;
  }
  const realParent = ensureParent(parent);
  mkdirSync(join(realParent, name), { mode: 0o700 });
  const realDir = realpathSync.native(join(realParent, name));
  const marker = { kind: MARKER_KIND, name, created_at: new Date().toISOString(), claude_runs: 0, max_claude_runs: args.maxClaudeRuns ?? DEFAULT_MAX_CLAUDE_RUNS, tasks: {}, events: [] };
  writeMarkerFile(realDir, marker);
  buildWorkspace(realDir, marker);
  writeMarkerFile(realDir, marker);
  console.log(`Created workspace ${name}\n${realDir}`);
  return 0;
}

function buildWorkspace(dir, marker) {
  const skip = { AGENT_RIG_SKIP_SKILLS: "1" };
  mustRun("git init", spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8", env: cleanEnv(process.env) }));
  mustRun("agent-rig init", runCli(dir, ["init", "--yes", "--workflow-store", "sqlite"], skip));
  mustRun("add reviewer", runCli(dir, ["add", "reviewer", "--role", "reviewer", "--tool", "claude"], skip));
  mustRun("add planner", runCli(dir, ["add", "planner", "--role", "planner", "--tool", "claude"], skip));
  setWorkerToolToClaude(dir);
  copyCurrentInstructions(dir);
  writeFileSync(join(dir, "check-hello.mjs"), HAPPY_CHECK, "utf8");
  writeFileSync(join(dir, "check-greeting.mjs"), REPAIR_CHECK, "utf8");
  marker.tasks.happy = createTask(dir, HAPPY_TITLE, brief("Create `hello.txt` with exact content.", "hello.txt", "hello world", "check-hello.mjs"));
  marker.tasks.repair = createTask(dir, REPAIR_TITLE, brief("Create `greeting.txt` with exact content.", "greeting.txt", "good morning", "check-greeting.mjs"));
}

// Same keys that `agent-rig add` writes (see agentToml in src/workspace/workspace.ts).
function setWorkerToolToClaude(dir) {
  writeFileSync(join(dir, ".agent-rig", "worker", "agent.toml"), 'role = "worker"\ntool = "claude"\ninstructions = "instructions.md"\ncontext = "context.md"\n', "utf8");
  const file = join(dir, ".agent-rig", "_shared", "session.json");
  const session = JSON.parse(readFileSync(file, "utf8"));
  session.agents.worker.tool = "claude";
  writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function copyCurrentInstructions(dir) {
  for (const role of ["planner", "worker", "reviewer"]) {
    copyFileSync(join(repoRoot, ".agent-rig", role, "instructions.md"), join(dir, ".agent-rig", role, "instructions.md"));
  }
  copyFileSync(join(repoRoot, ".agent-rig", "_shared", "context.md"), join(dir, ".agent-rig", "_shared", "context.md"));
}

function createTask(dir, title, body) {
  const briefFile = join(dir, ".agent-rig", "human", `brief-${createHash("sha1").update(title).digest("hex").slice(0, 8)}.md`);
  writeFileSync(briefFile, body, "utf8");
  const out = mustRun(`create task ${title}`, runCli(dir, ["tasks", "create", title, "--body-file", briefFile, "--assigned-to", "worker", "--status", "todo", "--phase", "live-smoke", "--created-by", "planner"]));
  const id = out.match(/Created (\S+)/)?.[1];
  if (!id) throw new StepError(`Cannot read the new task id from: ${out}`);
  return id;
}

function taskById(ctx, id) {
  const task = readWorkspaceData(ctx.dir).find((t) => t.id === id);
  if (!task) throw new StepError(`Task not found: ${id}`);
  return task;
}

function refuseWhenReviewPending(ctx) {
  const pending = readWorkspaceData(ctx.dir).filter((t) => t.status === "review");
  if (pending.length) throw new StepError(`Another task is in review (${pending.map((t) => t.id).join(", ")}). Finish it first.`);
}

function plannerAction(ctx, id, action, cliArgsList) {
  console.log(`planner action: ${action} ${id} (agent-rig ${cliArgsList.join(" ")})`);
  mustRun(`planner action ${action}`, runCli(ctx.dir, cliArgsList));
  record(ctx, { kind: "planner-action", task: id, action, command: `agent-rig ${cliArgsList.join(" ")}` });
}

const setStatus = (ctx, id, status) => plannerAction(ctx, id, status, ["tasks", "set-status", id, status]);

// One `agent-rig loop --once`. It starts at most one agent. It counts as one Claude run.
function loopTick(ctx, expectRole) {
  const max = effectiveMax(ctx.args.maxClaudeRuns, ctx.marker);
  ctx.marker = reserveClaudeRun(ctx.marker, max);
  saveMarker(ctx);
  const before = fingerprint(ctx.dir);
  const cmd = loopCommandFor(ctx.dir, ctx.args.noSandbox);
  console.log(`loop run ${ctx.marker.claude_runs} of ${max}: ${shellText(cmd)}`);
  const spawned = spawnSync(cmd.command, cmd.args, { cwd: ctx.dir, encoding: "utf8", env: cleanEnv(process.env), timeout: LOOP_TIMEOUT_MS });
  const after = fingerprint(ctx.dir);
  if (spawned.stdout) console.log(spawned.stdout.trimEnd());
  if (spawned.stderr) console.error(spawned.stderr.trimEnd());
  const ran = (spawned.stdout ?? "").match(/^Ran (worker|reviewer) \S+ on (\S+)\.$/m);
  const task = ran?.[2];
  const role = ran?.[1];
  const final_status = task ? taskById(ctx, task).status : undefined;
  record(ctx, { kind: "loop-tick", run_number: ctx.marker.claude_runs, role, task, exit_status: spawned.status, final_status, ...(role === "reviewer" ? { reviewer_before: before, reviewer_after: after } : {}) });
  if (spawned.status !== 0) throw new StepError(`The loop exited with status ${spawned.status}.`);
  if (role !== expectRole) throw new StepError(`Expected the loop to run the ${expectRole}, but it ran: ${role ?? "no agent"}.`);
  return { role, task };
}

function lastHandoff(ctx, id) {
  return taskById(ctx, id).handoffs.at(-1);
}

// After a worker run the task must be in review. The planner records review if the worker handoff exists but the state is not review.
function planWorkerReview(ctx, id) {
  const task = taskById(ctx, id);
  const last = task.handoffs.at(-1);
  if (last?.sender === "worker" && last.status === "review" && task.status !== "review" && task.status !== "blocked") setStatus(ctx, id, "review");
}

function prepareRun(ctx, args) {
  assertRunsLeft(ctx.marker, effectiveMax(args.maxClaudeRuns, ctx.marker));
  refuseWhenReviewPending(ctx);
  warnNoSandbox(args);
  if (!args.noSandbox) probeRunner(ctx.dir);
}

function stepRunHappy(args) {
  const ctx = loadContext(args, fixedParent());
  const id = ctx.marker.tasks.happy;
  prepareRun(ctx, args);
  if (taskById(ctx, id).status === "todo") setStatus(ctx, id, "ready");
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    loopTick(ctx, "worker");
    planWorkerReview(ctx, id);
    loopTick(ctx, "reviewer");
    const last = lastHandoff(ctx, id);
    if (last?.sender === "reviewer" && last.status === "approved") {
      plannerAction(ctx, id, "done", ["tasks", "done", id, "--message", "Approved by the reviewer; accepted by the planner."]);
      console.log("Happy path complete.");
      return 0;
    }
    console.log(`Round ${round}: the reviewer decision was ${last?.status}. The loop routes the task to the worker again.`);
  }
  throw new StepError(`The happy path did not reach approved within ${MAX_ROUNDS} rounds.`);
}

function stepRunRepair(args) {
  const ctx = loadContext(args, fixedParent());
  const id = ctx.marker.tasks.repair;
  prepareRun(ctx, args);
  if (taskById(ctx, id).status !== "todo") throw new StepError(`The repair task must be in todo. It is in ${taskById(ctx, id).status}.`);
  console.log("harness worker pass: write the planted flaw (Good morning, capital G) and a worker handoff that claims the check passes.");
  writeFileSync(join(ctx.dir, "greeting.txt"), PLANTED_CONTENT, "utf8");
  mustRun("worker handoff", runCli(ctx.dir, ["tasks", "handoff", id, "--sender", "worker", "--recipient", "reviewer", "--status", "review", "--message", "Wrote greeting.txt. `node check-greeting.mjs` passes."]));
  record(ctx, { kind: "harness-worker-pass", task: id });
  setStatus(ctx, id, "review");
  loopTick(ctx, "reviewer");
  expectDecision(ctx, id, "changes_requested");
  console.log("Note: the loop routes a review task whose last handoff is changes_requested to the worker and sets in_progress itself. No planner state action is needed here.");
  loopTick(ctx, "worker");
  planWorkerReview(ctx, id);
  loopTick(ctx, "reviewer");
  expectDecision(ctx, id, "approved");
  plannerAction(ctx, id, "done", ["tasks", "done", id, "--message", "Repair approved by the reviewer; accepted by the planner."]);
  console.log("Repair cycle complete.");
  return 0;
}

function expectDecision(ctx, id, wanted) {
  const last = lastHandoff(ctx, id);
  if (last?.sender !== "reviewer" || last.status !== wanted) throw new StepError(`Expected a reviewer handoff with status ${wanted}, found: ${last ? `${last.sender} ${last.status}` : "none"}.`);
}

function stepReport(args) {
  const ctx = loadContext(args, fixedParent());
  const tasks = readWorkspaceData(ctx.dir);
  const { texts, runFolders } = readRunTexts(ctx.dir);
  const evaluation = evaluateContract({ tasks, events: ctx.marker.events, texts, runFolders });
  console.log(renderReport({ tasks, events: ctx.marker.events, evaluation }));
  return evaluation.ok ? 0 : 1;
}

function stepCleanup(args) {
  const parent = fixedParent();
  const name = args.workspace ?? newestWorkspace(parent);
  if (!name) throw new StepError("No workspace found. Nothing to clean up.");
  if (args.dryRun) {
    console.log(`dry run: cleanup would delete ${checkRemovable(name, parent)}`);
    return 0;
  }
  console.log(`Deleted ${removeWorkspace(name, parent)}`);
  return 0;
}

function dryRunStep(args) {
  const parent = fixedParent();
  const name = args.workspace ?? newestWorkspace(parent);
  const dir = name ? join(parent, name) : placeholderDir(parent);
  if (args.step === "cleanup") {
    if (!name) console.log(`dry run: cleanup would delete the newest workspace under ${parent} (none exists yet)`);
    else console.log(`dry run: cleanup would delete ${checkRemovable(name, parent)}`);
    return 0;
  }
  warnNoSandbox(args);
  if (args.step === "report") {
    console.log(`dry run: report would read the workflow store and run folders of ${dir}.`);
    return 0;
  }
  const cmd = loopCommandFor(dir, args.noSandbox);
  const times = args.step === "run-happy" ? "twice per round (worker, then reviewer)" : "three times (reviewer, worker, reviewer)";
  console.log(`dry run: ${args.step} would run this command ${times}, at most ${args.maxClaudeRuns ?? DEFAULT_MAX_CLAUDE_RUNS} Claude runs in total:`);
  console.log(shellText(cmd));
  console.log("dry run: no claude process was started.");
  return 0;
}

export function main(argv) {
  try {
    const args = parseArgs(argv);
    if (args.dryRun && args.step !== "setup") return dryRunStep(args);
    if (args.step === "setup") return stepSetup(args);
    if (args.step === "run-happy") return stepRunHappy(args);
    if (args.step === "run-repair") return stepRunRepair(args);
    if (args.step === "report") return stepReport(args);
    return stepCleanup(args);
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
