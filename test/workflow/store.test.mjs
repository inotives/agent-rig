import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isProjectIdentifier,
  MarkdownWorkflowStore,
  SQLiteWorkflowStore,
  projectIdentifierFromDirectory,
  readWorkspaceWorkflowConfig,
  resolveWorkspaceWorkflowConfig,
  resolveTaskPhase
} from "../../dist/workflow/index.js";

test("workflow configuration defaults legacy workspaces to Markdown", () => {
  const cwd = "/tmp/example-project";
  assert.deepEqual(resolveWorkspaceWorkflowConfig(cwd, {}), {
    workflow_store: { provider: "markdown" },
    project_identifier: "example-project"
  });
});

test("workflow configuration rejects unknown providers and invalid identifiers", () => {
  assert.throws(() => resolveWorkspaceWorkflowConfig("/tmp/project", { workflow_store: { provider: "postgres" } }), /Unknown workflow store provider/);
  assert.throws(() => resolveWorkspaceWorkflowConfig("/tmp/project", { project_identifier: "Bad_Name" }), /Invalid project_identifier/);
});

test("workflow configuration can be read from the workspace file", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-config-"));
  mkdirSync(join(cwd, ".agent-rig", "_shared"), { recursive: true });
  writeFileSync(join(cwd, ".agent-rig", "_shared", "agent-rig.json"), JSON.stringify({ workspace_version: 1 }), "utf8");
  assert.equal(readWorkspaceWorkflowConfig(cwd).workflow_store.provider, "markdown");
});

test("project identifier defaults to a stable slug", () => {
  assert.equal(projectIdentifierFromDirectory("/tmp/My Project"), "my-project");
  assert.equal(isProjectIdentifier("project-123"), true);
  assert.equal(isProjectIdentifier("123-project"), false);
});

function storeFixture(actorRole) {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-store-"));
  const root = join(cwd, ".agent-rig");
  mkdirSync(join(root, "_shared", "tasks"), { recursive: true });
  return { cwd, root, store: new MarkdownWorkflowStore(root, "fixture", actorRole) };
}

test("Markdown child actors cannot complete or block tasks", () => {
  const { root, store } = storeFixture("worker");
  const file = join(root, "_shared", "tasks", "task-0001_transition.md");
  writeFileSync(file, "---\nid: task-0001\ntitle: Transition\ntype: task\nstatus: in_progress\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: []\n---\n# Task\n", "utf8");
  assert.throws(() => store.updateTask("fixture", "task-0001", { status: "done" }), /Only the planner can set a task to done/);
  assert.throws(() => store.updateTask("fixture", "task-0001", { status: "blocked" }), /Only the planner can set a task to blocked/);
  assert.equal(store.getTask("fixture", "task-0001").status, "in_progress");
});

test("Markdown tasks preserve unknown frontmatter and opaque bodies", () => {
  const { root, store } = storeFixture();
  const body = "# Task\n\nA body with **rich Markdown**.\n\n  preserved spacing\n";
  writeFileSync(join(root, "_shared", "tasks", "task-0001_rich.md"), `---\nid: task-0001\ntitle: Rich\ntype: task\nstatus: ready\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: []\ncustom_field: retained\n---\n${body}`, "utf8");

  const task = store.getTask("fixture", "task-0001");
  assert.equal(task.body, body);
  assert.equal(task.metadata.custom_field, "retained");
  store.updateTask("fixture", "task-0001", { status: "in_progress" });
  const updated = store.getTask("fixture", "task-0001");
  assert.equal(updated.status, "in_progress");
  assert.equal(updated.body, body);
  assert.equal(updated.metadata.custom_field, "retained");
});

test("Task phases round-trip explicitly and legacy phase inference stays display-only", () => {
  const { root, store } = storeFixture();
  writeFileSync(join(root, "_shared", "tasks", "task-0001_phase-17.md"), "---\nid: task-0001\ntitle: Legacy task\ntype: task\nstatus: ready\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: []\n---\n# Task\n", "utf8");
  const legacy = store.getTask("fixture", "task-0001");
  assert.equal(legacy.phase, undefined);
  assert.equal(resolveTaskPhase(legacy, "task-0001_phase-17.md"), "phase-17");
  store.createTask({ projectIdentifier: "fixture", id: "task-0002", title: "Explicit", type: "task", status: "ready", assignedTo: "worker", priority: "normal", parent: "", phase: "phase-99", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-04", updatedOn: "2026-10-04", body: "# Task\n", metadata: {} });
  assert.equal(store.getTask("fixture", "task-0002").phase, "phase-99");
  assert.equal(resolveTaskPhase(store.getTask("fixture", "task-0002"), "task-0002_explicit.md"), "phase-99");
});

test("Markdown dependencies are ready only when every dependency is done", () => {
  const { root, store } = storeFixture();
  const task = (id, status, depends = []) => `---\nid: ${id}\ntitle: ${id}\ntype: task\nstatus: ${status}\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: [${depends.join(", ")}]\n---\n# Task\n`;
  writeFileSync(join(root, "_shared", "tasks", "task-0001_done.md"), task("task-0001", "done"), "utf8");
  writeFileSync(join(root, "_shared", "tasks", "task-0002_blocked.md"), task("task-0002", "ready", ["task-0001", "task-9999"]), "utf8");
  assert.deepEqual(store.listDependencies("fixture", "task-0002"), ["task-0001", "task-9999"]);
  const blockedTask = store.getTask("fixture", "task-0002");
  assert.equal(blockedTask.dependsOn.length, 2);
  assert.equal(blockedTask.dependencyReady, false);
  assert.deepEqual(blockedTask.blockedBy, ["task-9999"]);
  assert.equal(store.listTasks("fixture", { status: "ready" }).length, 1);
});

test("Markdown dependencies expose incomplete dependencies as blockers", () => {
  const { root, store } = storeFixture();
  const task = (id, status, depends = []) => `---\nid: ${id}\ntitle: ${id}\ntype: task\nstatus: ${status}\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: [${depends.join(", ")}]\n---\n# Task\n`;
  writeFileSync(join(root, "_shared", "tasks", "task-0001_ready.md"), task("task-0001", "ready"), "utf8");
  writeFileSync(join(root, "_shared", "tasks", "task-0002_ready.md"), task("task-0002", "ready", ["task-0001"]), "utf8");

  const dependent = store.getTask("fixture", "task-0002");
  assert.equal(dependent.dependencyReady, false);
  assert.deepEqual(dependent.blockedBy, ["task-0001"]);
});

test("Markdown task completion requires a worker and reviewer trail unless overridden", () => {
  const { root, store } = storeFixture();
  const file = join(root, "_shared", "tasks", "task-0001_completion.md");
  writeFileSync(file, "---\nid: task-0001\ntitle: Completion\ntype: task\nstatus: ready\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: []\n---\n# Task\n", "utf8");
  assert.throws(() => store.completeTask("fixture", "task-0001"), /requires worker and reviewer/);
  assert.equal(store.getTask("fixture", "task-0001").status, "ready");
  store.completeTask("fixture", "task-0001", true);
  assert.equal(store.getTask("fixture", "task-0001").status, "done");
});

test("Malformed Markdown records fail with a useful error", () => {
  const { root, store } = storeFixture();
  writeFileSync(join(root, "_shared", "tasks", "broken.md"), "# no frontmatter\n", "utf8");
  assert.throws(() => store.listTasks("fixture"), /missing frontmatter/);
});

test("Handoffs retain message bodies and historical filename chronology", () => {
  const { root, store } = storeFixture();
  const dir = join(root, "_shared", "handoff_logs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "2026-10-04-1001_run-a_codex_worker.md"), "---\ntask: task-0001\nagent: worker\nstatus: review\n---\n\nfirst message\n", "utf8");
  writeFileSync(join(dir, "2026-10-04-1002_run-b_codex_reviewer.md"), "---\ntask: task-0001\nagent: reviewer\nstatus: done\n---\n\nsecond message\n", "utf8");
  const handoffs = store.listHandoffs("fixture", "task-0001");
  assert.deepEqual(handoffs.map((handoff) => handoff.sequence), [1, 2]);
  assert.equal(handoffs[0].message, "\nfirst message\n");
  assert.equal(handoffs[1].metadata.filename, "2026-10-04-1002_run-b_codex_reviewer.md");
});

test("Historical handoff filenames remain chronological when run IDs contain numbers", () => {
  const { root, store } = storeFixture();
  const dir = join(root, "_shared", "handoff_logs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "2026-10-04-1001_run-7_codex_worker.md"), "---\ntask: task-0001\nagent: worker\nstatus: review\ncustom_field: first\n---\nfirst\n", "utf8");
  writeFileSync(join(dir, "2026-10-04-1002_run-8_codex_reviewer.md"), "---\ntask: task-0001\nagent: reviewer\nstatus: done\ncustom_field: second\n---\nsecond\n", "utf8");

  const handoffs = store.listHandoffs("fixture", "task-0001");
  assert.deepEqual(handoffs.map((handoff) => handoff.sequence), [1, 2]);
  assert.deepEqual(handoffs.map((handoff) => handoff.metadata.custom_field), ["first", "second"]);
  assert.equal(handoffs[0].metadata.agent, undefined);
});

test("Markdown handoffs round-trip opaque messages and custom metadata", () => {
  const { store } = storeFixture();
  const message = "\n# Review\n\nKeep **this** formatting.\n";
  store.addHandoff({
    projectIdentifier: "fixture",
    taskId: "task-0001",
    sequence: 1,
    sender: "worker",
    recipient: "reviewer",
    status: "review",
    message,
    createdAt: "2026-10-04T10:03:00.000Z",
    metadata: { custom_field: { retained: true } }
  });

  const [handoff] = store.listHandoffs("fixture", "task-0001");
  assert.equal(handoff.message, message);
  assert.deepEqual(handoff.metadata.custom_field, { retained: true });
  assert.match(handoff.metadata.filename, /^2026-10-04-\d{4}_task-0001-1_markdown_worker\.md$/);
});

test("Markdown handoffs enforce canonical routes and completion decisions", () => {
  const { store } = storeFixture();
  store.createTask({
    projectIdentifier: "fixture", id: "task-0001", title: "Completion", type: "task", status: "ready",
    assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [],
    createdBy: "human", createdOn: "2026-10-04", updatedOn: "2026-10-04", body: "# Task\n", metadata: {}
  });
  const base = { projectIdentifier: "fixture", taskId: "task-0001", message: "message", createdAt: "2026-10-04T10:03:00.000Z", metadata: {} };
  assert.throws(() => store.addHandoff({ ...base, sequence: 1, sender: "worker", recipient: "planner", status: "review" }), /Invalid handoff decision/);
  assert.throws(() => store.addHandoff({ ...base, sequence: 1, sender: "planner", recipient: "planner", status: "blocked" }), /Invalid handoff decision/);
  assert.doesNotThrow(() => store.addHandoff({ ...base, sequence: 1, sender: "planner", recipient: "planner", status: "approved" }));
  store.addHandoff({ ...base, sequence: 1, sender: "worker", recipient: "reviewer", status: "review" });
  store.addHandoff({ ...base, sequence: 2, sender: "reviewer", recipient: "planner", status: "approved" });
  store.completeTask("fixture", "task-0001");
  assert.equal(store.getTask("fixture", "task-0001").status, "done");
});

test("Markdown planner-owned final review completes from an approved planner handoff", () => {
  const { store } = storeFixture();
  store.createTask({
    projectIdentifier: "fixture", id: "task-0001", title: "Final review", type: "task", status: "review",
    assignedTo: "planner", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [],
    createdBy: "planner", createdOn: "2026-10-04", updatedOn: "2026-10-04", body: "# Task\n",
    metadata: { planner_owned_final_review: true }
  });
  store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "planner", recipient: "planner", status: "approved", message: "integrated review passed", createdAt: "2026-10-04T10:03:00.000Z", metadata: {} });
  store.completeTask("fixture", "task-0001");
  assert.equal(store.getTask("fixture", "task-0001").status, "done");
});

test("Markdown normal tasks reject planner-only completion", () => {
  const { store } = storeFixture();
  store.createTask({
    projectIdentifier: "fixture", id: "task-0001", title: "Normal task", type: "task", status: "review",
    assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [],
    createdBy: "planner", createdOn: "2026-10-04", updatedOn: "2026-10-04", body: "# Task\n", metadata: {}
  });
  store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "planner", recipient: "planner", status: "approved", message: "integrated review passed", createdAt: "2026-10-04T10:03:00.000Z", metadata: {} });
  assert.throws(() => store.completeTask("fixture", "task-0001"), /requires worker and reviewer/);
});

function sqliteFixture() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-sqlite-"));
  const store = new SQLiteWorkflowStore(join(cwd, "workflow.sqlite"), "fixture");
  return { cwd, store };
}

function sqliteTask(id = "", status = "ready") {
  return {
    projectIdentifier: "fixture", id, title: "SQLite task", type: "task", status,
    assignedTo: "worker", priority: "normal", parent: "", phase: "phase-16", dependsOn: [],
    dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-04",
    updatedOn: "2026-10-04", body: "# Rich **body**\n", metadata: { source_filename: "legacy.md" }
  };
}

test("SQLite planner-owned final review completes from an approved planner handoff", () => {
  const { store } = sqliteFixture();
  try {
    store.createTask({ ...sqliteTask("task-0001", "review"), assignedTo: "planner", metadata: { planner_owned_final_review: true } });
    store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sender: "planner", recipient: "planner", status: "approved", message: "integrated review passed", createdAt: "2026-10-04T10:03:00.000Z", metadata: {} });
    store.completeTask("fixture", "task-0001");
    assert.equal(store.getTask("fixture", "task-0001").status, "done");
  } finally { store.close(); }
});

test("SQLite normal tasks reject planner-only completion", () => {
  const { store } = sqliteFixture();
  try {
    store.createTask(sqliteTask("task-0001", "review"));
    store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sender: "planner", recipient: "planner", status: "approved", message: "integrated review passed", createdAt: "2026-10-04T10:03:00.000Z", metadata: {} });
    assert.throws(() => store.completeTask("fixture", "task-0001"), /requires worker and reviewer/);
  } finally { store.close(); }
});

function handoff(sender, taskId = "task-0001", sequence) {
  return { projectIdentifier: "fixture", taskId, ...(typeof sequence === "undefined" ? {} : { sequence }),
    sender, recipient: sender === "worker" ? "reviewer" : "planner", status: sender === "worker" ? "review" : "approved",
    message: `${sender} message`, createdAt: "2026-10-04T00:00:00Z", metadata: { run_id: `${sender}-run` } };
}

test("SQLite bootstraps schema, allocates task IDs, and preserves records", () => {
  const { store } = sqliteFixture();
  try {
    store.createTask(sqliteTask());
    store.createTask(sqliteTask());
    const task = store.getTask("fixture", "task-0001");
    assert.equal(task.body, "# Rich **body**\n");
    assert.equal(task.phase, "phase-16");
    store.updateTask("fixture", "task-0001", { phase: "phase-17" });
    assert.equal(store.getTask("fixture", "task-0001").phase, "phase-17");
    assert.equal(task.metadata.source_filename, "legacy.md");
    assert.deepEqual(store.listDependencies("fixture", "task-0001"), []);
    assert.deepEqual(store.allocateTaskId("fixture"), "task-0003");
  } finally { store.close(); }
});

test("SQLite allocation and handoff sequencing are shared across store instances", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-sqlite-shared-"));
  const databasePath = join(cwd, "nested", "workflow.sqlite");
  const first = new SQLiteWorkflowStore(databasePath, "fixture");
  const second = new SQLiteWorkflowStore(databasePath, "fixture");
  try {
    first.createTask(sqliteTask());
    second.createTask(sqliteTask());
    first.addHandoff(handoff("worker", "task-0001"));
    second.addHandoff(handoff("reviewer", "task-0001"));
    assert.equal(first.getTask("fixture", "task-0002").id, "task-0002");
    assert.deepEqual(second.listHandoffs("fixture", "task-0001").map((item) => item.sequence), [1, 2]);
  } finally {
    second.close();
    first.close();
  }
});

test("SQLite handoffs are append-only with monotonic per-task sequences", () => {
  const { store } = sqliteFixture();
  try {
    store.createTask(sqliteTask("task-0001"));
    store.addHandoff(handoff("worker"));
    store.addHandoff(handoff("reviewer"));
    assert.deepEqual(store.listHandoffs("fixture", "task-0001").map((item) => item.sequence), [1, 2]);
  } finally { store.close(); }
});

test("SQLite task completion and handoff insertion roll back together", () => {
  const { store } = sqliteFixture();
  try {
    store.createTask(sqliteTask("task-0001"));
    assert.throws(() => store.updateTaskWithHandoff("fixture", "task-0001", { status: "done" }, handoff("worker")), /requires worker and reviewer/);
    assert.equal(store.getTask("fixture", "task-0001").status, "ready");
    assert.deepEqual(store.listHandoffs("fixture", "task-0001"), []);
    store.updateTaskWithHandoff("fixture", "task-0001", { status: "in_progress" }, handoff("worker"));
    store.updateTaskWithHandoff("fixture", "task-0001", { status: "done" }, handoff("reviewer"));
    assert.equal(store.getTask("fixture", "task-0001").status, "done");
  } finally { store.close(); }
});

test("SQLite imports legacy incomplete trails and supports explicit override", () => {
  const { store } = sqliteFixture();
  try {
    store.importTask(sqliteTask("task-0001", "done"), [handoff("worker")]);
    const task = store.getTask("fixture", "task-0001");
    assert.equal(task.status, "done");
    assert.equal(task.metadata.imported_handoff_count, 1);
    assert.equal(task.metadata.incomplete_handoff_trail, true);
    assert.throws(() => store.completeTask("fixture", "task-0001"), /requires worker and reviewer/);
    store.completeTask("fixture", "task-0001", true);
  } finally { store.close(); }
});

test("Markdown task lookup accepts YAML scalar identifiers", () => {
  const { root, store } = storeFixture();
  writeFileSync(join(root, "_shared", "tasks", "task-0001_scalar.md"), "---\nid: 1\ntitle: Scalar\ntype: task\nstatus: ready\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: normal\nparent: \"\"\ndepends_on: []\n---\n# Task\n", "utf8");
  assert.equal(store.getTask("fixture", "1").title, "Scalar");
  store.updateTask("fixture", "1", { status: "done" });
  assert.equal(store.getTask("fixture", "1").status, "done");
});

// Phase summaries (task-0108): both providers must give identical results for the same fixtures.
const phaseFixtureTasks = [
  { id: "task-0001", title: "Explicit field", status: "done", phase: "phase-27", updatedOn: "2026-10-01" },
  { id: "task-0002", title: "Another explicit", status: "ready", phase: "phase-27", updatedOn: "2026-10-05T10:00:00.000Z" },
  { id: "task-0003", title: "Phase 26 work in the title", status: "in_progress", updatedOn: "2026-10-03" },
  { id: "task-0004", title: "Field beats title phase-30", status: "review", phase: "phase-26", updatedOn: "2026-10-02" },
  { id: "task-0005", title: "No phase at all", status: "blocked", updatedOn: "2026-09-01" },
  { id: "task-0006", title: "Todo item", status: "todo", phase: "phase-27", updatedOn: "2026-10-04" }
];

function phaseTask(partial) {
  return {
    projectIdentifier: "fixture", type: "task", assignedTo: "worker", priority: "normal", parent: "",
    dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-09-01",
    body: "# Task\n", metadata: {}, ...partial
  };
}

const phaseProviders = {
  markdown() {
    const { store } = storeFixture();
    return { store, close() {} };
  },
  sqlite() {
    const { store } = sqliteFixture();
    return { store, close: () => store.close() };
  }
};

for (const [provider, make] of Object.entries(phaseProviders)) {
  test(`${provider} listPhaseSummaries returns an empty list for an empty store`, () => {
    const { store, close } = make();
    try { assert.deepEqual(store.listPhaseSummaries("fixture"), []); } finally { close(); }
  });

  test(`${provider} listPhaseSummaries resolves phases and counts every status`, () => {
    const { store, close } = make();
    try {
      for (const task of phaseFixtureTasks) store.createTask(phaseTask(task));
      const summaries = store.listPhaseSummaries("fixture");
      assert.deepEqual(summaries.map((summary) => summary.phase), ["phase-26", "phase-27", "Unassigned"]);
      const by = Object.fromEntries(summaries.map((summary) => [summary.phase, summary]));
      assert.deepEqual(by["phase-27"], { phase: "phase-27", total: 3, counts: { todo: 1, ready: 1, in_progress: 0, blocked: 0, review: 0, done: 1 }, latestUpdatedOn: "2026-10-05T10:00:00.000Z" });
      assert.deepEqual(by["phase-26"], { phase: "phase-26", total: 2, counts: { todo: 0, ready: 0, in_progress: 1, blocked: 0, review: 1, done: 0 }, latestUpdatedOn: "2026-10-03" });
      assert.deepEqual(by.Unassigned, { phase: "Unassigned", total: 1, counts: { todo: 0, ready: 0, in_progress: 0, blocked: 1, review: 0, done: 0 }, latestUpdatedOn: "2026-09-01" });
      for (const summary of summaries) assert.equal(Object.values(summary.counts).reduce((a, b) => a + b, 0), summary.total);
    } finally { close(); }
  });

  test(`${provider} listTasks filters by resolved phase`, () => {
    const { store, close } = make();
    try {
      for (const task of phaseFixtureTasks) store.createTask(phaseTask(task));
      assert.deepEqual(store.listTasks("fixture", { phase: "phase-27" }).map((task) => task.id), ["task-0001", "task-0002", "task-0006"]);
      assert.deepEqual(store.listTasks("fixture", { phase: "phase-26" }).map((task) => task.id), ["task-0003", "task-0004"]);
      assert.deepEqual(store.listTasks("fixture", { phase: "Unassigned" }).map((task) => task.id), ["task-0005"]);
      assert.deepEqual(store.listTasks("fixture", { phase: "phase-27", status: "done" }).map((task) => task.id), ["task-0001"]);
      assert.deepEqual(store.listTasks("fixture", { phase: "phase-99" }), []);
    } finally { close(); }
  });
}

test("SQLite and Markdown phase results are equal for the same fixtures", () => {
  const results = Object.values(phaseProviders).map((make) => {
    const { store, close } = make();
    try {
      for (const task of phaseFixtureTasks) store.createTask(phaseTask(task));
      return { summaries: store.listPhaseSummaries("fixture"), ids: store.listTasks("fixture", { phase: "phase-26" }).map((task) => task.id) };
    } finally { close(); }
  });
  assert.deepEqual(results[0], results[1]);
});

test("SQLite resolves a blank phase column from metadata before the title", () => {
  const { store } = sqliteFixture();
  try {
    store.createTask(phaseTask({ id: "task-0001", title: "Phase 3 title", status: "ready", updatedOn: "2026-10-01", metadata: { phase: "phase-8" } }));
    assert.deepEqual(store.listPhaseSummaries("fixture").map((summary) => summary.phase), ["phase-8"]);
    assert.equal(store.listTasks("fixture", { phase: "phase-8" }).length, 1);
  } finally { store.close(); }
});

test("SQLite summaries handle 1000 tasks quickly", () => {
  const { store } = sqliteFixture();
  try {
    for (let i = 1; i <= 1000; i += 1) {
      const id = `task-${String(i).padStart(4, "0")}`;
      store.createTask(phaseTask({ id, title: i % 10 === 0 ? `Phase 5 item ${i}` : `Item ${i}`, status: ["todo", "ready", "in_progress", "blocked", "review", "done"][i % 6], ...(i % 3 === 0 ? { phase: `phase-${i % 7}` } : {}), updatedOn: "2026-10-01" }));
    }
    const started = Date.now();
    const summaries = store.listPhaseSummaries("fixture");
    assert.ok(Date.now() - started < 2000);
    assert.equal(summaries.reduce((sum, summary) => sum + summary.total, 0), 1000);
  } finally { store.close(); }
});
