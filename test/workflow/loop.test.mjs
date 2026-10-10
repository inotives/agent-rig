import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleLoopResult, selectLoopTask } from "../../dist/workflow/commands.js";
import { SQLiteWorkflowStore } from "../../dist/workflow/index.js";

const task = (status = "in_progress") => ({
  projectIdentifier: "test-project", id: "task-0001", title: "Loop task", type: "task", status,
  assignedTo: "worker", priority: "normal", parent: "", phase: "phase-26", dependsOn: [],
  dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-10", updatedOn: "2026-10-10",
  body: "# Task\n\n## Context\n\nTest.\n", metadata: {}
});

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-loop-"));
  const shared = join(cwd, ".agent-rig", "_shared");
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ project_identifier: "test-project", workflow_store: { provider: "sqlite" } }));
  writeFileSync(join(shared, "session.json"), JSON.stringify({ agents: {}, blockers: [] }));
  return { cwd, shared, database: join(shared, "workflow.sqlite") };
}

test("child startup failure restores a worker task to ready and records the reason", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task());
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  handleLoopResult(cwd, {
    exitStatus: 1, stdout: "", stderr: "", error: "spawn codex EACCES", failureSummary: "Codex could not start", runDir
  }, { name: "worker", role: "worker", tool: "codex" }, "task-0001", 0);

  const check = new SQLiteWorkflowStore(database, "test-project");
  const updated = check.getTask("test-project", "task-0001");
  assert.equal(updated.status, "ready");
  assert.equal(updated.metadata.infrastructure_failure, "Codex could not start");
  check.close();
});

test("nested app-server permission failures remain retryable", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task());
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  handleLoopResult(cwd, {
    exitStatus: 1,
    stdout: "",
    stderr: "WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\nError: failed to initialize in-process app-server client: Operation not permitted (os error 1)",
    error: "",
    failureSummary: "",
    runDir
  }, { name: "worker", role: "worker", tool: "codex" }, "task-0001", 0);

  const check = new SQLiteWorkflowStore(database, "test-project");
  const updated = check.getTask("test-project", "task-0001");
  assert.equal(updated.status, "ready");
  assert.match(updated.metadata.infrastructure_failure, /PATH aliases/);
  check.close();
});

test("child network startup failures remain retryable", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task());
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  handleLoopResult(cwd, {
    exitStatus: 1,
    stdout: "",
    stderr: "ERROR codex_models_manager::manager: failed to refresh available models: Connection failed: error sending request",
    error: "",
    failureSummary: "",
    runDir
  }, { name: "worker", role: "worker", tool: "codex" }, "task-0001", 0);

  const check = new SQLiteWorkflowStore(database, "test-project");
  assert.equal(check.getTask("test-project", "task-0001").status, "ready");
  check.close();
});

test("planner can complete a task after reviewer approval", () => {
  const { database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task("review"));
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "ready", createdAt: new Date().toISOString(), metadata: {} });
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "reviewer", recipient: "planner", status: "approved", message: "approved", createdAt: new Date().toISOString(), metadata: {} });
  store.completeTask("test-project", "task-0001");
  assert.equal(store.getTask("test-project", "task-0001").status, "done");
  store.close();
});

test("reviewer approval does not trigger stale review blocking", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task("review"));
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "ready", createdAt: new Date().toISOString(), metadata: {} });
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  const running = new SQLiteWorkflowStore(database, "test-project");
  running.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "reviewer", recipient: "planner", status: "approved", message: "approved", createdAt: new Date().toISOString(), metadata: {} });
  running.close();

  handleLoopResult(cwd, {
    exitStatus: 0, stdout: "", stderr: "", error: "", failureSummary: "", runDir
  }, { name: "reviewer", role: "reviewer", tool: "codex" }, "task-0001", 1);

  const check = new SQLiteWorkflowStore(database, "test-project");
  assert.equal(check.getTask("test-project", "task-0001").status, "review");
  check.close();
});

test("reviewer completion creates an approval handoff for the planner", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask({ ...task("review"), metadata: { pending_completion: true } });
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "ready", createdAt: new Date().toISOString(), metadata: {} });
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  handleLoopResult(cwd, {
    exitStatus: 0, stdout: "", stderr: "", error: "", failureSummary: "", runDir
  }, { name: "reviewer", role: "reviewer", tool: "codex" }, "task-0001", 1);

  const check = new SQLiteWorkflowStore(database, "test-project");
  const handoff = check.listHandoffs("test-project", "task-0001").at(-1);
  assert.deepEqual({ sender: handoff.sender, recipient: handoff.recipient, status: handoff.status }, { sender: "reviewer", recipient: "planner", status: "approved" });
  check.close();
});

test("reviewer findings route the task to worker repair without stale blocking", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task("review"));
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "ready", createdAt: new Date().toISOString(), metadata: {} });
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  const running = new SQLiteWorkflowStore(database, "test-project");
  running.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "reviewer", recipient: "worker", status: "changes_requested", message: "fix it", createdAt: new Date().toISOString(), metadata: {} });
  running.close();

  handleLoopResult(cwd, {
    exitStatus: 0, stdout: "", stderr: "", error: "", failureSummary: "", runDir
  }, { name: "reviewer", role: "reviewer", tool: "codex" }, "task-0001", 1);

  const check = new SQLiteWorkflowStore(database, "test-project");
  assert.equal(check.getTask("test-project", "task-0001").status, "review");
  assert.equal(check.listHandoffs("test-project", "task-0001").at(-1).status, "changes_requested");
  check.close();
});

test("reviewer findings select the worker for the repair cycle", () => {
  const { database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task("review"));
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "reviewer", recipient: "worker", status: "changes_requested", message: "fix it", createdAt: new Date().toISOString(), metadata: {} });
  const selected = selectLoopTask([
    { ...task("review"), projectIdentifier: "test-project", id: "task-0001", store }
  ], "worker");
  assert.equal(selected.kind, "worker");
  assert.equal(selected.task.id, "task-0001");
  store.close();
});
