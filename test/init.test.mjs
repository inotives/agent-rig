import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cli = new URL("../dist/index.js", import.meta.url).pathname;

function tempProject() {
  return mkdtempSync(join(tmpdir(), "agent-rig-"));
}

function run(args, cwd, input = "") {
  return spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: "utf8" });
}

test("init --yes creates solo Codex worker scaffold", () => {
  const cwd = tempProject();
  const result = run(["init", "--yes"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(cwd, ".agent-rig", "_shared", "agent-rig.json")));
  assert.ok(existsSync(join(cwd, ".agent-rig", "worker", "agent.toml")));
  assert.match(readFileSync(join(cwd, ".agent-rig", "worker", "agent.toml"), "utf8"), /tool = "codex"/);
  assert.match(readFileSync(join(cwd, ".gitignore"), "utf8"), /^\.agent-rig\/$/m);
  assert.equal(readFileSync(join(cwd, ".agent-rig", ".creds", ".gitignore"), "utf8"), "*\n!.gitignore\n");
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
  assert.match(result.stderr, /Credential files must not be tracked/);
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
