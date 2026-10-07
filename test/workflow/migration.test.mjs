import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateMarkdownToSQLite } from "../../dist/workflow/migration.js";
import { SQLiteWorkflowStore } from "../../dist/workflow/index.js";

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-migration-"));
  const shared = join(cwd, ".agent-rig", "_shared");
  mkdirSync(join(shared, "tasks"), { recursive: true });
  mkdirSync(join(shared, "handoff_logs"), { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workspace_version: 1, custom: true, workflow_store: { provider: "markdown" }, project_identifier: "fixture" }), "utf8");
  return { cwd, shared };
}

function task(id, status, depends = [], extra = "") {
  return `---\nid: ${id}\ntitle: ${id} title\ntype: task\nstatus: ${status}\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-04\nupdated_on: 2026-10-04\npriority: high\nparent: \"\"\ndepends_on: [${depends.join(", ")}]\ncustom_field: retained\n${extra}---\n# Rich body\n\nKeep **this**.\n`;
}

test("workflow migration preserves records, filenames, content, and config-last markers", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "done"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0002_second-task.md"), task("task-0002", "ready", ["task-0001"]), "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-04-1001_run-a_codex_worker.md"), "---\ntask: task-0002\nagent: worker\nrecipient: reviewer\nstatus: review\n---\n\nReview **this**.\n", "utf8");
  migrateMarkdownToSQLite(cwd, "2026-10-04T12:00:00.000Z");

  const database = join(shared, "workflow.sqlite");
  const store = new SQLiteWorkflowStore(database, "fixture");
  try {
    const migrated = store.getTask("fixture", "task-0002");
    assert.equal(migrated.status, "ready");
    assert.deepEqual(migrated.dependsOn, ["task-0001"]);
    assert.equal(migrated.body, "# Rich body\n\nKeep **this**.\n");
    assert.equal(migrated.metadata.source_filename, "task-0002_second-task.md");
    assert.equal(migrated.metadata.custom_field, "retained");
    assert.equal(migrated.metadata.imported_handoff_count, 1);
    assert.equal(migrated.metadata.incomplete_handoff_trail, true);
    assert.equal(store.listHandoffs("fixture", "task-0002")[0].metadata.filename, "2026-10-04-1001_run-a_codex_worker.md");
  } finally { store.close(); }

  const config = JSON.parse(readFileSync(join(shared, "agent-rig.json"), "utf8"));
  assert.equal(config.workflow_store.provider, "sqlite");
  assert.equal(config.custom, true);
  for (const file of [join(shared, "tasks", "task-0001_first-task.md"), join(shared, "tasks", "task-0002_second-task.md"), join(shared, "handoff_logs", "2026-10-04-1001_run-a_codex_worker.md")]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /storage_status: migrated/);
    assert.match(text, /migrated_to: sqlite/);
    assert.match(text, /migrated_at: 2026-10-04T12:00:00.000Z/);
  }
});

test("workflow migration verifies dependency links independent of source ordering", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "done"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0002_second-task.md"), task("task-0002", "done"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0003_third-task.md"), task("task-0003", "ready", ["task-0002", "task-0001"]), "utf8");
  migrateMarkdownToSQLite(cwd, "2026-10-04T12:00:00.000Z");
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  try { assert.deepEqual(store.listDependencies("fixture", "task-0003"), ["task-0001", "task-0002"]); } finally { store.close(); }
});

test("workflow migration refuses reruns and existing SQLite targets", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "ready"), "utf8");
  writeFileSync(join(shared, "workflow.sqlite"), "existing", "utf8");
  assert.throws(() => migrateMarkdownToSQLite(cwd), /Refusing to overwrite existing SQLite database/);
});

test("workflow migration refuses existing SQLite sidecars", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "workflow.sqlite-wal"), "existing", "utf8");
  assert.throws(() => migrateMarkdownToSQLite(cwd), /Refusing to overwrite existing SQLite database/);
});

test("workflow migration refuses unsupported workflow source filenames", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "notes.md"), task("task-0001", "ready"), "utf8");
  assert.throws(() => migrateMarkdownToSQLite(cwd), /Unsupported task source filename/);
  assert.equal(JSON.parse(readFileSync(join(shared, "agent-rig.json"), "utf8")).workflow_store.provider, "markdown");
  assert.equal(existsSync(join(shared, "workflow.sqlite")), false);
});

test("workflow migration leaves Markdown authoritative when validation fails", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "ready", ["task-9999"]), "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-04-1001_run-a_codex_worker.md"), "---\ntask: task-9999\nagent: worker\n---\ninvalid\n", "utf8");
  assert.throws(() => migrateMarkdownToSQLite(cwd), /unknown task/);
  assert.equal(JSON.parse(readFileSync(join(shared, "agent-rig.json"), "utf8")).workflow_store.provider, "markdown");
  assert.equal(existsSync(join(shared, "workflow.sqlite")), false);
});

test("workflow migration validates dependency links before creating SQLite", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "ready", ["task-9999"]), "utf8");
  assert.throws(() => migrateMarkdownToSQLite(cwd), /depends on unknown task/);
  assert.equal(existsSync(join(shared, "workflow.sqlite")), false);
  assert.equal(JSON.parse(readFileSync(join(shared, "agent-rig.json"), "utf8")).workflow_store.provider, "markdown");
});

test("workflow migration rejects unverifiable handoff reply links", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "review"), "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-04-1001_run-a_codex_worker.md"), "---\ntask: task-0001\nagent: worker\nsequence: 1\nanswers_sequence: 9\n---\ninvalid link\n", "utf8");
  assert.throws(() => migrateMarkdownToSQLite(cwd), /invalid answers_sequence/);
  assert.equal(existsSync(join(shared, "workflow.sqlite")), false);
});

test("workflow migration preserves incomplete trails per task without inventing replies", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "done"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0002_second-task.md"), task("task-0002", "review"), "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-04-1001_first_codex_worker.md"), "---\ntask: task-0002\nagent: worker\nstatus: review\n---\nfirst\n", "utf8");
  migrateMarkdownToSQLite(cwd, "2026-10-04T12:00:00.000Z");

  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  try {
    assert.equal(store.listHandoffs("fixture", "task-0001").length, 0);
    assert.equal(store.getTask("fixture", "task-0001").metadata.imported_handoff_count, 0);
    assert.equal(store.getTask("fixture", "task-0001").metadata.incomplete_handoff_trail, true);
    assert.throws(() => store.completeTask("fixture", "task-0001"), /requires worker and reviewer/);
    assert.deepEqual(store.listHandoffs("fixture", "task-0002").map(({ sequence, answersSequence }) => ({ sequence, answersSequence })), [{ sequence: 1, answersSequence: undefined }]);
    assert.throws(() => store.completeTask("fixture", "task-0002"), /requires worker and reviewer/);
  } finally { store.close(); }
});

test("legacy handoff sequence allocation is independent per task", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_first-task.md"), task("task-0001", "review"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0002_second-task.md"), task("task-0002", "review"), "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-04-1001_first_codex_worker.md"), "---\ntask: task-0001\nagent: worker\nstatus: review\n---\nfirst\n", "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-04-1002_second_codex_worker.md"), "---\ntask: task-0002\nagent: worker\nstatus: review\n---\nsecond\n", "utf8");
  migrateMarkdownToSQLite(cwd, "2026-10-04T12:00:00.000Z");

  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  try {
    assert.deepEqual(store.listHandoffs("fixture", "task-0001").map(({ sequence }) => sequence), [1]);
    assert.deepEqual(store.listHandoffs("fixture", "task-0002").map(({ sequence }) => sequence), [1]);
  } finally { store.close(); }
});

test("workflow migration keeps SQLite after a historical marker failure", () => {
  const { cwd, shared } = fixture();
  const handoffDirectory = join(shared, "handoff_logs");
  const taskFile = join(shared, "tasks", "task-0001_first-task.md");
  const handoffFile = join(handoffDirectory, "2026-10-04-1001_run-a_codex_worker.md");
  writeFileSync(taskFile, task("task-0001", "review"), "utf8");
  writeFileSync(handoffFile, "---\ntask: task-0001\nagent: worker\nstatus: review\n---\nlegacy\n", "utf8");

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  chmodSync(handoffDirectory, 0o555);
  try {
    migrateMarkdownToSQLite(cwd, "2026-10-04T12:00:00.000Z");
  } finally {
    chmodSync(handoffDirectory, 0o755);
    console.error = originalError;
  }

  assert.equal(JSON.parse(readFileSync(join(shared, "agent-rig.json"), "utf8")).workflow_store.provider, "sqlite");
  assert.equal(existsSync(join(shared, "workflow.sqlite")), true);
  assert.match(errors.join("\n"), /some Markdown markers failed/);
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  try { assert.equal(store.getTask("fixture", "task-0001").status, "review"); } finally { store.close(); }
});
