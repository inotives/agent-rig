import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorkflowApi } from "../../../dist/ui/core/api.js";
import { MarkdownWorkflowStore, SQLiteWorkflowStore } from "../../../dist/workflow/index.js";

for (const provider of ["sqlite", "markdown"]) {
  test(`read-only UI API works through the ${provider} provider`, () => {
    const cwd = mkdtempSync(join(tmpdir(), `agent-rig-ui-api-${provider}-`));
    const shared = join(cwd, ".agent-rig", "_shared");
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workflow_store: { provider }, project_identifier: "fixture" }), "utf8");
    const database = join(shared, "workflow.sqlite");
    const store = provider === "sqlite" ? new SQLiteWorkflowStore(database, "fixture") : new MarkdownWorkflowStore(join(cwd, ".agent-rig"), "fixture");
    store.createTask({
      projectIdentifier: "fixture", id: "task-0001", title: "Phase 17 API", type: "task", status: "ready", assignedTo: "worker",
      priority: "high", parent: "", phase: "phase-17", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner",
      createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "# Detail", metadata: { custom: true }
    });
    store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "first", createdAt: "2026-10-05T01:00:00.000Z", metadata: {} });
    store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 2, sender: "reviewer", recipient: "worker", status: "done", message: "second", createdAt: "2026-10-05T02:00:00.000Z", metadata: { detail: true } });
    if ("close" in store) store.close();

    const api = createWorkflowApi(cwd);
    const workflow = JSON.parse(api("GET", "/api/workflow").body);
    assert.deepEqual(workflow.project_identifier, "fixture");
    assert.deepEqual(workflow.phases, ["phase-17"]);
    assert.deepEqual(workflow.tasks[0], {
      id: "task-0001", title: "Phase 17 API", type: "task", status: "ready", assigned_to: "worker", priority: "high",
      phase: "phase-17", updated_on: "2026-10-05", handoff_count: 2
    });
    assert.equal(JSON.parse(api("GET", "/api/tasks/task-0001").body).task.body, "# Detail");
    assert.deepEqual(JSON.parse(api("GET", "/api/tasks/task-0001/handoffs").body).handoffs.map((handoff) => handoff.sequence), [2, 1]);
    assert.equal(api("POST", "/api/workflow").status, 405);
    assert.equal(api("GET", "/api/tasks/missing").status, 404);
    assert.deepEqual(JSON.parse(api("GET", "/api/tasks/%E0%A4%A").body), { error: "Invalid task ID" });
    assert.equal(api("GET", "/api/tasks/task-0001/handoffs/missing").status, 404);
  });
}
