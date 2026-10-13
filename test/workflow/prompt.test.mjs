import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { createWorkflowStore, SQLiteWorkflowStore, serializeTask } from "../../dist/workflow/index.js";
import { buildTaskPrompt } from "../../dist/workflow/prompt.js";

const cli = resolve("dist/index.js");
const normalizeMacOSTmpPath = (value) => value.replaceAll("/private/var/folders/", "/var/folders/");
const normalizeRepositoryRoot = (prompt) => prompt.replace(/^(# AgentRig Task Prompt\n\n(?:[^\n]*\n){4}Repository root: )([^\n]*)/, (_, label, root) => label + normalizeMacOSTmpPath(root));
const brief = ["Context", "Goal", "Scope", "Planner Notes", "Implementation Plan", "Acceptance Criteria"]
  .map((name) => `## ${name}\n\n${name === "Acceptance Criteria" ? "- [ ] Check output." : "Task content."}`).join("\n\n");

function fixture(provider) {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-prompt-"));
  const root = join(cwd, ".agent-rig");
  mkdirSync(join(root, "_shared"), { recursive: true });
  writeFileSync(join(root, "_shared", "agent-rig.json"), JSON.stringify({ project_identifier: "fixture", workflow_store: { provider } }));
  writeFileSync(join(root, "_shared", "context.md"), "Shared context.");
  for (const name of ["worker", "reviewer"]) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, "agent.toml"), `role = "${name}"\ntool = "custom"\ninstructions = "instructions.md"\ncontext = "context.md"\n`);
    writeFileSync(join(root, name, "instructions.md"), `${name} complete instructions.`);
    writeFileSync(join(root, name, "context.md"), `${name} local context.`);
  }
  const { store } = createWorkflowStore(cwd);
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "Prompt", type: "task", status: "in_progress", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-13", updatedOn: "2026-10-13", body: brief, metadata: {} });
  function patch(patch) {
    const { store: writer } = createWorkflowStore(cwd);
    writer.updateTask("fixture", "task-0001", patch);
    if (writer instanceof SQLiteWorkflowStore) writer.close();
  }
  let sequence = 0;
  function handoff(sender, recipient, status, message) {
    const { store: writer } = createWorkflowStore(cwd);
    writer.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: ++sequence, sender, recipient, status, message, createdAt: "2026-10-13", metadata: {} });
    if (writer instanceof SQLiteWorkflowStore) writer.close();
  }
  function git(args) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  }
  git(["init", "-q"]);
  git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-qm", "base"]);
  // Keep fixture workflow assets out of the implementation diff.
  writeFileSync(join(cwd, ".git", "info", "exclude"), ".agent-rig/\n");
  return { cwd, root, store, patch, handoff, git, close: () => { if (store instanceof SQLiteWorkflowStore) store.close(); } };
}

function snapshot(dir) {
  const result = {};
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const stat = statSync(file);
        result[file] = [stat.mtimeMs, stat.size, createHash("sha256").update(readFileSync(file)).digest("hex")];
      }
    }
  }
  walk(dir);
  return result;
}

// Inject historical invalid state directly. Normal store mutations reject it.
function injectTaskPatch(f, provider, patch) {
  const { store } = createWorkflowStore(f.cwd);
  const current = store.getTask("fixture", "task-0001");
  if (store instanceof SQLiteWorkflowStore) store.close();
  const next = { ...current, ...patch };
  if (provider === "markdown") {
    const dir = join(f.root, "_shared", "tasks");
    const file = readdirSync(dir).find((file) => file.startsWith("task-0001_"));
    writeFileSync(join(dir, file), serializeTask(next));
  } else {
    const db = new Database(join(f.root, "_shared", "workflow.sqlite"));
    try {
      db.transaction(() => {
        db.prepare("UPDATE tasks SET assigned_to = ?, status = ?, body_markdown = ? WHERE task_id = ?").run(next.assignedTo, next.status, next.body, next.id);
        db.prepare("DELETE FROM task_dependencies WHERE task_id = ?").run(next.id);
        for (const id of next.dependsOn) db.prepare("INSERT INTO task_dependencies VALUES (?, ?, ?)").run("fixture", next.id, id);
      })();
    } finally { db.close(); }
  }
}

function run(cwd, args = ["task-0001", "--agent", "worker"]) {
  return spawnSync(process.execPath, [cli, "tasks", "prompt", ...args], { cwd, encoding: "utf8", timeout: 10000 });
}

for (const provider of ["markdown", "sqlite"]) {
  test(`${provider}: configured role assets are complete and invalid assets fail without writes`, () => {
    const f = fixture(provider);
    f.close();
    mkdirSync(join(f.root, "worker", "guidance"));
    writeFileSync(join(f.root, "worker", "guidance", "instructions.md"), "Complete configured instructions.");
    writeFileSync(join(f.root, "worker", "guidance", "context.md"), "Complete configured context.");
    const config = '[agent]\nrole = "worker"\ntool = "codex"\ninstructions = "guidance/instructions.md"\ncontext = "guidance/context.md"\n';
    writeFileSync(join(f.root, "worker", "agent.toml"), config);
    const before = snapshot(f.cwd);
    const result = run(f.cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Complete configured instructions/);
    assert.match(result.stdout, /Complete configured context/);
    assert.doesNotMatch(result.stdout, /worker complete instructions|worker local context/);
    assert.deepEqual(snapshot(f.cwd), before);
    for (const [name, content, error] of [
      ["worker/agent.toml", config.replace('"guidance/instructions.md"', '"../reviewer/instructions.md"'), /must be inside/],
      ["worker/agent.toml", config.replace('"guidance/context.md"', "42"), /Invalid role asset/],
      ["worker/guidance/instructions.md", " \n", /input is empty/],
      ["_shared/context.md", " \n", /input is empty/]
    ]) {
      const file = join(f.root, name);
      const original = readFileSync(file);
      writeFileSync(file, content);
      const invalidBefore = snapshot(f.cwd);
      const rejected = run(f.cwd);
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stdout, "");
      assert.match(rejected.stderr, error);
      assert.deepEqual(snapshot(f.cwd), invalidBefore);
      writeFileSync(file, original);
    }
  });

  test(`${provider}: planner repair invalidates reviewer evidence until a new worker handoff`, () => {
    const f = fixture(provider);
    f.handoff("worker", "reviewer", "review", "Old worker evidence.");
    f.handoff("human", "planner", "changes_requested", "Human-only finding.");
    f.handoff("planner", "worker", "changes_requested", "Focused repair scope.");
    f.close();
    f.patch({ status: "review" });
    const before = snapshot(f.cwd);
    const rejected = run(f.cwd, ["task-0001", "--agent", "reviewer"]);
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout, "");
    assert.match(rejected.stderr, /new worker handoff/);
    assert.deepEqual(snapshot(f.cwd), before);
    f.patch({ status: "in_progress" });
    const worker = run(f.cwd);
    assert.equal(worker.status, 0, worker.stderr);
    assert.match(worker.stdout, /Old worker evidence/);
    assert.match(worker.stdout, /Focused repair scope/);
    assert.doesNotMatch(worker.stdout, /Human-only finding/);
    f.handoff("worker", "reviewer", "review", "Repaired worker evidence.");
    f.patch({ status: "review" });
    const reviewer = run(f.cwd, ["task-0001", "--agent", "reviewer"]);
    assert.equal(reviewer.status, 0, reviewer.stderr);
    assert.match(reviewer.stdout, /Repaired worker evidence/);
    assert.doesNotMatch(reviewer.stdout, /Old worker evidence|Focused repair scope|Human-only finding/);
  });

  test(`${provider}: worker CLI prompt is complete, deterministic and read-only`, () => {
    const f = fixture(provider);
    f.close();
    const before = snapshot(f.cwd);
    const result = run(f.cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /approximately \d+ tokens.*soft limit: 8000/);
    assert.equal(normalizeRepositoryRoot(result.stdout), normalizeRepositoryRoot(buildTaskPrompt(f.cwd, "worker", "task-0001").prompt));
    assert.deepEqual(snapshot(f.cwd), before);
    const headings = ["# AgentRig Task Prompt", "# Agent Instructions", "# Agent Context", "# Agent Configuration", "# Shared Context", "# Task Brief And Acceptance Criteria", "# Latest Relevant Handoffs", "# Scope And Required Checks", "# Local Skill And Tool Precedence", "# Forbidden Mutations", "# Required Handoff Output"];
    const positions = headings.map((heading) => result.stdout.indexOf(heading));
    assert.ok(positions.every((pos, i) => pos >= 0 && (i === 0 || pos > positions[i - 1])));
    assert.match(result.stdout, /worker complete instructions/);
    assert.match(result.stdout, /Repository root: /);
    assert.match(result.stdout, /Do not mutate tasks/);
    assert.doesNotMatch(result.stdout, /--permission-mode|--sandbox|--allowedTools|tasks set-status/);
  });

  test(`${provider}: reviewer requires fresh handoff and includes staged, unstaged, and untracked changes`, () => {
    const f = fixture(provider);
    f.close();
    f.patch({ status: "review" });
    assert.throws(() => buildTaskPrompt(f.cwd, "reviewer", "task-0001"), /requires a worker/);
    f.handoff("worker", "reviewer", "review", "Old worker evidence.");
    f.handoff("reviewer", "worker", "changes_requested", "Repair this.");
    assert.throws(() => buildTaskPrompt(f.cwd, "reviewer", "task-0001"), /new worker handoff/);
    f.handoff("worker", "reviewer", "review", "Latest worker evidence.");
    writeFileSync(join(f.cwd, "tracked.txt"), "staged content\n");
    f.git(["add", "tracked.txt"]);
    writeFileSync(join(f.cwd, "tracked.txt"), "unstaged content\n");
    writeFileSync(join(f.cwd, "untracked.txt"), "untracked content\n");
    f.close();
    const before = snapshot(f.cwd);
    const result = run(f.cwd, ["task-0001", "--agent", "reviewer"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Latest worker evidence/);
    assert.doesNotMatch(result.stdout, /Old worker evidence|Repair this/);
    const staged = result.stdout.split("## Staged Diff (git diff --cached)\n\n")[1].split("## Unstaged Diff (git diff)")[0];
    const unstaged = result.stdout.split("## Unstaged Diff (git diff)\n\n")[1].split("## Untracked File Contents")[0];
    assert.match(staged, /\+staged content/);
    assert.doesNotMatch(staged, /unstaged content/);
    assert.match(unstaged, /-staged content\n\+unstaged content/);
    assert.match(result.stdout, /unstaged content/);
    assert.match(result.stdout, /untracked content/);
    assert.match(result.stdout, /Do not edit implementation files or repository notes/);
    assert.deepEqual(snapshot(f.cwd), before);
  });

  test(`${provider}: reviewer preserves staged-only and opposing edits with untracked contents`, () => {
    const f = fixture(provider);
    f.close();
    f.patch({ status: "review" });
    f.handoff("worker", "reviewer", "review", "Worker evidence.");
    writeFileSync(join(f.cwd, "opposing.txt"), "base content\n");
    f.git(["add", "opposing.txt"]);
    f.git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "tracked base"]);
    writeFileSync(join(f.cwd, "opposing.txt"), "staged replacement\n");
    writeFileSync(join(f.cwd, "staged-only.txt"), "staged-only content\n");
    f.git(["add", "opposing.txt", "staged-only.txt"]);
    // Undo the staged edit in the working tree. A combined HEAD diff loses it.
    writeFileSync(join(f.cwd, "opposing.txt"), "base content\n");
    writeFileSync(join(f.cwd, "untracked.txt"), "untracked evidence\n");
    const before = snapshot(f.cwd);
    const result = run(f.cwd, ["task-0001", "--agent", "reviewer"]);
    assert.equal(result.status, 0, result.stderr);
    const staged = result.stdout.split("## Staged Diff (git diff --cached)\n\n")[1].split("## Unstaged Diff (git diff)")[0];
    const unstaged = result.stdout.split("## Unstaged Diff (git diff)\n\n")[1].split("## Untracked File Contents")[0];
    const untracked = result.stdout.split("## Untracked File Contents\n\n")[1];
    assert.match(staged, /-base content\n\+staged replacement/);
    assert.match(staged, /\+staged-only content/);
    assert.match(unstaged, /-staged replacement\n\+base content/);
    assert.doesNotMatch(unstaged, /staged-only content/);
    assert.match(untracked, /## Untracked file: untracked.txt\nuntracked evidence/);
    assert.deepEqual(snapshot(f.cwd), before);
  });

  test(`${provider}: worker repairs include only latest relevant route handoffs`, () => {
    const f = fixture(provider);
    f.handoff("worker", "reviewer", "review", "Old evidence.");
    f.handoff("worker", "reviewer", "review", "Latest evidence.");
    f.handoff("reviewer", "worker", "changes_requested", "Reviewer finding.");
    f.handoff("planner", "worker", "changes_requested", "Human repair scope.");
    f.close();
    const { prompt } = buildTaskPrompt(f.cwd, "worker", "task-0001");
    assert.doesNotMatch(prompt, /Old evidence/);
    for (const text of ["Latest evidence", "Reviewer finding", "Human repair scope"]) assert.ok(prompt.includes(text));
  });

  test(`${provider}: invalid reviewer evidence fails closed without writes`, () => {
    const f = fixture(provider);
    f.close();
    f.patch({ status: "review" });
    f.handoff("worker", "reviewer", "review", "Worker evidence.");
    for (const [content, error] of [["binary\0content", /binary untracked file/], ["x".repeat(33000), /8000-token soft limit/]]) {
      writeFileSync(join(f.cwd, "untracked.txt"), content);
      const before = snapshot(f.cwd);
      const result = run(f.cwd, ["task-0001", "--agent", "reviewer"]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, error);
      assert.deepEqual(snapshot(f.cwd), before);
    }
  });

  test(`${provider}: invalid inputs fail closed with no stdout or writes`, () => {
    const f = fixture(provider);
    const cases = [
      [{ assignedTo: "reviewer" }, /assigned to worker/],
      [{ assignedTo: "worker", status: "ready" }, /status in_progress/],
      [{ status: "in_progress", dependsOn: ["task-missing"] }, /dependencies/],
      [{ dependsOn: [], body: "Incomplete brief" }, /incomplete/],
      [{ body: brief + "\n" + "x".repeat(33000) }, /8000-token soft limit/]
    ];
    for (const [patch, error] of cases) {
      f.close();
      injectTaskPatch(f, provider, patch);
      const before = snapshot(f.cwd);
      const result = run(f.cwd);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, error);
      assert.deepEqual(snapshot(f.cwd), before);
    }
    const { store } = createWorkflowStore(f.cwd);
    store.updateTask("fixture", "task-0001", { body: brief });
    if (store instanceof SQLiteWorkflowStore) store.close();
    for (const args of [["task-0001"], ["task-0001", "--agent", "planner"], ["task-missing", "--agent", "worker"], ["task-0001", "--agent", "worker", "--claim"]]) {
      const result = run(f.cwd, args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
    }
    for (const asset of ["instructions.md", "context.md", "agent.toml"]) {
      const file = join(f.root, "worker", asset);
      const original = readFileSync(file);
      unlinkSync(file);
      assert.equal(run(f.cwd).status, 1);
      writeFileSync(file, original);
    }
    writeFileSync(join(f.root, "worker", "agent.toml"), 'role = "reviewer"\ntool = "custom"\n');
    assert.match(run(f.cwd).stderr, /must have role worker/);
  });
}

test("SQLite prompt does not create a missing database", () => {
  const f = fixture("sqlite");
  f.close();
  unlinkSync(join(f.root, "_shared", "workflow.sqlite"));
  const before = snapshot(f.cwd);
  const result = run(f.cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(snapshot(f.cwd), before);
});

test("SQLite live WAL fails closed without changing source files", () => {
  const f = fixture("sqlite");
  const before = snapshot(f.cwd);
  const result = run(f.cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /checkpointed SQLite database/);
  assert.deepEqual(snapshot(f.cwd), before);
  f.close();
});
