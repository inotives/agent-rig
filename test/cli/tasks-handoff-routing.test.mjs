import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createWorkflowStore, MarkdownWorkflowStore, SQLiteWorkflowStore } from "../../dist/workflow/index.js";
import { createWorkflowApi } from "../../dist/ui/core/api.js";

const cli = new URL("../../dist/index.js", import.meta.url).pathname;
for (const provider of ["markdown", "sqlite"]) {
  test(`${provider} planner records outcomes and owns review, repair, completion, and blockers`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "agent-rig-handoff-routing-"));
    const root = join(cwd, ".agent-rig");
    const shared = join(root, "_shared");
    mkdirSync(join(shared, "tasks"), { recursive: true });
    writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ project_identifier: "fixture", workflow_store: { provider } }));
    const { store } = createWorkflowStore(cwd);
    const run = (role, ...args) => spawnSync(process.execPath, [cli, "tasks", ...args], { cwd, encoding: "utf8", env: { ...process.env, AGENT_RIG_ROLE: role } });
    const ok = (...args) => { const result = run("planner", ...args); assert.equal(result.status, 0, result.stderr); };
    const record = (sender, recipient, decision) => ok("handoff", "task-0001", "--sender", sender, "--recipient", recipient, "--status", decision, "--message", `${sender} evidence`);
    const status = () => store.getTask("fixture", "task-0001").status;
    try {
      store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "Repair", type: "task", status: "ready", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-13", updatedOn: "2026-10-13", body: "# Task", metadata: {} });
      ok("set-status", "task-0001", "in_progress");
      for (const role of ["worker", "reviewer", "human"]) {
        const child = provider === "sqlite" ? new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture", { actorRole: role }) : new MarkdownWorkflowStore(root, "fixture", role);
        const before = store.getTask("fixture", "task-0001");
        try {
          assert.throws(() => child.updateTask("fixture", "task-0001", { body: "Changed" }), /Only the planner/);
          assert.throws(() => child.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "Evidence", createdAt: new Date().toISOString(), metadata: {} }), /Only the planner/);
          assert.throws(() => child.updateTaskWithHandoff("fixture", "task-0001", { status: "review" }, { projectIdentifier: "fixture", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "Evidence", createdAt: new Date().toISOString(), metadata: {} }), /cannot transition|Only the planner/);
        } finally { child.close?.(); }
        for (const args of [["set-status", "task-0001", "review"], ["done", "task-0001"], ["handoff", "task-0001", "--sender", "reviewer", "--recipient", "planner", "--status", "approved", "--message", "Evidence"]]) {
          const rejected = run(role, ...args);
          assert.equal(rejected.status, 1);
          assert.match(rejected.stderr, /Only the planner/);
        }
        assert.deepEqual(store.getTask("fixture", "task-0001"), before);
        assert.deepEqual(store.listHandoffs("fixture", "task-0001"), []);
      }
      record("worker", "reviewer", "review");
      assert.equal(status(), "in_progress");
      ok("set-status", "task-0001", "review");
      record("reviewer", "worker", "changes_requested");
      assert.equal(status(), "review");
      ok("set-status", "task-0001", "in_progress");
      record("human", "planner", "changes_requested");
      record("planner", "worker", "changes_requested");
      record("worker", "planner", "blocked");
      assert.equal(status(), "in_progress");
      ok("block", "task-0001", "--reason", "Missing input");
      assert.equal(status(), "blocked");
      ok("set-status", "task-0001", "in_progress");
      record("worker", "reviewer", "review");
      ok("set-status", "task-0001", "review");
      record("reviewer", "planner", "blocked");
      assert.equal(run("planner", "done", "task-0001").status, 1);
      record("worker", "reviewer", "review");
      record("reviewer", "planner", "approved");
      assert.equal(status(), "review");
      const before = store.getTask("fixture", "task-0001");
      const api = createWorkflowApi(cwd);
      const entries = JSON.parse(api("GET", "/api/tasks/task-0001/handoffs").body).handoffs;
      assert.ok(entries.some((entry) => entry.sender === "human" && entry.recipient === "planner" && entry.status === "changes_requested"));
      assert.ok(entries.some((entry) => entry.sender === "planner" && entry.recipient === "worker"));
      assert.equal(api("POST", "/api/tasks/task-0001/handoffs").status, 405);
      assert.deepEqual(store.getTask("fixture", "task-0001"), before);
      ok("done", "task-0001", "--message", "Reviewer approved the repair");
      assert.equal(status(), "done");
      assert.equal(store.getTask("fixture", "task-0001").metadata.message, "Reviewer approved the repair");
    } finally { store.close?.(); rmSync(cwd, { recursive: true, force: true }); }
  });
}
