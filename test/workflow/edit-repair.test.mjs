import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { MarkdownWorkflowStore, SQLiteWorkflowStore, serializeTask } from "../../dist/workflow/index.js";

const brief = ["Context", "Goal", "Scope", "Planner Notes", "Implementation Plan", "Acceptance Criteria"]
  .map((section) => `## ${section}\n\n${section === "Acceptance Criteria" ? "- [ ] Check result." : "Task content."}`).join("\n\n");
const cli = new URL("../../dist/index.js", import.meta.url).pathname;
const task = (id, status = "blocked", dependsOn = []) => ({
  projectIdentifier: "fixture", id, title: "Original", type: "task", status, assignedTo: "worker",
  priority: "normal", phase: "phase-28", parent: "", dependsOn, dependencyReady: true, blockedBy: [],
  createdBy: "planner", createdOn: "2026-10-01", updatedOn: "2026-10-02", body: brief,
  metadata: { imported_handoff_count: 1, incomplete_handoff_trail: true, custom: { keep: [1, 2] } }
});

function fixture(provider, actorRole = "planner") {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-edit-repair-"));
  const root = join(cwd, ".agent-rig");
  const shared = join(root, "_shared");
  mkdirSync(join(shared, "tasks"), { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ project_identifier: "fixture", workflow_store: { provider } }));
  for (const name of ["worker", "planner"]) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, "agent.toml"), `role = "${name}"\ntool = "codex"\n`);
  }
  const database = join(shared, "workflow.sqlite");
  const store = provider === "sqlite" ? new SQLiteWorkflowStore(database, "fixture", { actorRole }) : new MarkdownWorkflowStore(root, "fixture", actorRole);
  const run = (args, role = "planner") => spawnSync(process.execPath, [cli, "tasks", ...args], {
    cwd, encoding: "utf8", timeout: 10000, env: { ...process.env, AGENT_RIG_ROLE: role }
  });
  function corruptStatus(id, status) {
    if (provider === "sqlite") {
      const db = new Database(database);
      try { db.prepare("UPDATE tasks SET status = ? WHERE task_id = ?").run(status, id); } finally { db.close(); }
    } else {
      const current = store.getTask("fixture", id);
      const file = readdirSync(join(shared, "tasks")).find((file) => file.startsWith(`${id}_`));
      writeFileSync(join(shared, "tasks", file), serializeTask({ ...current, status }));
    }
  }
  return { cwd, shared, store, run, corruptStatus, close: () => store.close?.() };
}

for (const provider of ["markdown", "sqlite"]) {
  test(`${provider}: a mixed valid edit and invalid dependency is rejected atomically`, () => {
    const f = fixture(provider);
    try {
      f.store.createTask(task("task-0001"));
      f.store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "Keep evidence", createdAt: "2026-10-01", metadata: {} });
      const before = f.store.getTask("fixture", "task-0001");
      const handoffs = f.store.listHandoffs("fixture", "task-0001");
      const file = join(f.cwd, "body.md");
      writeFileSync(file, brief + "\nReplacement body.\n");
      const result = f.run(["edit", "task-0001", "--title", "Replacement title", "--body-file", file,
        "--priority", "high", "--phase", "phase-29", "--depends-on", "task-missing"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Missing dependency/);
      assert.deepEqual(f.store.getTask("fixture", "task-0001"), before);
      assert.deepEqual(f.store.listHandoffs("fixture", "task-0001"), handoffs);
    } finally { f.close(); }
  });

  test(`${provider}: edits preserve handoffs, audit metadata, and creation fields`, () => {
    const f = fixture(provider);
    try {
      f.store.createTask(task("task-0001"));
      f.store.createTask(task("task-0002", "done"));
      f.store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "Existing evidence", createdAt: "2026-10-01", metadata: { custom: "keep" } });
      const before = f.store.getTask("fixture", "task-0001");
      const handoffs = f.store.listHandoffs("fixture", "task-0001");
      const body = brief + "\n\nNew content.\n";
      const file = join(f.cwd, "body.md");
      writeFileSync(file, body);
      const result = f.run(["edit", "task-0001", "--title", "Edited title", "--body-file", file,
        "--priority", "high", "--type", "bug", "--phase", "phase-29", "--assigned-to", "planner", "--depends-on", "task-0002"]);
      assert.equal(result.status, 0, result.stderr);
      const edited = f.store.getTask("fixture", "task-0001");
      assert.deepEqual({ title: edited.title, body: edited.body, priority: edited.priority, type: edited.type, phase: edited.phase, assignedTo: edited.assignedTo, dependsOn: edited.dependsOn },
        { title: "Edited title", body, priority: "high", type: "bug", phase: "phase-29", assignedTo: "planner", dependsOn: ["task-0002"] });
      assert.equal(edited.status, before.status);
      assert.equal(edited.createdOn, before.createdOn);
      assert.equal(edited.createdBy, before.createdBy);
      for (const [key, value] of Object.entries(before.metadata)) if (key !== "phase") assert.deepEqual(edited.metadata[key], value);
      assert.deepEqual(f.store.listHandoffs("fixture", "task-0001"), handoffs);
      assert.equal(f.run(["edit", "task-0001", "--assigned-to", "none", "--depends-on", "none"]).status, 0);
      assert.equal(f.store.getTask("fixture", "task-0001").assignedTo, "");
      assert.deepEqual(f.store.listDependencies("fixture", "task-0001"), []);
      writeFileSync(file, brief + "\nUpdated by update-body.\n");
      assert.equal(f.run(["update-body", "task-0001", "--body-file", file]).status, 0);
      assert.equal(f.store.getTask("fixture", "task-0001").body, readFileSync(file, "utf8"));
      assert.deepEqual(f.store.listHandoffs("fixture", "task-0001"), handoffs);
    } finally { f.close(); }
  });

  test(`${provider}: repair restores invalid status and appends audit without changing handoffs`, () => {
    const f = fixture(provider);
    try {
      f.store.createTask(task("task-0001"));
      f.store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "Keep evidence", createdAt: "2026-10-01", metadata: {} });
      f.corruptStatus("task-0001", "broken");
      const before = f.store.getTask("fixture", "task-0001");
      const handoffs = f.store.listHandoffs("fixture", "task-0001");
      assert.throws(() => f.store.updateTask("fixture", "task-0001", { status: "ready" }), /Invalid current status/);
      const result = f.run(["repair", "task-0001", "--status", "ready", "--reason", "Recover interrupted state"]);
      assert.equal(result.status, 0, result.stderr);
      const repaired = f.store.getTask("fixture", "task-0001");
      const { repair_history, ...metadata } = repaired.metadata;
      assert.deepEqual(metadata, before.metadata);
      assert.deepEqual(repaired, { ...before, status: "ready", updatedOn: repaired.updatedOn, metadata: repaired.metadata });
      assert.deepEqual(repair_history[0], { actor: "planner", from_status: "broken", to_status: "ready", reason: "Recover interrupted state", created_at: repaired.updatedOn });
      f.store.repairTask("fixture", "task-0001", "blocked", "Second incident");
      assert.deepEqual(f.store.getTask("fixture", "task-0001").metadata.repair_history[0], repair_history[0]);
      assert.equal(f.store.getTask("fixture", "task-0001").metadata.repair_history.length, 2);
      assert.deepEqual(f.store.listHandoffs("fixture", "task-0001"), handoffs);
    } finally { f.close(); }
  });

  test(`${provider}: repair fails closed for unauthorized roles, invalid targets, and missing reason`, () => {
    for (const role of ["worker", "reviewer", "human", ""]) {
      const f = fixture(provider, role);
      try {
        const setup = provider === "sqlite"
          ? new SQLiteWorkflowStore(join(f.cwd, ".agent-rig", "_shared", "workflow.sqlite"), "fixture", { actorRole: "planner" })
          : new MarkdownWorkflowStore(join(f.cwd, ".agent-rig"), "fixture", "planner");
        try { setup.createTask(task("task-0001")); } finally { setup.close?.(); }
        const before = f.store.getTask("fixture", "task-0001");
        assert.throws(() => f.store.repairTask("fixture", "task-0001", "ready", "Reason"), /Only the planner/);
        assert.equal(f.run(["repair", "task-0001", "--status", "ready", "--reason", "Reason"], role).status, 1);
        assert.deepEqual(f.store.getTask("fixture", "task-0001"), before);
      } finally { f.close(); }
    }
    const f = fixture(provider);
    try {
      f.store.createTask(task("task-0001"));
      const before = f.store.getTask("fixture", "task-0001");
      for (const [status, reason, error] of [["done", "Reason", /cannot mark/], ["invalid", "Reason", /Invalid status/], ["ready", "  ", /requires a reason/]]) {
        assert.throws(() => f.store.repairTask("fixture", "task-0001", status, reason), error);
        assert.equal(f.run(["repair", "task-0001", "--status", status, "--reason", reason]).status, 1);
        assert.deepEqual(f.store.getTask("fixture", "task-0001"), before);
      }
      assert.equal(f.run(["repair", "task-0001", "--reason", "Reason"]).status, 1);
      assert.equal(f.run(["repair", "task-0001", "--status", "ready"]).status, 1);
    } finally { f.close(); }
  });

  test(`${provider}: dependency and lifecycle violations leave task and handoffs unchanged`, () => {
    const f = fixture(provider);
    try {
      f.store.createTask(task("task-0001", "ready"));
      f.store.createTask(task("task-0002", "blocked", ["task-0001"]));
      const before = f.store.getTask("fixture", "task-0001");
      for (const [patch, error] of [
        [{ dependsOn: ["task-missing"] }, /Missing dependency/],
        [{ dependsOn: ["task-0001"] }, /itself/],
        [{ dependsOn: ["task-0002", "task-0002"] }, /Duplicate dependency/],
        [{ dependsOn: ["task-0002"] }, /Dependency cycle/],
        [{ status: "invalid" }, /Invalid status/],
        [{ status: "review" }, /Invalid task transition/]
      ]) {
        assert.throws(() => f.store.updateTask("fixture", "task-0001", patch), error);
        assert.throws(() => f.store.updateTaskWithHandoff("fixture", "task-0001", patch, { projectIdentifier: "fixture", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "No write", createdAt: "2026-10-13", metadata: {} }), error);
        assert.deepEqual(f.store.getTask("fixture", "task-0001"), before);
        assert.deepEqual(f.store.listHandoffs("fixture", "task-0001"), []);
      }
      assert.throws(() => f.store.updateTask("fixture", "task-0002", { status: "ready" }), /incomplete dependencies/);
      assert.throws(() => f.store.repairTask("fixture", "task-0002", "in_progress", "Reason"), /incomplete dependencies/);
      for (const args of [["--title", " "], ["--priority", "urgent"], ["--type", "invalid"], ["--assigned-to", "missing"], ["--status", "done"], ["--depends-on", "task-missing"], ["--depends-on", ","], ["--depends-on", "none,task-0002"]]) {
        assert.equal(f.run(["edit", "task-0001", ...args]).status, 1);
        assert.deepEqual(f.store.getTask("fixture", "task-0001"), before);
      }
    } finally { f.close(); }
  });

  test(`${provider}: reopening completed predecessors cannot invalidate active dependents`, () => {
    const f = fixture(provider);
    try {
      f.store.createTask(task("task-0001", "done"));
      f.store.createTask(task("task-0002", "in_progress", ["task-0001"]));
      assert.throws(() => f.store.updateTask("fixture", "task-0001", { status: "ready" }), /Invalid task transition/);
      assert.throws(() => f.store.repairTask("fixture", "task-0001", "ready", "Reopen"), /active or completed dependents/);
      assert.equal(f.store.getTask("fixture", "task-0001").status, "done");
      assert.equal(f.store.getTask("fixture", "task-0001").metadata.repair_history, undefined);
      f.store.updateTask("fixture", "task-0002", { status: "blocked" });
      f.store.repairTask("fixture", "task-0001", "ready", "Reopen");
      assert.equal(f.store.getTask("fixture", "task-0001").status, "ready");
    } finally { f.close(); }
  });
}
