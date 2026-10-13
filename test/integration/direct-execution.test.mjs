// Deterministic Codex-style subprocess coverage. This never launches a live provider.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createWorkflowStore } from "../../dist/workflow/index.js";

const cli = resolve("dist/index.js");
const timeout = 10000;
const brief = ["Context", "Goal", "Scope", "Planner Notes", "Implementation Plan", "Acceptance Criteria"]
  .map((name) => `## ${name}\n\n${name === "Acceptance Criteria" ? "- [ ] " : ""}Check greeting.txt in the isolated project.`).join("\n\n");

// The provider fixture asserts the documented argv and stdin contract in a real
// process. It returns proposed Markdown; only the test's planner records it.
const providerSource = `
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
assert.deepEqual(args.slice(0, 3), ['exec', '--ephemeral', '--ignore-user-config']);
const normalizeMacOSTmpPath = value => value.replaceAll('/private/var/folders/', '/var/folders/');
const normalizeRepositoryRoot = value => value.replace(/^(# AgentRig Task Prompt\\n\\n(?:[^\\n]*\\n){4}Repository root: )([^\\n]*)/, (_, label, root) => label + normalizeMacOSTmpPath(root));
const cwd = args[4];
const output = args[9];
const expectedArgs = ['--cd', process.cwd(), '--sandbox', 'workspace-write', '--approve-for-me', '--output-last-message', output, '-'];
assert.deepEqual(args.slice(3).map((arg, index) => index === 1 ? normalizeMacOSTmpPath(arg) : arg), expectedArgs.map((arg, index) => index === 1 ? normalizeMacOSTmpPath(arg) : arg));
const prompt = readFileSync(0, 'utf8');
const role = prompt.match(/^Role: (worker|reviewer)$/m)?.[1];
assert.ok(role);
assert.ok(normalizeRepositoryRoot(prompt).includes('Repository root: ' + normalizeMacOSTmpPath(cwd)));
assert.ok(prompt.includes('The planner is the only workflow-state writer'));
writeFileSync(join(process.env.ATTEMPT_DIR, 'received.json'), JSON.stringify({ args, cwd, role, prompt }));
const mode = process.env.CHILD_MODE;
if (mode === 'hang') {
  writeFileSync(output, 'Partial handoff before timeout.');
  console.error('waiting for test timeout');
  setInterval(() => {}, 1000);
} else if (mode === 'fail') {
  writeFileSync(output, 'Partial handoff before failure.');
  console.error('fixture failure');
  process.exitCode = 23;
} else if (mode === 'missing') {
  console.log('zero exit without handoff');
} else if (mode === 'malformed') {
  writeFileSync(output, '**Decision:** done\\n**Recipient:** planner\\n');
} else {
  if (role === 'worker') writeFileSync(join(cwd, 'greeting.txt'), 'hello from worker\\n');
  else {
    assert.equal(readFileSync(join(cwd, 'greeting.txt'), 'utf8'), 'hello from worker\\n');
    assert.ok(prompt.includes('## Untracked file: greeting.txt\\nhello from worker'));
    assert.ok(prompt.includes('Worker subprocess evidence.'));
  }
  const decision = role === 'worker' ? 'review' : 'approved';
  const recipient = role === 'worker' ? 'reviewer' : 'planner';
  writeFileSync(output, '**Decision:** ' + decision + '\\n**Recipient:** ' + recipient + '\\n**Summary:** ' + (role === 'worker' ? 'Worker subprocess evidence.' : 'Reviewer subprocess evidence.') + '\\n**Findings:** None\\n**Evidence:** Checked greeting.txt in fixture.\\n**Requested action:** Planner records and routes this result.\\n');
  console.log(role + ' completed');
}
`;

function snapshot(root) {
  const files = {};
  function walk(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = join(prefix, entry.name);
      if (entry.isDirectory()) walk(join(dir, entry.name), name);
      else files[name] = readFileSync(join(dir, entry.name)).toString("base64");
    }
  }
  walk(root);
  return files;
}

function fixture(provider) {
  const parent = mkdtempSync(join(tmpdir(), "agent-rig-direct-"));
  const cwd = join(parent, "deployed project");
  const root = join(cwd, ".agent-rig");
  mkdirSync(join(root, "_shared"), { recursive: true });
  writeFileSync(join(root, "_shared", "agent-rig.json"), JSON.stringify({ project_identifier: "direct-fixture", workflow_store: { provider } }));
  writeFileSync(join(root, "_shared", "context.md"), "Isolated direct-execution test project.");
  for (const role of ["worker", "reviewer"]) {
    mkdirSync(join(root, role));
    writeFileSync(join(root, role, "agent.toml"), `role = "${role}"\ntool = "codex"\n`);
    writeFileSync(join(root, role, "instructions.md"), readFileSync(resolve(`templates/profiles/${role}.md`), "utf8").replaceAll("<agent>", role));
    writeFileSync(join(root, role, "context.md"), `Isolated ${role} context.`);
  }
  const providerFile = join(parent, "codex-fixture.mjs");
  writeFileSync(providerFile, providerSource);
  const env = { ...process.env, AGENT_RIG_ROLE: "planner", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  for (const args of [["init", "-q"], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "fixture base"]]) {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8", timeout });
    assert.equal(result.status, 0, result.stderr);
  }
  writeFileSync(join(cwd, ".git", "info", "exclude"), ".agent-rig/\n");
  const withStore = (fn) => {
    const { store } = createWorkflowStore(cwd);
    try { return fn(store); } finally { store.close?.(); }
  };
  withStore((store) => store.createTask({ projectIdentifier: "direct-fixture", id: "task-0001", title: "Isolated greeting", type: "task", status: "in_progress", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-13", updatedOn: "2026-10-13", body: brief, metadata: {} }));
  const planner = (...args) => {
    const result = spawnSync(process.execPath, [cli, "tasks", ...args], { cwd, env, encoding: "utf8", timeout });
    assert.equal(result.status, 0, result.stderr);
  };
  return { parent, cwd, root, providerFile, env, planner, withStore };
}

function cleanup(parent) {
  assert.ok(parent && basename(parent).startsWith("agent-rig-direct-"));
  assert.ok(realpathSync(parent).startsWith(realpathSync(tmpdir()) + sep));
  rmSync(parent, { recursive: true, force: true });
}

// Test-only launch, following docs/provider-execution.md. No workflow writes,
// retries, loops, or live provider discovery occur in this helper.
function attempt(f, role, mode = "success", childTimeout = timeout) {
  const dir = mkdtempSync(join(f.parent, `${role}-attempt-`));
  const prompt = spawnSync(process.execPath, [cli, "tasks", "prompt", "task-0001", "--agent", role], {
    cwd: f.cwd, env: f.env, encoding: "utf8", timeout
  });
  writeFileSync(join(dir, "prompt.md"), prompt.stdout ?? "");
  writeFileSync(join(dir, "prompt.stderr"), prompt.stderr ?? "");
  writeFileSync(join(dir, "prompt.exit-status"), String(prompt.status));
  if (prompt.error || prompt.status !== 0) return { dir, prompt, launched: false };
  const args = [f.providerFile, "exec", "--ephemeral", "--ignore-user-config", "--cd", f.cwd,
    "--sandbox", "workspace-write", "--approve-for-me", "--output-last-message", join(dir, "handoff.md"), "-"];
  const command = { command: process.execPath, args, cwd: f.cwd, role, task: "task-0001", timeout: childTimeout, startedAt: new Date().toISOString() };
  const child = spawnSync(process.execPath, args, {
    cwd: f.cwd, env: { ...f.env, AGENT_RIG_ROLE: role, ATTEMPT_DIR: dir, CHILD_MODE: mode },
    input: readFileSync(join(dir, "prompt.md")), encoding: "utf8", timeout: childTimeout, killSignal: "SIGKILL", maxBuffer: 1024 * 1024
  });
  writeFileSync(join(dir, "command.json"), JSON.stringify({ ...command, endedAt: new Date().toISOString() }));
  writeFileSync(join(dir, "child.stdout"), child.stdout ?? "");
  writeFileSync(join(dir, "child.stderr"), child.stderr ?? "");
  writeFileSync(join(dir, "child.exit-status"), JSON.stringify({ status: child.status, signal: child.signal, error: child.error?.code ?? null }));
  const file = join(dir, "handoff.md");
  const handoff = existsSync(file) ? readFileSync(file, "utf8") : "";
  const fields = ["Decision", "Recipient", "Summary", "Findings", "Evidence", "Requested action"];
  const valid = !child.error && child.status === 0 && fields.every((field) => handoff.includes(`**${field}:**`))
    && handoff.includes(`**Decision:** ${role === "worker" ? "review" : "approved"}\n`)
    && handoff.includes(`**Recipient:** ${role === "worker" ? "reviewer" : "planner"}\n`);
  return { dir, prompt, child, handoff, valid, launched: true };
}

for (const provider of ["markdown", "sqlite"]) {
  test(`${provider}: isolated Codex-style worker and independent reviewer leave state to planner`, { timeout: 30000 }, () => {
    const f = fixture(provider);
    try {
      const beforeWorker = snapshot(f.root);
      const worker = attempt(f, "worker");
      assert.equal(worker.valid, true, worker.child?.stderr ?? worker.prompt.stderr);
      assert.deepEqual(snapshot(f.root), beforeWorker);
      assert.equal(readFileSync(join(f.cwd, "greeting.txt"), "utf8"), "hello from worker\n");
      f.planner("handoff", "task-0001", "--sender", "worker", "--recipient", "reviewer", "--status", "review", "--message", worker.handoff);
      assert.equal(f.withStore((store) => store.getTask("direct-fixture", "task-0001").status), "in_progress");
      f.planner("set-status", "task-0001", "review");
      const beforeReviewer = snapshot(f.cwd);
      const reviewer = attempt(f, "reviewer");
      assert.equal(reviewer.valid, true, reviewer.child?.stderr ?? reviewer.prompt.stderr);
      assert.notEqual(worker.dir, reviewer.dir);
      assert.deepEqual(snapshot(f.cwd), beforeReviewer);
      for (const result of [worker, reviewer]) {
        const received = JSON.parse(readFileSync(join(result.dir, "received.json"), "utf8"));
        assert.equal(received.cwd, f.cwd);
        assert.equal(received.prompt, readFileSync(join(result.dir, "prompt.md"), "utf8"));
        assert.equal(received.args.at(-1), "-");
        assert.ok(!received.args.includes(received.prompt));
      }
      f.planner("handoff", "task-0001", "--sender", "reviewer", "--recipient", "planner", "--status", "approved", "--message", reviewer.handoff);
      assert.equal(f.withStore((store) => store.getTask("direct-fixture", "task-0001").status), "review");
      f.planner("done", "task-0001", "--message", "Independent fixture reviewer approved");
      assert.equal(f.withStore((store) => store.getTask("direct-fixture", "task-0001").status), "done");
    } finally { cleanup(f.parent); }
  });

  test(`${provider}: prompt failure prevents child execution and preserves diagnostic evidence`, { timeout: 30000 }, () => {
    const f = fixture(provider);
    try {
      f.planner("set-status", "task-0001", "review");
      const before = snapshot(f.cwd);
      const result = attempt(f, "reviewer");
      assert.equal(result.launched, false);
      assert.equal(result.prompt.status, 1);
      assert.match(readFileSync(join(result.dir, "prompt.stderr"), "utf8"), /requires a worker/);
      assert.equal(readFileSync(join(result.dir, "prompt.md"), "utf8"), "");
      assert.equal(existsSync(join(result.dir, "received.json")), false);
      assert.equal(existsSync(join(result.dir, "child.exit-status")), false);
      assert.deepEqual(snapshot(f.cwd), before);
    } finally { cleanup(f.parent); }
  });

  for (const role of ["worker", "reviewer"]) for (const mode of ["fail", "hang", "missing", "malformed"]) {
    test(`${provider}: ${role} ${mode} preserves eligible state without retry or completion`, { timeout: 30000 }, () => {
      const f = fixture(provider);
      try {
        if (role === "reviewer") {
          writeFileSync(join(f.cwd, "greeting.txt"), "hello from worker\n");
          f.planner("handoff", "task-0001", "--sender", "worker", "--recipient", "reviewer", "--status", "review", "--message", "Worker subprocess evidence.");
          f.planner("set-status", "task-0001", "review");
        }
        const before = snapshot(f.cwd);
        const handoffs = f.withStore((store) => store.listHandoffs("direct-fixture", "task-0001"));
        const result = attempt(f, role, mode, mode === "hang" ? 1500 : timeout);
        assert.equal(result.launched, true);
        assert.equal(result.valid, false);
        assert.deepEqual(snapshot(f.cwd), before);
        assert.equal(readdirSync(f.parent).filter((name) => name.startsWith(`${role}-attempt-`)).length, 1);
        assert.equal(f.withStore((store) => store.getTask("direct-fixture", "task-0001").status), role === "worker" ? "in_progress" : "review");
        assert.deepEqual(f.withStore((store) => store.listHandoffs("direct-fixture", "task-0001")), handoffs);
        const status = JSON.parse(readFileSync(join(result.dir, "child.exit-status"), "utf8"));
        if (mode === "hang") {
          assert.equal(status.error, "ETIMEDOUT");
          assert.equal(status.signal, "SIGKILL");
          assert.match(result.handoff, /Partial handoff before timeout/);
          assert.match(readFileSync(join(result.dir, "child.stderr"), "utf8"), /waiting for test timeout/);
        } else if (mode === "fail") {
          assert.equal(status.status, 23);
          assert.match(result.handoff, /Partial handoff before failure/);
          assert.match(readFileSync(join(result.dir, "child.stderr"), "utf8"), /fixture failure/);
        } else assert.equal(status.status, 0);
      } finally { cleanup(f.parent); }
    });
  }
}
