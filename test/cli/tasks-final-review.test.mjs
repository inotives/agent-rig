import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createWorkflowStore } from "../../dist/workflow/index.js";

const cli = new URL("../../dist/index.js", import.meta.url).pathname;

for (const provider of ["markdown", "sqlite"]) {
  test(`${provider} CLI marks only eligible final reviews and preserves task data`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "agent-rig-final-review-"));
    const shared = join(cwd, ".agent-rig", "_shared");
    mkdirSync(join(shared, "tasks"), { recursive: true });
    writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({
      project_identifier: "fixture", workflow_store: { provider }
    }));
    const { store } = createWorkflowStore(cwd);
    const run = (...args) => spawnSync(process.execPath, [cli, "tasks", ...args], {
      cwd, encoding: "utf8", env: { ...process.env, AGENT_RIG_ROLE: "planner" }
    });
    const task = {
      projectIdentifier: "fixture", id: "task-0001", title: "Phase 26 Final planner review",
      type: "task", status: "review", assignedTo: "planner", priority: "high", parent: "",
      phase: "26", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human",
      createdOn: "2026-10-01", updatedOn: "2026-10-02", body: "# Final review\n\nKeep **this** body.\n",
      metadata: { custom_field: { nested: [1, "retained"] }, message: "Keep this message" }
    };
    try {
      store.createTask(task);
      store.createTask({ ...task, id: "task-0002", assignedTo: "worker" });
      store.createTask({ ...task, id: "task-0003", title: "Planner implementation review" });
      const before = store.getTask("fixture", task.id);
      const help = run("--help");
      assert.equal(help.status, 0);
      assert.match(help.stdout, /mark-final-review <task-id>/);
      const marked = run("mark-final-review", task.id);
      assert.equal(marked.status, 0, marked.stderr);
      const after = store.getTask("fixture", task.id);
      assert.deepEqual(after, { ...before, metadata: { ...before.metadata, planner_owned_final_review: true } });
      assert.equal(run("mark-final-review", task.id).status, 0);
      assert.deepEqual(store.getTask("fixture", task.id), after);
      for (const id of ["task-0002", "task-0003"]) {
        const original = store.getTask("fixture", id);
        const rejected = run("mark-final-review", id);
        assert.equal(rejected.status, 1);
        assert.match(rejected.stderr, /assigned to planner with a final review title/);
        assert.deepEqual(store.getTask("fixture", id), original);
      }
      assert.equal(run("mark-final-review").status, 1);
      assert.equal(run("mark-final-review", task.id, "--admin-override").status, 1);
      assert.equal(run("mark-final-review", "task-9999").status, 1);
      assert.equal(run("done", task.id).status, 1);
      const approved = run("handoff", task.id, "--sender", "planner", "--recipient", "planner",
        "--status", "approved", "--message", "Integrated review passed");
      assert.equal(approved.status, 0, approved.stderr);
      const completed = run("done", task.id);
      assert.equal(completed.status, 0, completed.stderr);
      assert.equal(store.getTask("fixture", task.id).status, "done");
    } finally {
      store.close?.();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
