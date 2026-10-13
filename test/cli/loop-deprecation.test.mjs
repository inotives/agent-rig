import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopHelp } from "../../dist/workflow/commands.js";

const root = new URL("../../", import.meta.url);

test("supported guidance and role templates do not contain loop launch commands", () => {
  const profiles = readdirSync(new URL("templates/profiles/", root)).map((name) => `templates/profiles/${name}`);
  for (const file of [...profiles, "INSTRUCTIONS.md", "templates/workflow.md", "templates/skills/plan-tasks/SKILL.md", "docs/provider-execution.md", "docs/safe-operations.md"]) {
    assert.doesNotMatch(readFileSync(new URL(file, root), "utf8"), /agent-rig loop/, file);
  }
  const workflow = readFileSync(new URL("templates/workflow.md", root), "utf8");
  assert.match(workflow, /Planner-Manager Worker And Reviewer Flow/);
  assert.match(workflow, /planner launches one independent reviewer/);
  const tasks = readFileSync(new URL("docs/tasks.md", root), "utf8");
  assert.match(tasks, /Use planner-mediated direct worker\/reviewer execution/);
  assert.match(tasks, /Loop removal can occur in a later phase/);
  assert.match(tasks, /human end-to-end acceptance/);
});

test("CLI and loop help label the retained command as deprecated diagnostics", () => {
  const result = spawnSync(process.execPath, [new URL("dist/index.js", root).pathname, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /loop\s+Deprecated diagnostic/);
  const original = console.log;
  const output = [];
  try {
    console.log = (text) => output.push(text);
    assert.equal(loopHelp(), 0);
  } finally { console.log = original; }
  assert.match(output.join("\n"), /Deprecated diagnostic command/);
  assert.match(output.join("\n"), /planner-mediated direct worker\/reviewer execution/);
  assert.match(output.join("\n"), /isolated regression tests/);
});


test("generated workspace instructions do not recommend the diagnostic loop", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-loop-deprecation-"));
  try {
    const result = spawnSync(process.execPath, [new URL("dist/index.js", root).pathname, "init", "--yes"], {
      cwd, encoding: "utf8", env: { ...process.env, AGENT_RIG_SKIP_SKILLS: "1" }
    });
    assert.equal(result.status, 0, result.stderr);
    for (const role of ["planner", "reviewer"]) {
      const added = spawnSync(process.execPath, [new URL("dist/index.js", root).pathname, "add", role, "--role", role], {
        cwd, encoding: "utf8", env: { ...process.env, AGENT_RIG_SKIP_SKILLS: "1" }
      });
      assert.equal(added.status, 0, added.stderr);
    }
    for (const file of [".agent-rig/_shared/workflow.md", ".agent-rig/worker/instructions.md", ".agent-rig/planner/instructions.md", ".agent-rig/reviewer/instructions.md"]) {
      assert.doesNotMatch(readFileSync(join(cwd, file), "utf8"), /agent-rig loop/, file);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
