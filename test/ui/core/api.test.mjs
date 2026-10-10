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
    store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 2, sender: "reviewer", recipient: "worker", status: "changes_requested", message: "second", createdAt: "2026-10-05T02:00:00.000Z", metadata: { detail: true } });
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

function makeTask(id, title, status, phase, updatedOn, dependsOn = []) {
  return { projectIdentifier: "fixture", id, title, type: "task", status, assignedTo: "worker", priority: "normal", parent: "", phase, dependsOn, dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-05", updatedOn, body: "# Long body ".repeat(50), metadata: {} };
}

for (const provider of ["sqlite", "markdown"]) {
  test(`UI API phase summaries and phase filter work through the ${provider} provider`, () => {
    const cwd = mkdtempSync(join(tmpdir(), `agent-rig-ui-api-phases-${provider}-`));
    const shared = join(cwd, ".agent-rig", "_shared");
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workflow_store: { provider }, project_identifier: "fixture" }), "utf8");
    const store = provider === "sqlite" ? new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture") : new MarkdownWorkflowStore(join(cwd, ".agent-rig"), "fixture");
    for (let index = 1; index <= 200; index += 1) {
      const phase = index % 4 === 0 ? "26" : index % 4 === 1 ? "phase-27" : index % 4 === 2 ? "Phase A&B" : "";
      store.createTask(makeTask(`task-${String(index).padStart(4, "0")}`, index % 4 === 3 ? "No phase here" : `Task ${index}`, index % 5 === 0 ? "done" : "ready", phase, `2026-10-${String((index % 9) + 1).padStart(2, "0")}`, index > 1 ? ["task-0001"] : []));
    }
    store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "first", createdAt: "2026-10-05T01:00:00.000Z", metadata: {} });
    if ("close" in store) store.close();

    const api = createWorkflowApi(cwd);
    const call = (path, method = "GET") => { const result = api(method, path); return { status: result.status, json: JSON.parse(result.body), size: result.body.length }; };

    const phases = call("/api/phases");
    assert.equal(phases.status, 200);
    assert.deepEqual(Object.keys(phases.json).sort(), ["phases", "project_identifier"]);
    assert.equal(phases.json.project_identifier, "fixture");
    assert.deepEqual(phases.json.phases.map((entry) => entry.phase), ["26", "Phase A&B", "Unassigned", "phase-27"].sort((a, b) => a.localeCompare(b)));
    for (const entry of phases.json.phases) {
      assert.deepEqual(Object.keys(entry).sort(), ["counts", "latest_updated_on", "phase", "total"]);
      assert.deepEqual(Object.keys(entry.counts).sort(), ["blocked", "done", "in_progress", "ready", "review", "todo"]);
      assert.equal(Object.values(entry.counts).reduce((a, b) => a + b, 0), entry.total);
    }
    assert.equal(phases.json.phases.reduce((sum, entry) => sum + entry.total, 0), 200);
    const phase27 = phases.json.phases.find((entry) => entry.phase === "phase-27");
    assert.equal(phase27.total, 50);
    assert.match(phase27.latest_updated_on, /^2026-10-0\d$/);
    const text = JSON.stringify(phases.json);
    for (const forbidden of ['"tasks"', '"body"', '"depends_on"', '"task-0001"']) assert.equal(text.includes(forbidden), false, forbidden);

    const all = call("/api/workflow");
    assert.equal(all.json.tasks.length, 200);
    assert.ok(phases.size * 10 < all.size, `phases ${phases.size} workflow ${all.size}`);

    const filtered = call("/api/workflow?phase=phase-27");
    assert.equal(filtered.status, 200);
    assert.deepEqual(Object.keys(filtered.json).sort(), ["phases", "project_identifier", "tasks"]);
    assert.deepEqual(filtered.json.phases, ["phase-27"]);
    assert.equal(filtered.json.tasks.length, 50);
    assert.ok(filtered.json.tasks.every((task) => task.phase === "phase-27" && typeof task.handoff_count === "number"));
    assert.deepEqual(filtered.json.tasks.find((task) => task.id === "task-0001").handoff_count, 1);
    assert.equal(filtered.json.tasks.find((task) => task.id === "task-0005").depends_on[0], "task-0001");
    assert.equal(call("/api/workflow?phase=26").json.tasks.length, 50);
    assert.deepEqual(call("/api/workflow?phase=26").json.phases, ["26"]);
    assert.equal(call("/api/workflow?phase=Unassigned").json.tasks.length, 50);
    assert.equal(call("/api/workflow?phase=Phase%20A%26B").json.tasks.length, 50);
    assert.equal(call("/api/workflow?phase=Phase+A%26B").json.tasks.length, 50);
    assert.equal(call("/api/workflow?other=1&phase=26&x").json.tasks.length, 50);
    assert.equal(call("/api/workflow?other=1").json.tasks.length, 200);
    assert.deepEqual(call("/api/workflow?").json, all.json);
    assert.deepEqual(call("/api/workflow"), all);

    assert.deepEqual(call("/api/workflow?phase=nope"), { status: 404, json: { error: "Phase not found", phase: "nope" }, size: call("/api/workflow?phase=nope").size });
    assert.equal(call("/api/workflow?phase=PHASE-27").status, 404);
    assert.equal(call("/api/workflow?phase=phase-2").status, 404);
    assert.deepEqual(call("/api/workflow?phase=").json, { error: "Phase not found", phase: "" });
    assert.equal(call("/api/workflow?phase=").status, 404);
    assert.equal(call("/api/workflow?phase").status, 404);
    assert.equal(call("/api/workflow?phase=%E0%A4%A").status, 404);
    assert.equal(call("/api/workflow?phase=%E0%A4%A").json.error, "Invalid phase");
    assert.equal(call(`/api/workflow?phase=${"a".repeat(201)}`).status, 404);
    assert.equal(call(`/api/workflow?phase=${"a".repeat(201)}`).json.error, "Invalid phase");
    assert.equal(call("/api/workflow?phase=26&phase=phase-27").status, 400);
    assert.equal(call("/api/workflow?phase=26&phase=26").json.error, "Repeated phase parameter");
    assert.equal(call("/api/workflow?phase=%3Cscript%3E").json.phase, "<script>");
    assert.equal(call("/api/workflow?phase=26").json.tasks.length, 50);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of ["/api/phases", "/api/workflow?phase=26"]) assert.equal(call(path, method).status, 405, `${method} ${path}`);
    }
    assert.equal(call("/api/phases?x=1").status, 200);
    assert.equal(call("/api/phases/extra").status, 404);
  });
}
