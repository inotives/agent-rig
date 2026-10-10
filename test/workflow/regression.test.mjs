import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assemblePrompt, handleLoopResult, nextActionableTask, runLoopAgent, selectLoopTask } from "../../dist/workflow/commands.js";
import { SQLiteWorkflowStore, validateNewHandoff, validateTaskTransition } from "../../dist/workflow/index.js";

const agent = (name, role, tool) => ({ name, role, tool });

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-regression-"));
  const root = join(cwd, ".agent-rig");
  mkdirSync(join(root, "_shared"), { recursive: true });
  writeFileSync(join(root, "_shared", "agent-rig.json"), JSON.stringify({ project_identifier: "regression", workflow_store: { provider: "sqlite" } }));
  writeFileSync(join(root, "_shared", "context.md"), "# Shared context\n");
  for (const [name, role, tool] of [["worker", "worker", "codex"], ["reviewer", "reviewer", "codex"], ["planner", "planner", "codex"]]) {
    const dir = join(root, name);
    mkdirSync(join(dir, "skills"), { recursive: true });
    mkdirSync(join(dir, "tools"), { recursive: true });
    mkdirSync(join(dir, "runs"), { recursive: true });
    writeFileSync(join(dir, "agent.toml"), `role = "${role}"\ntool = "${tool}"\n`);
    writeFileSync(join(dir, "instructions.md"), `# ${name} instructions\n`);
    writeFileSync(join(dir, "context.md"), `# ${name} context\n`);
  }
  return { cwd, root, database: join(root, "_shared", "workflow.sqlite") };
}

function storedTask(status = "ready", dependsOn = [], dependencyReady = true) {
  return {
    projectIdentifier: "regression", id: "task-0001", title: "Regression task", type: "task", status,
    assignedTo: "worker", priority: "normal", parent: "", phase: "phase-99", dependsOn,
    dependencyReady, blockedBy: dependencyReady ? [] : dependsOn, createdBy: "human", createdOn: "2026-10-10",
    updatedOn: "2026-10-10", body: "# Task\n\nPrompt body.\n", metadata: {}
  };
}

function sharedTask(cwd, store, workflow) {
  return {
    id: workflow.id, status: workflow.status, type: workflow.type, phase: workflow.phase ?? "phase-99", title: workflow.title,
    assigned_to: workflow.assignedTo, priority: workflow.priority, depends_on: workflow.dependsOn,
    dependency_count: workflow.dependsOn.length, dependency_ready: workflow.dependencyReady, blocked_by: workflow.blockedBy,
    path: "", file: "", meta: workflow.metadata, body: workflow.body, record: {}, workflow, store,
    projectIdentifier: workflow.projectIdentifier, cwd
  };
}

test("prompt assembly includes provider, role instructions, task body, and recent handoffs", () => {
  const { cwd, root, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "regression");
  try {
    store.createTask(storedTask("review"));
    store.addHandoff({ projectIdentifier: "regression", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "Ready for review", createdAt: "2026-10-10T00:00:00Z", metadata: {} });
    const prompt = assemblePrompt(root, agent("reviewer", "reviewer", "codex"), sharedTask(cwd, store, store.getTask("regression", "task-0001")));
    assert.match(prompt, /Active workflow provider: sqlite/);
    assert.match(prompt, /# reviewer instructions/);
    assert.match(prompt, /# Recent Task Handoffs/);
    assert.match(prompt, /Ready for review/);
    assert.match(prompt, /Prompt body\./);
  } finally { store.close(); }
});

test("task transitions and handoffs enforce the planner-manager contract", () => {
  assert.doesNotThrow(() => validateTaskTransition("worker", "in_progress", "review"));
  assert.doesNotThrow(() => validateTaskTransition("reviewer", "review", "review"));
  assert.throws(() => validateTaskTransition("worker", "in_progress", "done"), /Only the planner/);
  assert.throws(() => validateNewHandoff({ sender: "planner", recipient: "reviewer", status: "approved" }), /Invalid handoff route/);
  assert.doesNotThrow(() => validateNewHandoff({ sender: "planner", recipient: "worker", status: "changes_requested" }));
  assert.doesNotThrow(() => validateNewHandoff({ sender: "reviewer", recipient: "planner", status: "approved" }));
});

test("dependency gating keeps a worker task out of the actionable queue", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "regression");
  try {
    const dependency = { ...storedTask("ready"), id: "task-0001", title: "Dependency" };
    const dependent = { ...storedTask("ready", ["task-0001"], false), id: "task-0002", title: "Dependent" };
    store.createTask(dependency);
    store.createTask(dependent);
    const tasks = [sharedTask(cwd, store, store.getTask("regression", "task-0002"))];
    const skipped = [];
    assert.equal(nextActionableTask(tasks, "worker", skipped), undefined);
    assert.equal(selectLoopTask(tasks, "worker").kind, "none");
    store.updateTask("regression", "task-0001", { status: "done" });
    const ready = sharedTask(cwd, store, store.getTask("regression", "task-0002"));
    assert.equal(ready.dependency_ready, true);
    assert.equal(nextActionableTask([ready], "worker", []), ready);
  } finally { store.close(); }
});

test("codex, opencode, and mocked claude launchers create run evidence", () => {
  const { cwd, root, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "regression");
  const bin = mkdtempSync(join(tmpdir(), "agent-rig-bin-"));
  const launcher = `#!/usr/bin/env node\nconst fs = require("node:fs");\nconst args = process.argv.slice(2);\nconst out = args[args.indexOf("--output-last-message") + 1];\nconst file = args[args.indexOf("--file") + 1];\nif (out && !out.startsWith("--")) fs.writeFileSync(out, "codex completed\\n");\nif (file && !file.startsWith("--")) process.stdout.write("opencode completed\\n");\nif (process.argv[1].endsWith("claude")) process.stdout.write("claude completed\\n");\n`;
  for (const tool of ["codex", "opencode", "claude"]) {
    const file = join(bin, tool);
    writeFileSync(file, launcher);
    chmodSync(file, 0o755);
  }
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  try {
    store.createTask(storedTask("in_progress"));
    const task = sharedTask(cwd, store, store.getTask("regression", "task-0001"));
    for (const tool of ["codex", "opencode", "claude"]) {
      const result = runLoopAgent(root, cwd, agent("worker", "worker", tool), task);
      assert.equal(result.exitStatus, 0, `${tool} launcher failed: ${result.error || result.stderr}`);
      assert.match(result.runDir, /\/worker\/runs\//);
    }
  } finally {
    process.env.PATH = previousPath;
    store.close();
  }
});

test("reviewer findings select worker repair and planner findings remain retryable", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "regression");
  try {
    store.createTask(storedTask("review"));
    const task = () => sharedTask(cwd, store, store.getTask("regression", "task-0001"));
    store.addHandoff({ projectIdentifier: "regression", taskId: "task-0001", sender: "reviewer", recipient: "worker", status: "changes_requested", message: "Fix required", createdAt: "2026-10-10T00:00:00Z", metadata: {} });
    assert.equal(selectLoopTask([task()], "worker").kind, "worker");
    store.addHandoff({ projectIdentifier: "regression", taskId: "task-0001", sender: "planner", recipient: "worker", status: "changes_requested", message: "Integrated fix required", createdAt: "2026-10-10T00:01:00Z", metadata: {} });
    assert.equal(selectLoopTask([task()], "worker").kind, "worker");
  } finally { store.close(); }
});

test("planner integrated findings restart the worker-reviewer pair", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "regression");
  const runDir = join(cwd, "planner-run");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "result.json"), "{}\n");
  try {
    store.createTask(storedTask("review"));
    store.addHandoff({ projectIdentifier: "regression", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "Ready for review", createdAt: "2026-10-10T00:00:00Z", metadata: {} });
    const handoffCount = store.listHandoffs("regression", "task-0001").length;
    store.addHandoff({ projectIdentifier: "regression", taskId: "task-0001", sender: "planner", recipient: "worker", status: "changes_requested", message: "Integrated fix required", createdAt: "2026-10-10T00:01:00Z", metadata: {} });

    handleLoopResult(cwd, { exitStatus: 0, stdout: "", stderr: "", error: "", failureSummary: "", runDir }, agent("planner", "planner", "codex"), "task-0001", handoffCount);

    const afterPlanner = sharedTask(cwd, store, store.getTask("regression", "task-0001"));
    assert.equal(selectLoopTask([afterPlanner], "worker").kind, "worker");
    store.updateTask("regression", "task-0001", { status: "in_progress" });
    store.addHandoff({ projectIdentifier: "regression", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "Repair ready for review", createdAt: "2026-10-10T00:02:00Z", metadata: {} });
    store.updateTask("regression", "task-0001", { status: "review" });
    const afterWorker = sharedTask(cwd, store, store.getTask("regression", "task-0001"));
    assert.equal(selectLoopTask([afterWorker], "worker").kind, "review");
  } finally { store.close(); }
});
