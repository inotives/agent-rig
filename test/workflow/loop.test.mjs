import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claudeLoopArgs, handleLoopResult, runLoopAgent, selectLoopTask } from "../../dist/workflow/commands.js";
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

// A loop agent cannot set `blocked` itself (only the planner can). It records a
// `blocked` handoff to the planner instead. The loop then blocks the task with
// the reason from that handoff, not with the stale-task message.
for (const [role, status] of [["worker", "in_progress"], ["reviewer", "review"]]) {
  test(`a ${role} blocked handoff blocks the task with the handoff reason`, () => {
    const { cwd, database } = workspace();
    const store = new SQLiteWorkflowStore(database, "test-project");
    store.createTask(task(status));
    if (role === "reviewer") store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "worker", recipient: "reviewer", status: "review", message: "ready", createdAt: new Date().toISOString(), metadata: {} });
    const before = store.listHandoffs("test-project", "task-0001").length;
    store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: role, recipient: "planner", status: "blocked", message: "node check-hello.mjs was denied.\nMore detail.", createdAt: new Date().toISOString(), metadata: {} });
    store.close();
    const runDir = join(cwd, "run");
    mkdirSync(runDir);
    writeFileSync(join(runDir, "result.json"), "{}");

    handleLoopResult(cwd, { exitStatus: 0, stdout: "", stderr: "", error: "", failureSummary: "", runDir }, { name: role, role, tool: "claude" }, "task-0001", before);

    const check = new SQLiteWorkflowStore(database, "test-project");
    const saved = check.getTask("test-project", "task-0001");
    assert.equal(saved.status, "blocked");
    assert.equal(saved.metadata.blocked_reason, `${role} ${role} recorded a blocked handoff for task-0001: node check-hello.mjs was denied.`);
    assert.equal(check.listHandoffs("test-project", "task-0001").length, before + 1, "no second handoff");
    assert.match(JSON.parse(readFileSync(join(runDir, "result.json"), "utf8")).failure_summary, /recorded a blocked handoff/);
    check.close();
  });
}

test("a blocked handoff from before the run does not block the task", () => {
  const { cwd, database } = workspace();
  const store = new SQLiteWorkflowStore(database, "test-project");
  store.createTask(task("in_progress"));
  store.addHandoff({ projectIdentifier: "test-project", taskId: "task-0001", sender: "worker", recipient: "planner", status: "blocked", message: "old blocker", createdAt: new Date().toISOString(), metadata: {} });
  const before = store.listHandoffs("test-project", "task-0001").length;
  store.updateTask("test-project", "task-0001", { status: "review" });
  store.close();
  const runDir = join(cwd, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "result.json"), "{}");

  // The worker run sets review but records no new handoff; the old blocked handoff is the latest one.
  handleLoopResult(cwd, { exitStatus: 0, stdout: "", stderr: "", error: "", failureSummary: "", runDir }, { name: "worker", role: "worker", tool: "claude" }, "task-0001", before);

  const check = new SQLiteWorkflowStore(database, "test-project");
  const saved = check.getTask("test-project", "task-0001");
  assert.equal(saved.status, "review");
  assert.equal(saved.metadata.blocked_reason, undefined);
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

function claudeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-claude-args-"));
  const root = join(cwd, ".agent-rig");
  mkdirSync(join(root, "_shared"), { recursive: true });
  writeFileSync(join(root, "_shared", "agent-rig.json"), JSON.stringify({ project_identifier: "test-project", workflow_store: { provider: "sqlite" } }));
  writeFileSync(join(root, "_shared", "context.md"), "# Shared context\n");
  for (const [name, role] of [["worker", "worker"], ["reviewer", "reviewer"]]) {
    mkdirSync(join(root, name, "runs"), { recursive: true });
    writeFileSync(join(root, name, "agent.toml"), `role = "${role}"\ntool = "claude"\n`);
    writeFileSync(join(root, name, "instructions.md"), `# ${name} instructions\n`);
    writeFileSync(join(root, name, "context.md"), `# ${name} context\n`);
  }
  return { cwd, root, database: join(root, "_shared", "workflow.sqlite") };
}

function sharedTask(cwd, store, workflow) {
  return {
    id: workflow.id, status: workflow.status, type: workflow.type, phase: workflow.phase, title: workflow.title,
    assigned_to: workflow.assignedTo, priority: workflow.priority, depends_on: workflow.dependsOn,
    dependency_count: workflow.dependsOn.length, dependency_ready: workflow.dependencyReady, blocked_by: workflow.blockedBy,
    path: "", file: "", meta: workflow.metadata, body: workflow.body, record: {}, workflow, store,
    projectIdentifier: workflow.projectIdentifier, cwd
  };
}

// Run the Claude launcher with a fake `claude` in PATH. The fake records its
// arguments, stdin, and the AgentRig environment variables in `log`.
function runMockedClaude(role, status, stdout = "fake claude done\n", printer = `process.stdout.write(${JSON.stringify(stdout)});`) {
  const { cwd, root, database } = claudeWorkspace();
  const bin = mkdtempSync(join(tmpdir(), "agent-rig-claude-bin-"));
  const log = join(bin, "log");
  writeFileSync(join(bin, "claude"), `#!/usr/bin/env node
const fs = require("node:fs");
const stdin = fs.readFileSync(0, "utf8");
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), stdin, role: process.env.AGENT_RIG_ROLE ?? null, reviewTask: process.env.AGENT_RIG_LOOP_REVIEW_TASK ?? null }));
${printer}
`);
  chmodSync(join(bin, "claude"), 0o755);
  const store = new SQLiteWorkflowStore(database, "test-project");
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  try {
    store.createTask(task(status));
    const result = runLoopAgent(root, cwd, { name: role, role, tool: "claude" }, sharedTask(cwd, store, store.getTask("test-project", "task-0001")));
    assert.equal(result.exitStatus, 0, result.error || result.stderr);
    const record = JSON.parse(readFileSync(join(result.runDir, "result.json"), "utf8"));
    return { cwd, call: JSON.parse(readFileSync(log, "utf8")), record, runDir: result.runDir };
  } finally {
    process.env.PATH = previousPath;
    store.close();
  }
}

// Values of a variadic option: the arguments after the option up to the next option.
function optionValues(args, option) {
  const start = args.indexOf(option);
  assert.notEqual(start, -1, `${option} is missing`);
  const end = args.findIndex((arg, index) => index > start && arg.startsWith("--"));
  return args.slice(start + 1, end === -1 ? args.length : end);
}

const editTools = /^(Edit|Write|NotebookEdit|MultiEdit)(\(|$)/;

test("claude worker launch uses dontAsk mode, worker allow rules, and the prompt on stdin", () => {
  const { cwd, call, record } = runMockedClaude("worker", "in_progress");
  const args = call.args;
  assert.equal(args[0], "-p");
  assert.deepEqual(optionValues(args, "--permission-mode"), ["dontAsk"]);
  assert.ok(args.includes("--no-session-persistence"));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.deepEqual(optionValues(args, "--setting-sources"), ["project"]);
  assert.deepEqual(optionValues(args, "--add-dir"), [cwd]);
  const allowed = optionValues(args, "--allowedTools");
  assert.ok(allowed.includes("Edit(/**)"), "the worker can edit and write inside the project");
  assert.ok(allowed.includes("Read(/**)"));
  assert.ok(allowed.includes("Bash(agent-rig tasks:*)"));
  assert.ok(allowed.includes("Bash(node:*)"));
  assert.ok(allowed.includes("Bash(npm test:*)"));
  assert.ok(allowed.includes("Bash(git status:*)"));
  assert.equal(allowed.some((rule) => /^Bash(\(\*?\))?$/.test(rule)), false, "no unrestricted Bash rule");
  const denied = optionValues(args, "--disallowedTools");
  for (const rule of ["Bash(rm:*)", "Bash(rmdir:*)", "Bash(sudo:*)", "Bash(curl:*)", "Bash(wget:*)", "Bash(chmod:*)", "Bash(chown:*)", "Bash(mv:*)", "Bash(git push:*)", "Bash(git reset:*)", "Bash(git clean:*)", "Bash(git checkout:*)", "Bash(git branch -D:*)", "Bash(git commit:*)", "Bash(agent-rig loop:*)", "WebFetch", "WebSearch"]) {
    assert.ok(denied.includes(rule), `${rule} is denied`);
  }
  assert.equal(denied.some((rule) => editTools.test(rule)), false, "the worker may edit");
  assert.equal(args.includes("--dangerously-skip-permissions"), false);
  assert.equal(args.includes("--allow-dangerously-skip-permissions"), false);
  assert.equal(args.includes("bypassPermissions"), false);
  assert.match(call.stdin, /Agent: worker/);
  assert.match(call.stdin, /Task ID: task-0001/);
  assert.equal(args.some((arg) => arg.includes("Task ID:")), false, "the prompt is not an argument");
  assert.equal(call.role, "worker");
  assert.equal(call.reviewTask, null);
  assert.deepEqual(record.command_args, args);
});

test("claude reviewer launch has no edit or write tool and keeps the review environment", () => {
  const { call, record } = runMockedClaude("reviewer", "review");
  const args = call.args;
  assert.deepEqual(optionValues(args, "--permission-mode"), ["dontAsk"]);
  assert.ok(args.includes("--no-session-persistence"));
  assert.ok(args.includes("--add-dir"));
  const allowed = optionValues(args, "--allowedTools");
  assert.equal(allowed.some((rule) => editTools.test(rule)), false, `reviewer allow list: ${allowed.join(" ")}`);
  assert.ok(allowed.includes("Read(/**)"));
  assert.ok(allowed.includes("Bash(agent-rig tasks:*)"));
  const denied = optionValues(args, "--disallowedTools");
  for (const rule of ["Edit", "Write", "NotebookEdit", "Bash(rm:*)", "Bash(git push:*)"]) assert.ok(denied.includes(rule), `${rule} is denied`);
  assert.equal(args.includes("--dangerously-skip-permissions"), false);
  assert.equal(args.includes("bypassPermissions"), false);
  assert.match(call.stdin, /Agent: reviewer/);
  assert.equal(call.role, "reviewer");
  assert.equal(call.reviewTask, "task-0001");
  assert.deepEqual(record.command_args, args);
});

test("claude allow and deny rules match the AgentRig command form that the prompt prints", () => {
  const cli = `"/opt/node/bin/node" "/repo dir/dist/index.js"`;
  for (const role of ["worker", "reviewer"]) {
    const args = claudeLoopArgs(role, "/work/space", cli);
    const allowed = optionValues(args, "--allowedTools");
    const denied = optionValues(args, "--disallowedTools");
    assert.ok(allowed.includes(`Bash(${cli} tasks:*)`), allowed.join(" | "));
    assert.ok(allowed.includes("Bash(agent-rig tasks:*)"));
    assert.ok(denied.includes(`Bash(${cli} loop:*)`), denied.join(" | "));
    assert.ok(denied.includes("Bash(agent-rig loop:*)"));
    assert.ok(denied.includes("Bash(node *index.js loop*)"));
    assert.ok(denied.includes('Bash(node *index.js" loop*)'));
    assert.equal(allowed.some((rule) => /^(Glob|Grep)\(/.test(rule)), false, "Claude never uses a Glob or Grep path rule; Read(/**) covers them");
    for (const rule of [...allowed, ...denied]) {
      // Claude reads a `*` literally in a rule that also ends with `:*`.
      if (rule.endsWith(":*)")) assert.equal(rule.slice(0, -3).includes("*"), false, `${rule} mixes * with :*`);
    }
    assert.equal(args.filter((arg) => arg === "--allowedTools").length, 1);
    assert.equal(args.filter((arg) => arg === "--disallowedTools").length, 1);
    assert.deepEqual(optionValues(args, "--add-dir"), ["/work/space"]);
    assert.equal(args.some((arg) => arg.startsWith("-") && !arg.startsWith("--") && arg !== "-p"), false);
  }
  const plain = claudeLoopArgs("worker", "/work/space", "agent-rig");
  assert.equal(optionValues(plain, "--allowedTools").filter((rule) => rule === "Bash(agent-rig tasks:*)").length, 1);
});

test("claude launch keeps the stream-json events as tool-call evidence and uses the final result as the message", () => {
  const events = [
    { type: "system", subtype: "init", permissionMode: "dontAsk" },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "agent-rig loop --once" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "denied" }] } },
    { type: "result", subtype: "success", result: "Task ready for review.", permission_denials: [{ tool_name: "Bash" }] }
  ];
  const stream = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  const { call, record, runDir } = runMockedClaude("worker", "in_progress", stream);
  assert.deepEqual(optionValues(call.args, "--output-format"), ["stream-json"]);
  assert.ok(call.args.includes("--verbose"), "stream-json needs --verbose in print mode");
  assert.equal(readFileSync(join(runDir, "claude-stream.jsonl"), "utf8"), stream);
  assert.equal(readFileSync(join(runDir, "last-message.md"), "utf8"), "Task ready for review.\n");
  assert.equal(record.stdout, "Task ready for review.\n");
});

test("claude launch keeps plain output as the message when no result event exists", () => {
  const { record, runDir } = runMockedClaude("worker", "in_progress", "plain text\n{not json\n");
  assert.equal(readFileSync(join(runDir, "last-message.md"), "utf8"), "plain text\n{not json\n");
  assert.equal(record.stdout, "plain text\n{not json\n");
});

test("claude launch survives a stream larger than 1 MiB and extracts the final result", () => {
  // Node's spawnSync kills a child with ENOBUFS when stdout goes over maxBuffer (1 MiB by default).
  const printer = `const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(1000) }] } }) + "\\n";
for (let i = 0; i < 1600; i += 1) process.stdout.write(line);
process.stdout.write(JSON.stringify({ type: "result", result: "Large run done." }) + "\\n");`;
  const { record, runDir } = runMockedClaude("worker", "in_progress", "", printer);
  assert.equal(record.exit_status, 0);
  assert.equal(record.error, "");
  assert.equal(record.stdout, "Large run done.\n");
  assert.equal(readFileSync(join(runDir, "last-message.md"), "utf8"), "Large run done.\n");
  assert.ok(readFileSync(join(runDir, "claude-stream.jsonl"), "utf8").length > 1024 * 1024);
});

test("claude launch never puts raw JSON events in the message when no result event exists", () => {
  const stream = [{ type: "system", subtype: "init" }, { type: "assistant", message: { content: [] } }].map((event) => JSON.stringify(event)).join("\n") + "\n";
  const { record, runDir } = runMockedClaude("worker", "in_progress", stream);
  const text = readFileSync(join(runDir, "last-message.md"), "utf8");
  assert.equal(text, "Claude printed no result event. See claude-stream.jsonl in the run folder.\n");
  assert.equal(record.stdout, text);
  assert.doesNotMatch(text, /\{"type"/);
  assert.equal(readFileSync(join(runDir, "claude-stream.jsonl"), "utf8"), stream);
});

test("claude prompt tells the agent to run AgentRig as one literal command", () => {
  const { call } = runMockedClaude("worker", "in_progress");
  assert.match(call.stdin, /one literal command/);
  assert.match(call.stdin, /shell variable/);
  assert.match(call.stdin, /`Write` or `Edit` tool/);
});

test("claude prompt tells the agent to run each Bash command as one simple command", () => {
  const { call } = runMockedClaude("worker", "in_progress");
  // Live run (task-0107): `node check-hello.mjs; echo exit=$?` was denied although Bash(node:*) is allowed.
  assert.match(call.stdin, /one simple command/);
  assert.match(call.stdin, /`;`, `&&`, `\|\|`, a pipe, or a redirection/);
  assert.match(call.stdin, /`\$\?`/);
  assert.match(call.stdin, /run it again once in its simplest form/);
});

test("loop prompt states the task outcome that the CLI accepts for each role", () => {
  const worker = runMockedClaude("worker", "in_progress").call.stdin;
  const outcome = (text) => text.split("# Required Task Outcome\n")[1].split("\n")[0];
  // Live run (task-0107): the CLI refused `tasks block` from the worker ("Only the planner can set a task to blocked").
  assert.match(outcome(worker), /set the task to `review`/);
  assert.match(outcome(worker), /`blocked` handoff to `planner`/);
  assert.doesNotMatch(outcome(worker), /terminal state/);
  const reviewer = runMockedClaude("reviewer", "review").call.stdin;
  // The CLI refuses review -> ready for the reviewer; the loop routes changes_requested to the worker.
  assert.doesNotMatch(outcome(reviewer), /`ready`/);
  assert.match(outcome(reviewer), /exactly one decision/);
  assert.match(outcome(reviewer), /`approved` to `planner`, `changes_requested` to `worker`, or `blocked` to `planner`/);
  assert.match(outcome(reviewer), /Leave the task in `review`/);
});
