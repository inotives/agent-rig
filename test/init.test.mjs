import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cli = new URL("../dist/index.js", import.meta.url).pathname;

function tempProject() {
  return mkdtempSync(join(tmpdir(), "agent-rig-"));
}

function run(args, cwd, input = "", env = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: "utf8", env: { ...process.env, ...env, AGENT_RIG_SKIP_SKILLS: "1" } });
}

function fakeGh(cwd, issues) {
  const bin = join(cwd, "fake-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "issues.json"), JSON.stringify(issues), "utf8");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "repo" && args[1] === "view") {
  console.log(JSON.stringify({ nameWithOwner: "owner/repo" }));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "list") {
  let issues = JSON.parse(fs.readFileSync(path.join(__dirname, "issues.json"), "utf8"));
  const labelIndex = args.indexOf("--label");
  if (labelIndex !== -1) issues = issues.filter((issue) => issue.labels.some((label) => label.name === args[labelIndex + 1]));
  const limitIndex = args.indexOf("--limit");
  if (limitIndex !== -1) issues = issues.slice(0, Number(args[limitIndex + 1]));
  console.log(JSON.stringify(issues));
  process.exit(0);
}
process.exit(1);
`, "utf8");
  chmodSync(join(bin, "gh"), 0o755);
  return { PATH: `${bin}:${process.env.PATH ?? ""}` };
}

test("npm-style symlink bin runs the CLI", () => {
  const cwd = tempProject();
  const bin = join(cwd, "agent-rig");
  symlinkSync(cli, bin);

  const result = spawnSync(process.execPath, [bin, "--help"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: agent-rig/);
});

test("init --yes creates solo Codex worker scaffold", () => {
  const cwd = tempProject();
  const result = run(["init", "--yes"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "agent-rig.json")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "tasks")));
  assert.equal(existsSync(join(cwd, ".agent-rig", "_shared", "task_queue.json")), false);
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "profiles", "worker.md")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "profiles", "researcher.md")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "profiles", "writer.md")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "tools", ".gitkeep")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "agent.toml")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "skills", "rust-best-practices")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "tools", ".gitkeep")));
  assert.match(readFileSync(join(cwd, ".agent-rig", "worker", "agent.toml"), "utf8"), /tool = "codex"/);
  assert.match(readFileSync(join(cwd, ".agent-rig", "worker", "instructions.md"), "utf8"), /# Worker Profile/);
  assert.match(readFileSync(join(cwd, ".gitignore"), "utf8"), /^\.agent-rig\/$/m);
  assert.equal(readFileSync(join(cwd, ".agent-rig", ".creds", ".gitignore"), "utf8"), "*\n!.gitignore\n!*.toml\n!*.env.example\n");
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "skills", "find-skills")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "skills", "handoff")));
});

test("init refuses an existing .agent-rig workspace", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const result = run(["init", "--yes"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /already exists/);
});

test("interactive init can scaffold multiple agents", () => {
  const cwd = tempProject();
  const input = [
    "y",
    "2",
    "",
    "",
    "",
    "",
    "",
    "",
    "y",
    "y"
  ].join("\n") + "\n";

  const result = run(["init"], cwd, input);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "agent.toml")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "reviewer", "agent.toml")));
  const session = JSON.parse(readFileSync(join(cwd, ".agent-rig", "_shared", "session.json"), "utf8"));
  assert.deepEqual(Object.keys(session.agents), ["worker", "reviewer"]);
});

test("validate passes on a fresh scaffold", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const result = run(["validate"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /valid/);
});

test("validate fails invalid TOML", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", "worker", "agent.toml"), "role =\n", "utf8");

  const result = run(["validate"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid TOML/);
});

test("validate warns for unknown TOML field without failing", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", "worker", "agent.toml"), `${readFileSync(join(cwd, ".agent-rig", "worker", "agent.toml"), "utf8")}extra = "ok"\n`, "utf8");

  const result = run(["validate"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Unknown field "extra"/);
});

test("validate fails missing referenced file", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  rmSync(join(cwd, ".agent-rig", "worker", "instructions.md"));

  const result = run(["validate"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing referenced file/);
});

test("validate fails tracked credential files in a git repo", () => {
  const cwd = tempProject();
  assert.equal(spawnSync("git", ["init"], { cwd, encoding: "utf8" }).status, 0);
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", ".creds", "secret.env"), "TOKEN=x\n", "utf8");
  assert.equal(spawnSync("git", ["add", "-f", ".agent-rig/.creds/secret.env"], { cwd, encoding: "utf8" }).status, 0);

  const result = run(["validate"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Real credential .env files must not be tracked/);
});

test("validate --json returns structured errors and warnings", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const agentToml = join(cwd, ".agent-rig", "worker", "agent.toml");
  writeFileSync(agentToml, `${readFileSync(agentToml, "utf8").replace('context = "context.md"', 'context = "missing.md"')}extra = "ok"\n`, "utf8");

  const result = run(["validate", "--json"], cwd);
  const json = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(Array.isArray(json.errors), true);
  assert.equal(Array.isArray(json.warnings), true);
  assert.match(json.errors[0].message, /Missing referenced file/);
  assert.match(json.warnings[0].message, /Unknown field/);
});

test("validate accepts nested agent TOML shape", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", "worker", "agent.toml"), `[agent]
name = "worker"
role = "worker"
tool = "codex"
instructions = "instructions.md"
context = "context.md"

[permissions]
writable_paths = ["logs"]
`, "utf8");
  mkdirSync(join(cwd, ".agent-rig", "worker", "logs"), { recursive: true });

  const result = run(["validate"], cwd);

  assert.equal(result.status, 0, result.stderr);
});

test("add creates a valid new agent and rejects duplicates", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const added = run(["add", "reviewer", "--role", "reviewer", "--tool", "claude"], cwd);
  assert.equal(added.status, 0, added.stderr);
  assert.ok(existsSync(join(cwd, ".agent-rig", "reviewer", "agent.toml")));
  assert.match(readFileSync(join(cwd, ".agent-rig", "reviewer", "instructions.md"), "utf8"), /# Reviewer Profile/);
  assert.ok(existsSync(join(cwd, ".agent-rig", "reviewer", "skills", "security-review")));
  assert.equal(run(["validate"], cwd).status, 0);

  const duplicate = run(["add", "reviewer", "--role", "reviewer", "--tool", "claude"], cwd);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already exists/);

  const invalid = run(["add", "BadName", "--role", "worker", "--tool", "codex"], cwd);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /lowercase slug/);
});

test("version, help, profiles, and doctor commands work", () => {
  const cwd = tempProject();
  const version = run(["--version"], cwd);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);

  const help = run(["help"], cwd);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /@inotives\/agent-rig/);
  assert.match(help.stdout, /agent-rig add api-worker --role worker --tool codex --profile worker/);
  assert.match(help.stdout, /watch\s+Process one ready shared task with --once/);

  const tasksHelp = run(["tasks", "--help"], cwd);
  assert.equal(tasksHelp.status, 0, tasksHelp.stderr);
  assert.match(tasksHelp.stdout, /set-status <task-id> <status>/);
  assert.match(tasksHelp.stdout, /next \[--agent <agent-name>\] \[--json\] \[--claim\]/);
  assert.match(tasksHelp.stdout, /sync github \[--label <label>\] \[--limit <number>\] \[--dry-run\] \[--json\]/);

  const builtin = run(["profiles", "--json"], cwd);
  assert.equal(builtin.status, 0, builtin.stderr);
  const builtins = JSON.parse(builtin.stdout).profiles;
  assert.equal(builtins.find((profile) => profile.name === "worker").source, "builtin");
  assert.equal(builtins.some((profile) => profile.name === "researcher"), true);
  assert.equal(builtins.some((profile) => profile.name === "writer"), true);

  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const profiles = run(["profiles", "--json"], cwd);
  assert.equal(profiles.status, 0, profiles.stderr);
  const profileJson = JSON.parse(profiles.stdout);
  assert.equal(profileJson.profiles.find((profile) => profile.name === "worker").source, "workspace");
  assert.equal(profileJson.profiles.find((profile) => profile.name === "writer").source, "workspace");

  const show = run(["profiles", "show", "worker"], cwd);
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^---\nname: worker/);

  const doctor = run(["doctor", "--json"], cwd);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
});

test("add --profile copies custom profile instructions", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const profile = join(cwd, ".agent-rig", "_shared", "profiles", "researcher.md");
  writeFileSync(profile, `---
name: researcher
role: custom
summary: Research profile.
created_on: 2026-06-29
updated_on: 2026-06-29
shared_skills: []
agent_skills: []
---

# Researcher Profile

Hello <agent>.
`, "utf8");

  const added = run(["add", "researcher", "--role", "custom", "--tool", "claude", "--profile", "researcher"], cwd);

  assert.equal(added.status, 0, added.stderr);
  assert.match(readFileSync(join(cwd, ".agent-rig", "researcher", "instructions.md"), "utf8"), /Hello researcher\./);
});

test("researcher and writer roles use matching built-in profiles", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const researcher = run(["add", "research", "--role", "researcher", "--tool", "claude"], cwd);
  assert.equal(researcher.status, 0, researcher.stderr);
  assert.match(readFileSync(join(cwd, ".agent-rig", "research", "instructions.md"), "utf8"), /# Researcher Profile/);
  assert.ok(existsSync(join(cwd, ".agent-rig", "research", "skills", "research-ops")));

  const writer = run(["add", "docs-writer", "--role", "writer", "--tool", "claude"], cwd);
  assert.equal(writer.status, 0, writer.stderr);
  assert.match(readFileSync(join(cwd, ".agent-rig", "docs-writer", "instructions.md"), "utf8"), /# Writer Profile/);
  assert.ok(existsSync(join(cwd, ".agent-rig", "docs-writer", "skills", "humanizer")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "docs-writer", "skills", "blog-writing-guide")));
});

test("add defaults tool to codex when omitted", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const result = run(["add", "planner", "--role", "planner"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(cwd, ".agent-rig", "planner", "agent.toml"), "utf8"), /tool = "codex"/);
  assert.match(readFileSync(join(cwd, ".agent-rig", "planner", "instructions.md"), "utf8"), /# Planner Profile/);
});

test("agents lists configured agents as text and json", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["add", "reviewer", "--role", "reviewer", "--tool", "claude"], cwd).status, 0);

  const text = run(["agents"], cwd);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /worker/);
  assert.match(text.stdout, /reviewer/);

  const json = run(["agents", "--json"], cwd);
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout).map((agent) => agent.name), ["reviewer", "worker"]);
});

test("creds init writes declarations, examples, and placeholders", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const shared = run(["creds", "init", "--shared", "AGENTRIG_GITHUB_SHARED_APIKEY"], cwd);
  assert.equal(shared.status, 0, shared.stderr);
  const agent = run(["creds", "init", "--agent", "worker", "AGENTRIG_GITHUB_WORKER_APIKEY"], cwd);
  assert.equal(agent.status, 0, agent.stderr);

  assert.match(readFileSync(join(cwd, ".agent-rig", ".creds", "_shared.toml"), "utf8"), /AGENTRIG_GITHUB_SHARED_APIKEY/);
  assert.match(readFileSync(join(cwd, ".agent-rig", ".creds", "worker.env.example"), "utf8"), /^AGENTRIG_GITHUB_WORKER_APIKEY=/m);
  assert.match(readFileSync(join(cwd, ".agent-rig", ".creds", "worker.env"), "utf8"), /^AGENTRIG_GITHUB_WORKER_APIKEY=/m);
  assert.equal(run(["validate"], cwd).status, 0);

  const invalid = run(["creds", "init", "--agent", "worker", "AGENTRIG_GITHUB_REVIEWER_APIKEY"], cwd);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid credential key/);
});

test("creds list groups shared and agent keys without values", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["creds", "init", "--shared", "AGENTRIG_GITHUB_SHARED_APIKEY"], cwd).status, 0);
  assert.equal(run(["creds", "init", "--agent", "worker", "AGENTRIG_GITHUB_WORKER_APIKEY"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", ".creds", "worker.env"), "AGENTRIG_GITHUB_WORKER_APIKEY=secret\n", "utf8");

  const result = run(["creds", "list", "--agent", "worker"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AGENTRIG_GITHUB_SHARED_APIKEY/);
  assert.match(result.stdout, /AGENTRIG_GITHUB_WORKER_APIKEY/);
  assert.doesNotMatch(result.stdout, /secret/);
});

test("skills list and add dry-run handle shared and agent destinations", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  mkdirSync(join(cwd, ".agent-rig", "worker", "skills", "worker-only"), { recursive: true });

  const list = run(["skills", "list", "--agent", "worker"], cwd);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /find-skills/);
  assert.match(list.stdout, /worker-only/);

  const add = run(["skills", "add", "owner/repo-skill", "--agent", "worker", "--dry-run"], cwd);
  assert.equal(add.status, 0, add.stderr);
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "skills", "repo-skill")));
});

test("status lists agents, shared task counts, and handoffs as text and json", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const logDir = join(cwd, ".agent-rig", "_shared", "handoff_logs");
  mkdirSync(logDir, { recursive: true });
  for (let i = 1; i <= 6; i++) writeFileSync(join(logDir, `2026-06-27-140${i}_s${i}_codex_worker.md`), "# handoff\n", "utf8");
  writeFileSync(join(logDir, "notes.md"), "# ignored\n", "utf8");

  const text = run(["status"], cwd);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /worker/);
  assert.match(text.stdout, /Shared tasks: 0 todo, 0 ready, 0 in_progress, 0 blocked, 0 review, 0 done/);
  assert.match(text.stdout, /2026-06-27-1406_s6_codex_worker\.md/);
  assert.doesNotMatch(text.stdout, /notes\.md/);

  const json = run(["status", "--json"], cwd);
  assert.equal(json.status, 0, json.stderr);
  const data = JSON.parse(json.stdout);
  assert.equal(data.agents[0].name, "worker");
  assert.equal(data.agents[0].queue, undefined);
  assert.equal(data.queues.shared.todo, 0);
  assert.equal(data.queues.shared.ready, 0);
  assert.deepEqual(data.handoffs.map((item) => item.file), [
    "2026-06-27-1406_s6_codex_worker.md",
    "2026-06-27-1405_s5_codex_worker.md",
    "2026-06-27-1404_s4_codex_worker.md",
    "2026-06-27-1403_s3_codex_worker.md",
    "2026-06-27-1402_s2_codex_worker.md"
  ]);
});

test("validate warns for off-format handoff log names", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  mkdirSync(join(cwd, ".agent-rig", "_shared", "handoff_logs"), { recursive: true });
  writeFileSync(join(cwd, ".agent-rig", "_shared", "handoff_logs", "notes.md"), "# bad\n", "utf8");

  const result = run(["validate"], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Handoff log filename/);
});

test("start prints launch context, credential keys, and skill precedence", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["creds", "init", "--shared", "AGENTRIG_GITHUB_SHARED_APIKEY"], cwd).status, 0);
  assert.equal(run(["creds", "init", "--agent", "worker", "AGENTRIG_GITHUB_WORKER_APIKEY"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", ".creds", "worker.env"), "AGENTRIG_GITHUB_WORKER_APIKEY=secret\n", "utf8");

  const result = run(["start", "--agent", "worker"], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tool: codex/);
  assert.match(result.stdout, /Project cwd:/);
  assert.match(result.stdout, /\.agent-rig\/worker\/instructions\.md/);
  assert.match(result.stdout, /\.agent-rig\/\.creds\/_shared\.env/);
  assert.match(result.stdout, /AGENTRIG_GITHUB_SHARED_APIKEY/);
  assert.match(result.stdout, /AGENTRIG_GITHUB_WORKER_APIKEY/);
  assert.match(result.stdout, /Skill precedence/);
  assert.doesNotMatch(result.stdout, /secret/);
});

test("start rejects unknown agents and unknown tools", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const missing = run(["start", "--agent", "missing"], cwd);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Unknown agent/);

  const toml = join(cwd, ".agent-rig", "worker", "agent.toml");
  writeFileSync(toml, readFileSync(toml, "utf8").replace('tool = "codex"', 'tool = "badtool"'), "utf8");
  const badTool = run(["start", "--agent", "worker"], cwd);
  assert.equal(badTool.status, 1);
  assert.match(badTool.stderr, /Unknown tool/);
  assert.doesNotMatch(badTool.stdout, /Start badtool/);
});

test("tasks create lists, filters, shows, and emits json", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const created = run(["tasks", "create", "Fix login timeout", "--assigned-to", "worker", "--status", "ready", "--type", "bug", "--priority", "high", "--depends-on", "task-0000,task-0002"], cwd);
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created task-0001/);

  const file = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_fix-login-timeout.md");
  assert.ok(existsSync(file));
  const text = readFileSync(file, "utf8");
  assert.match(text, /id: task-0001/);
  assert.match(text, /type: bug/);
  assert.match(text, /assigned_to: worker/);
  assert.match(text, /priority: high/);
  assert.match(text, /depends_on:\n  - task-0000\n  - task-0002/);

  const list = run(["tasks", "--status", "ready"], cwd);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /task-0001\s+ready\s+bug\s+worker\s+high\s+2\s+no\s+Fix login timeout/);

  const json = run(["tasks", "--json"], cwd);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout)[0].id, "task-0001");
  assert.equal(JSON.parse(json.stdout)[0].type, "bug");
  assert.equal(JSON.parse(json.stdout)[0].dependency_ready, false);

  const show = run(["tasks", "show", "task-0001"], cwd);
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^---\nid: task-0001/);
});

test("tasks lifecycle commands mutate shared task frontmatter and preserve body", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Lifecycle", "--assigned-to", "worker"], cwd).status, 0);
  const file = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_lifecycle.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("## Notes", "## Custom\n\nKeep me.\n\n## Notes"), "utf8");

  assert.equal(run(["tasks", "set-type", "task-0001", "research"], cwd).status, 0);
  assert.equal(run(["tasks", "set-status", "task-0001", "ready"], cwd).status, 0);
  assert.equal(run(["tasks", "assign", "task-0001", "worker"], cwd).status, 0);
  assert.equal(run(["tasks", "block", "task-0001", "--reason", "Need API key"], cwd).status, 0);
  assert.equal(run(["tasks", "unblock", "task-0001", "--status", "ready"], cwd).status, 0);
  assert.equal(run(["tasks", "done", "task-0001", "--message", "Verified locally."], cwd).status, 0);

  const text = readFileSync(file, "utf8");
  assert.match(text, /type: research/);
  assert.match(text, /status: done/);
  assert.match(text, /message: Verified locally\./);
  assert.doesNotMatch(text, /blocked_reason:/);
  assert.doesNotMatch(text, /blocked_on:/);
  assert.match(text, /## Blockers\n\n- \d{4}-\d{2}-\d{2}: Need API key/);
  assert.match(text, /## Custom\n\nKeep me\./);
});

test("tasks next is dependency-aware and claims only with --claim", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Foundation", "--assigned-to", "worker", "--status", "done"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Ready work", "--assigned-to", "worker", "--status", "ready", "--depends-on", "task-0001"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Blocked by dependency", "--assigned-to", "worker", "--status", "ready", "--depends-on", "task-9999"], cwd).status, 0);

  const next = run(["tasks", "next", "--agent", "worker", "--json"], cwd);
  assert.equal(next.status, 0, next.stderr);
  assert.equal(JSON.parse(next.stdout).id, "task-0002");
  assert.match(readFileSync(join(cwd, ".agent-rig", "_shared", "tasks", "task-0002_ready-work.md"), "utf8"), /status: ready/);

  const claimed = run(["tasks", "next", "--agent", "worker", "--claim"], cwd);
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.match(claimed.stdout, /task-0002\s+in_progress/);
  assert.match(readFileSync(join(cwd, ".agent-rig", "_shared", "tasks", "task-0002_ready-work.md"), "utf8"), /status: in_progress/);
});

test("tasks sync github fails clearly when gh is unavailable", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const result = run(["tasks", "sync", "github"], cwd, "", { PATH: join(cwd, "empty-bin") });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub sync requires the GitHub CLI/);
});

test("tasks sync github imports issues and skips existing source metadata", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [
    {
      number: 123,
      title: "Fix login timeout",
      body: "Request timed out after 30s.",
      url: "https://github.com/owner/repo/issues/123",
      labels: [{ name: "bug" }, { name: "agent-rig" }]
    },
    {
      number: 124,
      title: "Improve docs",
      body: "",
      url: "https://github.com/owner/repo/issues/124",
      labels: [{ name: "documentation" }]
    }
  ]);

  const result = run(["tasks", "sync", "github", "--label", "agent-rig"], cwd, "", env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created task-0001 from issue #123: Fix login timeout/);
  const file = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_fix-login-timeout.md");
  const text = readFileSync(file, "utf8");
  assert.match(text, /type: bug/);
  assert.match(text, /status: todo/);
  assert.match(text, /assigned_to: ""/);
  assert.match(text, /source:\n  provider: github\n  repo: owner\/repo\n  issue: 123/);
  assert.match(text, /labels:\n    - bug\n    - agent-rig/);
  assert.match(text, /## Context\n\nImported from GitHub Issue #123\. Needs planner review before moving to ready\./);
  assert.match(text, /## Source Issue\n\nRequest timed out after 30s\./);

  writeFileSync(file, text.replace("Request timed out after 30s.", "Local edit stays."), "utf8");
  const repeat = run(["tasks", "sync", "github", "--json"], cwd, "", env);
  const data = JSON.parse(repeat.stdout);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(data.skipped_existing, [{ issue: 123, task: "task-0001" }]);
  assert.equal(data.imported[0].issue, 124);
  assert.match(readFileSync(join(cwd, ".agent-rig", "_shared", "tasks", "task-0002_improve-docs.md"), "utf8"), /type: doc/);
  assert.match(readFileSync(file, "utf8"), /Local edit stays/);
});

test("tasks sync github supports dry-run, limit, and json output", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [
    {
      number: 50,
      title: "Research queue behavior",
      body: "Look into the queue.",
      url: "https://github.com/owner/repo/issues/50",
      labels: [{ name: "research" }]
    },
    {
      number: 51,
      title: "Later issue",
      body: "Do later.",
      url: "https://github.com/owner/repo/issues/51",
      labels: [{ name: "chore" }]
    }
  ]);

  const result = run(["tasks", "sync", "github", "--limit", "1", "--dry-run", "--json"], cwd, "", env);

  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.repo, "owner/repo");
  assert.equal(data.dry_run, true);
  assert.equal(data.limit, 1);
  assert.deepEqual(data.imported, [{ issue: 50, task: "task-0001", path: ".agent-rig/_shared/tasks/task-0001_research-queue-behavior.md" }]);
  assert.deepEqual(readdirSync(join(cwd, ".agent-rig", "_shared", "tasks")).filter((file) => file.endsWith(".md")), []);
});

test("validate warns for shared task metadata problems without failing", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Bad task", "--assigned-to", "missing", "--depends-on", "task-9999"], cwd).status, 0);
  const file = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_bad-task.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("type: task", "type: bad").replace("status: todo", "status: bad").replace("- [ ] First verifiable criterion.", "No checklist."), "utf8");

  const result = run(["validate"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Invalid task type/);
  assert.match(result.stderr, /Invalid task status/);
  assert.match(result.stderr, /Unknown assigned_to agent/);
  assert.match(result.stderr, /Missing dependency task/);
  assert.match(result.stderr, /acceptance criteria/);
});

test("watch --once completes ready tasks and writes run and handoff records", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Implement X", "--assigned-to", "worker", "--status", "ready"], cwd).status, 0);

  const result = run(["watch", "--once"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Processed 1 task/);
  const task = readFileSync(join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_implement-x.md"), "utf8");
  assert.match(task, /status: done/);
  const runId = task.match(/run_id: (.+)/)[1].trim();
  assert.match(runId, /^202/);
  assert.match(task, /message: Fake adapter completed task-0001\./);
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "runs", runId, "prompt.md")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "runs", runId, "result.json")));
  assert.equal(JSON.parse(readFileSync(join(cwd, ".agent-rig", "worker", "runs", runId, "result.json"), "utf8")).status, "done");
  assert.equal(readdirSync(join(cwd, ".agent-rig", "_shared", "handoff_logs")).length, 1);
  const session = JSON.parse(readFileSync(join(cwd, ".agent-rig", "_shared", "session.json"), "utf8"));
  assert.equal(session.agents.worker.status, "idle");
});

test("watch --once blocks simulated blocked tasks and updates status counts", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Blocked X", "--assigned-to", "worker", "--status", "ready"], cwd).status, 0);
  const taskPath = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_blocked-x.md");
  writeFileSync(taskPath, readFileSync(taskPath, "utf8").replace("depends_on: []", "depends_on: []\nsimulate: blocked"), "utf8");

  assert.equal(run(["watch", "--once"], cwd).status, 0);

  const updated = readFileSync(taskPath, "utf8");
  assert.match(updated, /status: blocked/);
  assert.match(updated, /message: Fake adapter blocked task-0001\./);
  const session = JSON.parse(readFileSync(join(cwd, ".agent-rig", "_shared", "session.json"), "utf8"));
  assert.equal(session.agents.worker.status, "blocked");
  assert.equal(session.blockers.length, 1);
  const status = JSON.parse(run(["status", "--json"], cwd).stdout);
  assert.equal(status.queues.shared.ready, 0);
  assert.equal(status.queues.shared.blocked, 1);
  assert.equal(status.queues.shared.done, 0);
});

test("watch skips ready shared tasks without an assignee", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Unassigned", "--status", "ready"], cwd).status, 0);

  const result = run(["watch", "--once"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /ready but has no assigned_to/);
  assert.match(result.stdout, /Processed 0 tasks/);
  assert.match(run(["validate"], cwd).stderr, /missing assigned_to/);
});

test("watch refuses an existing lock", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", "_shared", "watch.lock"), "123", "utf8");

  const result = run(["watch", "--once"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /watch\.lock already exists/);
});
