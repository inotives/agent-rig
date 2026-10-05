import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupWorkflowDatabase, importMarkdownToSQLite, rebuildSQLiteFromMarkdown, repairSQLitePlaceholders } from "../dist/workflow-safety.js";
import { SQLiteWorkflowStore } from "../dist/workflow-store.js";

const cli = new URL("../dist/index.js", import.meta.url).pathname;

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-safety-"));
  const shared = join(cwd, ".agent-rig", "_shared");
  mkdirSync(join(shared, "tasks"), { recursive: true });
  mkdirSync(join(shared, "handoff_logs"), { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workflow_store: { provider: "sqlite" }, project_identifier: "fixture" }), "utf8");
  return { cwd, shared };
}

function task(id, status = "ready") {
  return `---\nid: ${id}\ntitle: ${id}\ntype: task\nstatus: ${status}\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-05\nupdated_on: 2026-10-05\npriority: normal\nparent: \"\"\ndepends_on: []\n---\nbody ${id}\n`;
}

test("locked incremental import marks only committed new records and reports orphans", () => {
  const { cwd, shared } = fixture();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), task("task-0001"), "utf8");
  writeFileSync(join(shared, "handoff_logs", "2026-10-05-1000_run_worker.md"), "---\ntask: task-9999\nsender: worker\nrecipient: reviewer\nstatus: review\n---\norphan\n", "utf8");
  const report = importMarkdownToSQLite(cwd, "2026-10-05T10:00:00.000Z");
  assert.deepEqual(report.imported, ["task-0001"]);
  assert.deepEqual(report.orphaned, ["task-9999:1"]);
  assert.match(readFileSync(join(shared, "tasks", "task-0001_one.md"), "utf8"), /storage_status: migrated/);
  assert.equal(existsSync(join(shared, "workflow.lock")), false);
});

test("backup validates a consistent SQLite snapshot and rebuild preserves SQLite conflicts", () => {
  const { cwd, shared } = fixture();
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "SQLite title", type: "task", status: "done", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "sqlite body", metadata: {} });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), task("task-0001", "ready"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0002_two.md"), task("task-0002"), "utf8");
  const backup = backupWorkflowDatabase(cwd, undefined, false, "2026-10-05T10:00:00.000Z");
  assert.equal(existsSync(backup), true);
  const report = rebuildSQLiteFromMarkdown(cwd, true, "REPLACE SQLITE", "2026-10-05T10:00:00.000Z");
  assert.deepEqual(report.conflicted, ["task-0001"]);
  const rebuilt = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  assert.equal(rebuilt.getTask("fixture", "task-0001").status, "done");
  assert.equal(rebuilt.getTask("fixture", "task-0002").status, "ready");
  rebuilt.close();
});

test("safety CLI exits nonzero when a report contains conflicts or records at risk", () => {
  const { cwd, shared } = fixture();
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "SQLite title", type: "task", status: "done", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "sqlite body", metadata: {} });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), task("task-0001"), "utf8");

  const importResult = spawnSync(process.execPath, [cli, "workflow", "import", "--from", "markdown", "--json"], { cwd, encoding: "utf8" });
  assert.equal(importResult.status, 1);
  assert.deepEqual(JSON.parse(importResult.stdout).conflicted, ["task-0001"]);

  const current = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  current.createTask({ projectIdentifier: "fixture", id: "task-0002", title: "SQLite only", type: "task", status: "ready", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "sqlite only", metadata: {} });
  current.close();

  const rebuildResult = spawnSync(process.execPath, [cli, "workflow", "rebuild", "--json"], { cwd, encoding: "utf8" });
  assert.equal(rebuildResult.status, 1);
  const rebuildReport = JSON.parse(rebuildResult.stdout);
  assert.deepEqual(rebuildReport.wouldLose, ["task-0002"]);
  assert.deepEqual(rebuildReport.conflicted, ["task-0001"]);
});

test("placeholder repair detects the canonical Phase 17 body and copies the matching Markdown body and phase", () => {
  const { cwd, shared } = fixture();
  const placeholder = "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n";
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "task-0001", type: "task", status: "review", assignedTo: "worker", priority: "high", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: placeholder, metadata: { source_filename: "task-0001_one.md" } });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), "---\nid: task-0001\ntitle: task-0001\ntype: task\nstatus: review\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-05\nupdated_on: 2026-10-05\npriority: high\nparent: \"\"\ndepends_on: []\nphase: phase-16\n---\n\n# Recovered body\n\nKeep **this**.\n", "utf8");

  assert.deepEqual(repairSQLitePlaceholders(cwd, true), { repaired: ["task-0001"], skipped: [], refused: [], dryRun: true });
  const repaired = repairSQLitePlaceholders(cwd);
  assert.deepEqual(repaired, { repaired: ["task-0001"], skipped: [], refused: [], dryRun: false });
  const current = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  const taskRecord = current.getTask("fixture", "task-0001");
  assert.equal(taskRecord.body, "\n# Recovered body\n\nKeep **this**.\n");
  assert.equal(taskRecord.metadata.phase, "phase-16");
  assert.equal(taskRecord.status, "review");
  assert.equal(taskRecord.updatedOn, "2026-10-05");
  current.close();
});

test("placeholder repair ignores SQLite lifecycle status and updated timestamp", () => {
  const { cwd, shared } = fixture();
  const placeholder = "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n";
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "task-0001", type: "task", status: "blocked", assignedTo: "worker", priority: "high", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-06", body: placeholder, metadata: { source_filename: "task-0001_one.md" } });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), "---\nid: task-0001\ntitle: task-0001\ntype: task\nstatus: todo\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-05\nupdated_on: 2026-10-05\npriority: high\nparent: \"\"\ndepends_on: []\nphase: phase-17\n---\n\n# Recovered body\n", "utf8");

  assert.deepEqual(repairSQLitePlaceholders(cwd), { repaired: ["task-0001"], skipped: [], refused: [], dryRun: false });
  const current = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  const repaired = current.getTask("fixture", "task-0001");
  assert.equal(repaired.body, "\n# Recovered body\n");
  assert.equal(repaired.metadata.phase, "phase-17");
  assert.equal(repaired.status, "blocked");
  assert.equal(repaired.updatedOn, "2026-10-06");
  current.close();
});

test("placeholder repair ignores generated blocker notes and preserves SQLite lifecycle fields", () => {
  const { cwd, shared } = fixture();
  const placeholder = "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n## Blockers\n\n- 2026-10-05: Waiting for task-0036\n";
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "task-0001", type: "task", status: "blocked", assignedTo: "worker", priority: "high", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-06", body: placeholder, metadata: { blocked_reason: "Waiting for task-0036", source_filename: "task-0001_one.md" } });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), "---\nid: task-0001\ntitle: task-0001\ntype: task\nstatus: todo\nassigned_to: worker\ncreated_by: human\ncreated_on: 2026-10-05\nupdated_on: 2026-10-05\npriority: high\nparent: \"\"\ndepends_on: []\n---\n\n# Recovered body\n", "utf8");

  assert.deepEqual(repairSQLitePlaceholders(cwd), { repaired: ["task-0001"], skipped: [], refused: [], dryRun: false });
  const current = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  const repaired = current.getTask("fixture", "task-0001");
  assert.equal(repaired.body, "\n# Recovered body\n");
  assert.equal(repaired.status, "blocked");
  assert.equal(repaired.updatedOn, "2026-10-06");
  assert.equal(repaired.metadata.blocked_reason, "Waiting for task-0036");
  current.close();
});

test("placeholder repair refuses handoff-bearing records and does not mutate them", () => {
  const { cwd, shared } = fixture();
  const placeholder = "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n";
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "task-0001", type: "task", status: "review", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: placeholder, metadata: {} });
  store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "evidence", createdAt: "2026-10-05T10:00:00.000Z", metadata: {} });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), task("task-0001"), "utf8");
  const report = repairSQLitePlaceholders(cwd, true);
  assert.deepEqual(report.repaired, []);
  assert.match(report.refused[0], /has handoffs/);
});

test("placeholder repair refuses duplicate Markdown task IDs without mutating SQLite", () => {
  const { cwd, shared } = fixture();
  const placeholder = "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n";
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "task-0001", type: "task", status: "review", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: placeholder, metadata: {} });
  store.close();
  writeFileSync(join(shared, "tasks", "task-0001_one.md"), task("task-0001"), "utf8");
  writeFileSync(join(shared, "tasks", "task-0001_two.md"), task("task-0001"), "utf8");

  const report = repairSQLitePlaceholders(cwd, true);
  assert.deepEqual(report.repaired, []);
  assert.match(report.refused[0], /Markdown source conflict: duplicate Markdown task ID task-0001/);
  const current = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  assert.equal(current.getTask("fixture", "task-0001").body, placeholder);
  current.close();
});
