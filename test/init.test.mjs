import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
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
