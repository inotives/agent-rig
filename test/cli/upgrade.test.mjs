import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { SQLiteWorkflowStore } from "../../dist/workflow/index.js";

const cli = new URL("../../dist/index.js", import.meta.url).pathname;
const template = (file) => readFileSync(new URL(`../../templates/${file}`, import.meta.url), "utf8");
function fixture(provider = "markdown") {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-upgrade-"));
  const root = join(cwd, ".agent-rig");
  const put = (file, text) => { mkdirSync(join(root, file, ".."), { recursive: true }); writeFileSync(join(root, file), text); };
  put("_shared/agent-rig.json", JSON.stringify({ workflow_store: { provider }, project_identifier: "fixture" }));
  put("_shared/context.md", "# Project Context\n\nKeep project details.\n\n## Safe Operations\n\nOld generated safety.\n\n## Local Notes\n\nKeep local notes.\n");
  put("_shared/workflow.md", "old workflow\n");
  for (const role of ["planner", "worker", "reviewer", "designer"]) {
    put(`${role}/agent.toml`, `role = "${role}"\ntool = "codex"\ninstructions = "instructions.md"\ncontext = "context.md"\n`);
    put(`${role}/instructions.md`, `old ${role}\n`);
    put(`${role}/context.md`, `local ${role} context\n`);
    put(`${role}/skills/local/SKILL.md`, "local skill\n");
    put(`${role}/tools/local.sh`, "local tool\n");
  }
  put("_shared/skills/local/SKILL.md", "shared skill\n");
  put("_shared/tools/local.sh", "shared tool\n");
  put("_shared/session.json", "{\"current_task_id\":\"task-0001\"}\n");
  put("_shared/handoff_logs/history.md", "historical handoff\n");
  put("_shared/profiles/worker.md", "local editable profile\n");
  mkdirSync(join(root, "_shared", "tasks"), { recursive: true });
  const task = { projectIdentifier: "fixture", id: "task-0001", title: "Retain task", type: "task", status: "ready", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "human", createdOn: "2026-10-13", updatedOn: "2026-10-13", body: "Keep task body\n", metadata: {} };
  if (provider === "sqlite") {
    const store = new SQLiteWorkflowStore(join(root, "_shared", "workflow.sqlite"), "fixture");
    store.createTask(task); store.close();
  } else put("_shared/tasks/task-0001.md", "---\nid: task-0001\ntitle: Retain task\ntype: task\nstatus: ready\nassigned_to: worker\npriority: normal\ncreated_by: human\ncreated_on: 2026-10-13\nupdated_on: 2026-10-13\ndepends_on: []\n---\nKeep task body\n");
  const run = (...args) => spawnSync(process.execPath, [cli, "upgrade", ...args], { cwd, encoding: "utf8", env: { ...process.env, PATH: join(cwd, "bin") } });
  return { cwd, root, put, run };
}
function snapshot(root, prefix = "") {
  const result = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, snapshot(root, path));
    else result[path] = readFileSync(join(root, path)).toString("base64");
  }
  return result;
}
for (const provider of ["markdown", "sqlite"]) {
  test(`${provider}: backup precedes refresh, preserves local state, repeats safely and launches no agent`, () => {
    const { cwd, root, run } = fixture(provider);
    try {
      mkdirSync(join(cwd, "bin"));
      for (const command of ["codex", "claude", "opencode", "agent-rig", "npx"]) {
        const file = join(cwd, "bin", command);
        writeFileSync(file, `#!/bin/sh\necho launched > '${join(cwd, "launched")}'\nexit 99\n`); chmodSync(file, 0o755);
      }
      const before = snapshot(root);
      const dry = run("--dry-run");
      assert.equal(dry.status, 0, dry.stderr);
      assert.deepEqual(snapshot(root), before);
      assert.deepEqual(readdirSync(cwd).filter((name) => name.startsWith(".agent-rig-backup-")), []);
      const upgraded = run();
      assert.equal(upgraded.status, 0, upgraded.stderr);
      const backup = upgraded.stdout.match(/^Backup complete: (.+)$/m)[1];
      assert.deepEqual(snapshot(backup), before);
      assert.match(upgraded.stdout, /Recovery:/);
      for (const role of ["planner", "worker", "reviewer"]) assert.equal(readFileSync(join(root, role, "instructions.md"), "utf8"), template(`profiles/${role}.md`).replaceAll("<agent>", role));
      const after = snapshot(root);
      const managed = new Set(["planner/instructions.md", "worker/instructions.md", "reviewer/instructions.md", "_shared/workflow.md", "_shared/context.md"]);
      for (const [path, content] of Object.entries(before)) if (!managed.has(path)) assert.equal(after[path], content, path);
      assert.equal(readFileSync(join(root, "_shared", "workflow.md"), "utf8"), template("workflow.md"));
      const context = readFileSync(join(root, "_shared", "context.md"), "utf8");
      assert.match(context, /Keep project details/); assert.match(context, /Keep local notes/);
      assert.match(context, /only task and handoff state writer/); assert.doesNotMatch(context, /Old generated safety/);
      const again = run(); assert.equal(again.status, 0, again.stderr); assert.match(again.stdout, /No files changed/);
      assert.deepEqual(snapshot(root), after);
      assert.equal(readdirSync(cwd).filter((name) => name.startsWith(".agent-rig-backup-")).length, 1);
      assert.equal(existsSync(join(cwd, "launched")), false);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}
test("invalid Markdown records are reported without repair or instruction changes", () => {
  const { cwd, root, put, run } = fixture();
  try {
    put("_shared/tasks/bad.md", "---\nid: broken\nstatus: nonsense\n---\nBad record\n");
    const before = snapshot(root); const result = run();
    assert.equal(result.status, 1); assert.match(result.stderr, /Invalid task state: .*bad.md/);
    assert.deepEqual(snapshot(root), before);
    assert.equal(readdirSync(cwd).some((name) => name.startsWith(".agent-rig-backup-")), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("invalid SQLite task status stops without silent repair", () => {
  const { cwd, root, run } = fixture("sqlite");
  try {
    const store = new SQLiteWorkflowStore(join(root, "_shared", "workflow.sqlite"), "fixture");
    const task = store.getTask("fixture", "task-0001");
    store.importTask({ ...task, id: "task-0002", status: "invalid" }, []); store.close();
    const before = snapshot(root); const result = run();
    assert.equal(result.status, 1); assert.match(result.stderr, /task-0002: Invalid status/);
    assert.deepEqual(snapshot(root), before);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("managed symlinks and active loop locks stop safely", () => {
  const { cwd, root, put, run } = fixture();
  try {
    put("_shared/loop.lock", "123\n"); assert.equal(run().status, 1);
    rmSync(join(root, "_shared", "loop.lock"));
    const outside = join(cwd, "outside.md"); writeFileSync(outside, "keep\n");
    rmSync(join(root, "worker", "instructions.md")); symlinkSync(outside, join(root, "worker", "instructions.md"));
    const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /symbolic link/);
    assert.equal(readFileSync(outside, "utf8"), "keep\n");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("missing dependencies and duplicate IDs stop without changes", () => {
  const { cwd, root, put, run } = fixture();
  try {
    const path = join(root, "_shared", "tasks", "task-0001.md");
    const original = readFileSync(path, "utf8");
    writeFileSync(path, original.replace("depends_on: []", "depends_on: [task-9999]"));
    let before = snapshot(root); let result = run();
    assert.equal(result.status, 1); assert.match(result.stderr, /Missing dependency: task-9999/);
    assert.deepEqual(snapshot(root), before);
    writeFileSync(path, original); put("_shared/tasks/duplicate.md", original);
    before = snapshot(root); result = run();
    assert.equal(result.status, 1); assert.match(result.stderr, /Duplicate task ID/);
    assert.deepEqual(snapshot(root), before);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("configured instruction paths and legacy shared contract update without losing notes", () => {
  const { cwd, root, put, run } = fixture();
  try {
    put("worker/agent.toml", '[agent]\nrole = "worker"\ntool = "codex"\ninstructions = "guidance/custom.md"\ncontext = "context.md"\n');
    put("worker/guidance/custom.md", "old configured instructions\n");
    put("_shared/context.md", "# Project Context\n\nKeep this.\n# AgentRig Coordination Contract\n\nOld contract.\n## Safe Operations\n\nOld safety.\n# Local Notes\n\nKeep notes.\n");
    const result = run(); assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(root, "worker", "guidance", "custom.md"), "utf8"), template("profiles/worker.md").replaceAll("<agent>", "worker"));
    assert.equal(readFileSync(join(root, "worker", "instructions.md"), "utf8"), "old worker\n");
    const context = readFileSync(join(root, "_shared", "context.md"), "utf8");
    assert.match(context, /Keep this/); assert.match(context, /Keep notes/); assert.doesNotMatch(context, /Old contract|Old safety/);
    const before = snapshot(root); assert.equal(run().status, 0); assert.deepEqual(snapshot(root), before);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("backup creation failure leaves managed files unchanged", () => {
  const { cwd, root, run } = fixture();
  try {
    const before = snapshot(root);
    chmodSync(cwd, 0o500);
    const result = run();
    assert.equal(result.status, 1); assert.match(result.stderr, /EACCES|EPERM/);
    assert.deepEqual(snapshot(root), before);
  } finally { chmodSync(cwd, 0o700); rmSync(cwd, { recursive: true, force: true }); }
});

for (const target of ["skills/local/SKILL.md", "tools/local.md", "configs/local.md", "profiles/worker.md", "assets/local.md", "agent.toml", "context.md", "notes/context.md", "README.md", ".config/local.md"]) {
  test(`protected instruction target ${target} stops before backup`, () => {
    const { cwd, root, put, run } = fixture();
    try {
      if (target !== "agent.toml") put(`worker/${target}`, "protected local content\n");
      put("worker/agent.toml", `role = "worker"\ninstructions = "${target}"\ncontext = "context.md"\n`);
      const before = snapshot(root);
      for (const args of [[], ["--dry-run"]]) {
        const result = run(...args);
        assert.equal(result.status, 1); assert.match(result.stderr, /protected local asset/);
        assert.deepEqual(snapshot(root), before);
        assert.equal(readdirSync(cwd).some((name) => name.startsWith(".agent-rig-backup-")), false);
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}
for (const target of ["worker/instructions.md", "_shared/workflow.md", "_shared/context.md"]) {
  test(`hard-linked managed file ${target} stops before backup`, () => {
    const { cwd, root, run } = fixture();
    try {
      const alias = join(cwd, "local-alias.md");
      linkSync(join(root, target), alias);
      const before = snapshot(root); const original = readFileSync(alias, "utf8");
      for (const args of [[], ["--dry-run"]]) {
        const result = run(...args);
        assert.equal(result.status, 1); assert.match(result.stderr, /multiple hard links/);
        assert.deepEqual(snapshot(root), before); assert.equal(readFileSync(alias, "utf8"), original);
        assert.equal(readdirSync(cwd).some((name) => name.startsWith(".agent-rig-backup-")), false);
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}
test("legacy context retains unknown nested sections", () => {
  const { cwd, root, put, run } = fixture();
  try {
    const notes = "## Local Notes\n\nKeep local details.\n### More Notes\n\nKeep nested details.\n";
    put("_shared/context.md", `# Project Context\nKeep project.\n# AgentRig Coordination Contract\nOld contract.\n${notes}## Safe Operations\nOld safety.\n### Local Safety Notes\nKeep local safety.\n`);
    const result = run(); assert.equal(result.status, 0, result.stderr);
    const context = readFileSync(join(root, "_shared/context.md"), "utf8");
    assert.ok(context.includes(notes)); assert.match(context, /### Local Safety Notes\nKeep local safety\./);
    assert.doesNotMatch(context, /Old contract|Old safety/);
    const before = snapshot(root); assert.equal(run().status, 0); assert.deepEqual(snapshot(root), before);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
for (const context of [
  "# AgentRig Coordination Contract\nFirst.\n# AgentRig Coordination Contract\nSecond.\n",
  "## Safe Operations\nFirst.\n## Safe Operations\nSecond.\n",
  "<!-- agent-rig:managed-context:start -->\nMissing end.\n",
  "<!-- agent-rig:managed-context:end -->\n<!-- agent-rig:managed-context:start -->\n",
  "Local text <!-- agent-rig:managed-context:start -->\nGenerated text.\n<!-- agent-rig:managed-context:end -->\n",
]) {
  test(`ambiguous context stops without changes: ${context.split("\n")[0]}`, () => {
    const { cwd, root, put, run } = fixture();
    try {
      put("_shared/context.md", context); const before = snapshot(root);
      for (const args of [[], ["--dry-run"]]) {
        const result = run(...args); assert.equal(result.status, 1); assert.match(result.stderr, /context (boundaries|markers)/);
        assert.deepEqual(snapshot(root), before);
        assert.equal(readdirSync(cwd).some((name) => name.startsWith(".agent-rig-backup-")), false);
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}
test("symlinked agent directory stops instead of being skipped", () => {
  const { cwd, root, run } = fixture();
  try {
    const agent = join(cwd, "linked-agent"); mkdirSync(agent);
    writeFileSync(join(agent, "agent.toml"), 'role = "worker"\ninstructions = "instructions.md"\n');
    writeFileSync(join(agent, "instructions.md"), "keep linked instructions\n");
    symlinkSync(agent, join(root, "linked-worker"));
    const before = snapshot(agent);
    for (const args of [[], ["--dry-run"]]) {
      const result = run(...args); assert.equal(result.status, 1); assert.match(result.stderr, /symbolic link in agent directory/);
      assert.deepEqual(snapshot(agent), before);
      assert.equal(readFileSync(join(root, "worker/instructions.md"), "utf8"), "old worker\n");
      assert.equal(readdirSync(cwd).some((name) => name.startsWith(".agent-rig-backup-")), false);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
