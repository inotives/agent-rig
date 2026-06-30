import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cli = new URL("../dist/index.js", import.meta.url).pathname;

function tempProject() {
  return mkdtempSync(join(tmpdir(), "agent-rig-"));
}

function run(args, cwd, input = "") {
  return spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: "utf8", env: { ...process.env, AGENT_RIG_SKIP_SKILLS: "1" } });
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
queue = "queue.json"

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

test("status lists agents, queues, and handoffs as text and json", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const logDir = join(cwd, ".agent-rig", "_shared", "handoff_logs");
  mkdirSync(logDir, { recursive: true });
  for (let i = 1; i <= 6; i++) writeFileSync(join(logDir, `2026-06-27-140${i}_s${i}_codex_worker.md`), "# handoff\n", "utf8");
  writeFileSync(join(logDir, "notes.md"), "# ignored\n", "utf8");

  const text = run(["status"], cwd);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /worker/);
  assert.match(text.stdout, /Shared tasks: 0 pending/);
  assert.match(text.stdout, /2026-06-27-1406_s6_codex_worker\.md/);
  assert.doesNotMatch(text.stdout, /notes\.md/);

  const json = run(["status", "--json"], cwd);
  assert.equal(json.status, 0, json.stderr);
  const data = JSON.parse(json.stdout);
  assert.equal(data.agents[0].name, "worker");
  assert.equal(data.agents[0].queue.pending, 0);
  assert.equal(data.queues.shared.pending, 0);
  assert.deepEqual(data.handoffs.map((item) => item.file), [
    "2026-06-27-1406_s6_codex_worker.md",
    "2026-06-27-1405_s5_codex_worker.md",
    "2026-06-27-1404_s4_codex_worker.md",
    "2026-06-27-1403_s3_codex_worker.md",
    "2026-06-27-1402_s2_codex_worker.md"
  ]);
});

test("status reports invalid queue json as an error", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", "worker", "queue.json"), "{bad", "utf8");

  const result = run(["status", "--json"], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).agents[0].queue.status, "error");
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

test("task add writes a markdown task file and queue index", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const result = run(["task", "add", "--agent", "worker", "--title", "Implement X", "--body", "Do the work"], cwd);

  assert.equal(result.status, 0, result.stderr);
  const queue = JSON.parse(readFileSync(join(cwd, ".agent-rig", "worker", "queue.json"), "utf8"));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, "ready");
  assert.equal(queue[0].title, "Implement X");
  assert.match(queue[0].task_file, /^tasks\/task-/);
  const task = readFileSync(join(cwd, ".agent-rig", "worker", queue[0].task_file), "utf8");
  assert.match(task, /title: Implement X/);
  assert.match(task, /status: ready/);
  assert.match(task, /## Objective\n\nDo the work/);
  assert.equal(run(["validate"], cwd).status, 0);
});

test("tasks create lists, filters, shows, and emits json", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);

  const created = run(["tasks", "create", "Fix login timeout", "--assigned-to", "worker", "--status", "ready", "--priority", "high", "--depends-on", "task-0000,task-0002"], cwd);
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created task-0001/);

  const file = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_fix-login-timeout.md");
  assert.ok(existsSync(file));
  const text = readFileSync(file, "utf8");
  assert.match(text, /id: task-0001/);
  assert.match(text, /assigned_to: worker/);
  assert.match(text, /priority: high/);
  assert.match(text, /depends_on:\n  - task-0000\n  - task-0002/);

  const list = run(["tasks", "--status", "ready"], cwd);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /task-0001\s+ready\s+worker\s+high\s+2\s+Fix login timeout/);

  const json = run(["tasks", "--json"], cwd);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout)[0].id, "task-0001");

  const show = run(["tasks", "show", "task-0001"], cwd);
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^---\nid: task-0001/);
});

test("validate warns for shared task metadata problems without failing", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["tasks", "create", "Bad task", "--assigned-to", "missing", "--depends-on", "task-9999"], cwd).status, 0);
  const file = join(cwd, ".agent-rig", "_shared", "tasks", "task-0001_bad-task.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("status: todo", "status: bad").replace("- [ ] First verifiable criterion.", "No checklist."), "utf8");

  const result = run(["validate"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Invalid task status/);
  assert.match(result.stderr, /Unknown assigned_to agent/);
  assert.match(result.stderr, /Missing dependency task/);
  assert.match(result.stderr, /acceptance criteria/);
});

test("task add accepts body-file", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, "task.md"), "Line one\nLine two\n", "utf8");

  const result = run(["task", "add", "--agent", "worker", "--title", "From file", "--body-file", "task.md"], cwd);

  assert.equal(result.status, 0, result.stderr);
  const queue = JSON.parse(readFileSync(join(cwd, ".agent-rig", "worker", "queue.json"), "utf8"));
  const task = readFileSync(join(cwd, ".agent-rig", "worker", queue[0].task_file), "utf8");
  assert.match(task, /Line one\nLine two/);
});

test("watch --once completes ready tasks and writes run and handoff records", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["task", "add", "--agent", "worker", "--title", "Implement X", "--body", "Do the work"], cwd).status, 0);

  const result = run(["watch", "--once"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Processed 1 task/);
  const queue = JSON.parse(readFileSync(join(cwd, ".agent-rig", "worker", "queue.json"), "utf8"));
  assert.equal(queue[0].status, "done");
  assert.match(queue[0].run_id, /^202/);
  assert.equal(queue[0].message, `Fake adapter completed ${queue[0].id}.`);
  const task = readFileSync(join(cwd, ".agent-rig", "worker", queue[0].task_file), "utf8");
  assert.match(task, /status: done/);
  assert.match(task, new RegExp(`run_id: ${queue[0].run_id}`));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "runs", queue[0].run_id, "prompt.md")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "runs", queue[0].run_id, "result.json")));
  assert.equal(JSON.parse(readFileSync(join(cwd, ".agent-rig", "worker", "runs", queue[0].run_id, "result.json"), "utf8")).status, "done");
  assert.equal(readdirSync(join(cwd, ".agent-rig", "_shared", "handoff_logs")).length, 1);
  const session = JSON.parse(readFileSync(join(cwd, ".agent-rig", "_shared", "session.json"), "utf8"));
  assert.equal(session.agents.worker.status, "idle");
});

test("watch --once blocks simulated blocked tasks and updates status counts", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["task", "add", "--agent", "worker", "--title", "Blocked X", "--body", "Try it"], cwd).status, 0);
  const queuePath = join(cwd, ".agent-rig", "worker", "queue.json");
  const queue = JSON.parse(readFileSync(queuePath, "utf8"));
  queue[0].simulate = "blocked";
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");

  assert.equal(run(["watch", "--once"], cwd).status, 0);

  const updated = JSON.parse(readFileSync(queuePath, "utf8"));
  assert.equal(updated[0].status, "blocked");
  assert.equal(updated[0].message, `Fake adapter blocked ${updated[0].id}.`);
  const session = JSON.parse(readFileSync(join(cwd, ".agent-rig", "_shared", "session.json"), "utf8"));
  assert.equal(session.agents.worker.status, "blocked");
  assert.equal(session.blockers.length, 1);
  const status = JSON.parse(run(["status", "--json"], cwd).stdout);
  assert.equal(status.agents[0].queue.pending, 0);
  assert.equal(status.agents[0].queue.blocked, 1);
  assert.equal(status.agents[0].queue.done, 0);
});

test("validate fails queue and task markdown drift", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  assert.equal(run(["task", "add", "--agent", "worker", "--title", "Drift", "--body", "No drift"], cwd).status, 0);
  const queue = JSON.parse(readFileSync(join(cwd, ".agent-rig", "worker", "queue.json"), "utf8"));
  const taskPath = join(cwd, ".agent-rig", "worker", queue[0].task_file);
  writeFileSync(taskPath, readFileSync(taskPath, "utf8").replace("status: ready", "status: done"), "utf8");

  const result = run(["validate"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /frontmatter status must match/);
});

test("watch refuses an existing lock", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeFileSync(join(cwd, ".agent-rig", "_shared", "watch.lock"), "123", "utf8");

  const result = run(["watch", "--once"], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /watch\.lock already exists/);
});
