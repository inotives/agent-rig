// Tests for scripts/live-claude-smoke.mjs. They never start `claude`.
// Safety: every delete target is a fresh temporary directory that the test creates
// with mkdtempSync, or a path inside it. Functions that delete take the parent as a parameter.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as smoke from "../../scripts/live-claude-smoke.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const script = join(repo, "scripts", "live-claude-smoke.mjs");
const NAME = "run-20261010-101010-ab12";
const OTHER = "run-20261010-101011-cd34";

// Temporary directories that this test file created. Only these are deleted, by exact path.
const created = new Set();

function freshDir(prefix = "live-smoke-test-") {
  const dir = realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()), prefix)));
  created.add(dir);
  return dir;
}

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function makeChild(parent, name, markerName = name) {
  const dir = join(parent, name);
  mkdirSync(dir);
  writeFileSync(join(dir, smoke.MARKER_FILE), JSON.stringify({ kind: "agent-rig-live-smoke", name: markerName, claude_runs: 0, events: [] }));
  writeFileSync(join(dir, "keep.txt"), "x");
  return dir;
}

// ---- name pattern ----

test("name pattern accepts only generated names", () => {
  assert.ok(smoke.isValidName(NAME));
  assert.ok(smoke.isValidName(smoke.generateName(new Date(), () => 0.5)));
  for (const bad of ["", "run-1", "../" + NAME, "/" + NAME, NAME + "/", NAME + "x", "RUN-20261010-101010-ab12", "run-20261010-101010-AB12", "run-20261010-101010-ab1", "run-20261010-101010-ab12\n", ".", "..", undefined, 5]) {
    assert.equal(smoke.isValidName(bad), false, String(bad));
  }
});

test("generateName builds a name from the date and random characters", () => {
  const name = smoke.generateName(new Date(2026, 9, 10, 8, 5, 3), () => 0);
  assert.match(name, /^run-20261010-080503-[a-z0-9]{4}$/);
});

// ---- path helpers ----

test("hasEnoughComponents needs at least four components", () => {
  assert.equal(smoke.hasEnoughComponents("/"), false);
  assert.equal(smoke.hasEnoughComponents("/a/b/c"), false);
  assert.equal(smoke.hasEnoughComponents("/a/b/c/d"), true);
});

test("isDirectChild accepts only a direct child", () => {
  assert.equal(smoke.isDirectChild("/a/b/c/run", "/a/b/c"), true);
  assert.equal(smoke.isDirectChild("/a/b/c", "/a/b/c"), false);
  assert.equal(smoke.isDirectChild("/a/b/c/x/run", "/a/b/c"), false);
  assert.equal(smoke.isDirectChild("/a/b/c-evil/run", "/a/b/c"), false);
  assert.equal(smoke.isDirectChild("/a/b/run", "/a/b/c"), false);
});

// ---- removeWorkspace ----

test("removeWorkspace deletes exactly one child and nothing else", () => {
  const parent = freshDir();
  const one = makeChild(parent, NAME);
  const two = makeChild(parent, OTHER);
  writeFileSync(join(parent, "sibling.txt"), "x");
  const removed = smoke.removeWorkspace(NAME, parent);
  assert.equal(removed, one);
  assert.equal(existsSync(one), false);
  assert.ok(existsSync(join(two, "keep.txt")));
  assert.ok(existsSync(join(parent, "sibling.txt")));
  assert.ok(existsSync(parent));
});

test("removeWorkspace refuses a bad name", () => {
  const parent = freshDir();
  const child = makeChild(parent, NAME);
  for (const bad of ["", "run-1", "../x", NAME + "/..", "/" + NAME, "RUN-20261010-101010-ab12", ".", ".."]) {
    assert.throws(() => smoke.removeWorkspace(bad, parent), /name/i, String(bad));
  }
  assert.ok(existsSync(join(child, "keep.txt")));
  assert.ok(existsSync(parent));
});

test("removeWorkspace refuses a symbolic link and keeps the target", () => {
  const parent = freshDir();
  const target = freshDir("live-smoke-target-");
  writeFileSync(join(target, smoke.MARKER_FILE), JSON.stringify({ kind: "agent-rig-live-smoke", name: NAME }));
  writeFileSync(join(target, "keep.txt"), "x");
  symlinkSync(target, join(parent, NAME));
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /symbolic link/i);
  assert.ok(existsSync(join(target, "keep.txt")));
  assert.ok(lstatSync(join(parent, NAME)).isSymbolicLink());
});

test("removeWorkspace refuses a marker for another workspace", () => {
  const parent = freshDir();
  const child = makeChild(parent, NAME, OTHER);
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /marker/i);
  assert.ok(existsSync(join(child, "keep.txt")));
});

test("removeWorkspace refuses a missing marker and a bad marker", () => {
  const parent = freshDir();
  const child = join(parent, NAME);
  mkdirSync(child);
  writeFileSync(join(child, "keep.txt"), "x");
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /marker/i);
  writeFileSync(join(child, smoke.MARKER_FILE), "not json");
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /marker/i);
  rmSync(join(child, smoke.MARKER_FILE));
  mkdirSync(join(child, smoke.MARKER_FILE));
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /marker/i);
  assert.ok(existsSync(join(child, "keep.txt")));
});

test("removeWorkspace refuses a marker that is a symbolic link", () => {
  const parent = freshDir();
  const outside = freshDir("live-smoke-target-");
  writeFileSync(join(outside, "marker.json"), JSON.stringify({ kind: "agent-rig-live-smoke", name: NAME }));
  const child = join(parent, NAME);
  mkdirSync(child);
  symlinkSync(join(outside, "marker.json"), join(child, smoke.MARKER_FILE));
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /marker/i);
  assert.ok(existsSync(child));
});

test("removeWorkspace refuses when the child is a file, not a directory", () => {
  const parent = freshDir();
  writeFileSync(join(parent, NAME), "x");
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /directory/i);
  assert.ok(existsSync(join(parent, NAME)));
});

test("removeWorkspace refuses a missing child and the parent itself", () => {
  const root = freshDir();
  const parent = join(root, NAME);
  mkdirSync(parent);
  writeFileSync(join(parent, smoke.MARKER_FILE), JSON.stringify({ kind: "agent-rig-live-smoke", name: NAME }));
  writeFileSync(join(parent, "keep.txt"), "x");
  assert.throws(() => smoke.removeWorkspace(NAME, parent), /not found|exist/i);
  assert.ok(existsSync(join(parent, "keep.txt")));
  assert.throws(() => smoke.removeWorkspace(OTHER, root), /not found|exist/i);
  assert.ok(existsSync(parent));
});

test("removeWorkspace refuses a parent that is missing", () => {
  const root = freshDir();
  assert.throws(() => smoke.removeWorkspace(NAME, join(root, "missing")), /parent/i);
});

test("removeWorkspace follows a symbolic link in the parent path and keeps the child direct", () => {
  const root = freshDir();
  const real = join(root, "real");
  mkdirSync(real);
  const child = makeChild(real, NAME);
  symlinkSync(real, join(root, "alias"));
  assert.equal(smoke.removeWorkspace(NAME, join(root, "alias")), child);
  assert.equal(existsSync(child), false);
  assert.ok(existsSync(real));
});

// ---- parent and listing ----

test("ensureParent creates the parent with mode 0700 and refuses a link", () => {
  const root = freshDir();
  const parent = smoke.ensureParent(join(root, smoke.PARENT_NAME));
  assert.equal(parent, join(root, smoke.PARENT_NAME));
  assert.equal(lstatSync(parent).mode & 0o777, 0o700);
  assert.equal(smoke.ensureParent(parent), parent);
  const other = freshDir();
  symlinkSync(other, join(root, "linked"));
  assert.throws(() => smoke.ensureParent(join(root, "linked")), /symbolic link|directory/i);
});

test("fixedParent is the real temporary directory plus the fixed name", () => {
  assert.equal(smoke.fixedParent(), join(realpathSync.native(tmpdir()), "agent-rig-live-smoke"));
});

test("fixedParent resolves a symbolic link in TMPDIR to the real path", () => {
  const root = freshDir();
  const real = join(root, "real");
  mkdirSync(real);
  symlinkSync(real, join(root, "alias"));
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = join(root, "alias");
  try {
    assert.equal(smoke.fixedParent(), join(real, "agent-rig-live-smoke"));
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
});

test("newestWorkspace picks the newest valid child and ignores other entries", () => {
  const parent = freshDir();
  assert.equal(smoke.newestWorkspace(parent), undefined);
  makeChild(parent, NAME);
  makeChild(parent, OTHER);
  mkdirSync(join(parent, "not-a-run"));
  writeFileSync(join(parent, "run-20271010-101010-zzzz"), "file, not directory");
  assert.equal(smoke.newestWorkspace(parent), OTHER);
  assert.deepEqual(smoke.listWorkspaces(parent), [NAME, OTHER]);
});

// ---- arguments ----

test("parseArgs accepts the documented options and no path option", () => {
  const a = smoke.parseArgs(["report", "--workspace", NAME, "--dry-run", "--no-sandbox", "--max-claude-runs", "3"]);
  assert.deepEqual(a, { step: "report", workspace: NAME, dryRun: true, noSandbox: true, maxClaudeRuns: 3 });
  assert.deepEqual(smoke.parseArgs(["setup"]), { step: "setup", workspace: undefined, dryRun: false, noSandbox: false, maxClaudeRuns: undefined });
  for (const bad of [["setup", "--dir", "/tmp/x"], ["setup", "--path", "x"], ["cleanup", "--workspace", "../x"], ["cleanup", "--workspace", "/tmp/x"], ["cleanup", "--workspace"], ["nope"], [], ["run-happy", "--max-claude-runs", "0"], ["run-happy", "--max-claude-runs", "x"], ["setup", "extra"]]) {
    assert.throws(() => smoke.parseArgs(bad), Error, JSON.stringify(bad));
  }
});

test("cleanEnv removes the loop variables and keeps the rest", () => {
  const env = smoke.cleanEnv({ PATH: "/bin", AGENT_RIG_ROLE: "worker", AGENT_RIG_LOOP_REVIEW_TASK: "task-1", KEEP: "1" });
  assert.deepEqual(env, { PATH: "/bin", KEEP: "1" });
});

// ---- run limit ----

test("reserveClaudeRun counts runs and stops at the limit", () => {
  let marker = { claude_runs: 0 };
  marker = smoke.reserveClaudeRun(marker, 2);
  marker = smoke.reserveClaudeRun(marker, 2);
  assert.equal(marker.claude_runs, 2);
  assert.throws(() => smoke.reserveClaudeRun(marker, 2), /limit/i);
  assert.equal(marker.claude_runs, 2);
  assert.equal(smoke.reserveClaudeRun(marker, 3).claude_runs, 3);
});

test("assertRunsLeft refuses when the marker count has reached the limit", () => {
  assert.doesNotThrow(() => smoke.assertRunsLeft({ claude_runs: 5 }, 6));
  assert.throws(() => smoke.assertRunsLeft({ claude_runs: 6 }, 6), /limit/i);
  assert.throws(() => smoke.assertRunsLeft({ claude_runs: 7 }, 6), /limit/i);
});

test("effectiveMax uses the option, then the marker, then the default", () => {
  assert.equal(smoke.effectiveMax(2, { max_claude_runs: 4 }), 2);
  assert.equal(smoke.effectiveMax(undefined, { max_claude_runs: 4 }), 4);
  assert.equal(smoke.effectiveMax(undefined, {}), smoke.DEFAULT_MAX_CLAUDE_RUNS);
  assert.equal(smoke.DEFAULT_MAX_CLAUDE_RUNS, 6);
});

// ---- sandbox command ----

test("buildLoopCommand wraps the loop in the sandbox runner with explicit paths", () => {
  const ws = "/w/space/parent/" + NAME;
  const cmd = smoke.buildLoopCommand({ repo: "/r/e/p/o", workspace: ws, sandbox: true, extraPaths: ["/h/.claude", "/h/.claude.json"], nodePath: "/n/node" });
  assert.equal(cmd.command, "/r/e/p/o/.agent-rig/_shared/tools/sandbox-run.sh");
  assert.deepEqual(cmd.args, ["--allow-write", ws, "--allow-write", "/h/.claude", "--allow-write", "/h/.claude.json", "--", "/n/node", "/r/e/p/o/dist/index.js", "loop", "--once"]);
  assert.ok(!cmd.args.includes("--allow-tmp"));
  const plain = smoke.buildLoopCommand({ repo: "/r/e/p/o", workspace: ws, sandbox: false, extraPaths: [], nodePath: "/n/node" });
  assert.equal(plain.command, "/n/node");
  assert.deepEqual(plain.args, ["/r/e/p/o/dist/index.js", "loop", "--once"]);
});

test("claudeExtraPaths keeps only existing paths under the given home", () => {
  const home = freshDir("live-smoke-home-");
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude.json"), "{}");
  const paths = smoke.claudeExtraPaths(home);
  assert.ok(paths.includes(join(home, ".claude")));
  assert.ok(paths.includes(join(home, ".claude.json")));
  assert.ok(paths.every((p) => p.startsWith(home + "/")));
  assert.ok(!paths.includes(home));
  assert.ok(smoke.CLAUDE_EXTRA_WRITE_PATHS.length > 0);
  assert.ok(smoke.CLAUDE_EXTRA_WRITE_PATHS.every((p) => !p.startsWith("/") && !p.includes("..")));
});

// ---- contract checks ----

const hand = (sender, status, recipient = sender === "worker" ? "reviewer" : "planner") => ({ sender, recipient, status, message: "m" });
const task = (id, status, handoffs) => ({ id, status, handoffs });

test("checkWorkerNeverDone names the done problem", () => {
  const result = smoke.checkWorkerNeverDone([task("t1", "review", [hand("worker", "done")])]);
  assert.match(result.details.join("\n"), /set done/);
});

test("checkWorkerNeverDone", () => {
  assert.equal(smoke.checkWorkerNeverDone([task("t1", "review", [hand("worker", "review")])]).ok, true);
  assert.equal(smoke.checkWorkerNeverDone([task("t1", "review", [hand("worker", "done")])]).ok, false);
  assert.equal(smoke.checkWorkerNeverDone([task("t1", "review", [hand("worker", "approved")])]).ok, false);
  assert.equal(smoke.checkWorkerNeverDone([task("t1", "review", [hand("worker", "review"), hand("worker", "blocked")])]).ok, false);
});

test("checkReviewRounds passes for a clean cycle", () => {
  const ok = task("t1", "done", [hand("worker", "review"), hand("reviewer", "changes_requested", "worker"), hand("worker", "review"), hand("reviewer", "approved")]);
  assert.equal(smoke.checkReviewRounds([ok]).ok, true);
  const open = task("t1", "review", [hand("worker", "review")]);
  assert.equal(smoke.checkReviewRounds([open]).ok, true);
});

test("checkReviewRounds fails for two decisions, a done task without a final decision, or a reviewer first", () => {
  assert.equal(smoke.checkReviewRounds([task("t1", "review", [hand("worker", "review"), hand("reviewer", "approved"), hand("reviewer", "approved")])]).ok, false);
  assert.equal(smoke.checkReviewRounds([task("t1", "done", [hand("worker", "review")])]).ok, false);
  assert.equal(smoke.checkReviewRounds([task("t1", "done", [hand("worker", "review"), hand("reviewer", "changes_requested", "worker"), hand("worker", "review")])]).ok, false);
  assert.equal(smoke.checkReviewRounds([task("t1", "review", [hand("reviewer", "approved"), hand("worker", "review")])]).ok, false);
  assert.equal(smoke.checkReviewRounds([task("t1", "review", [hand("worker", "review"), hand("reviewer", "review")])]).ok, false);
});

test("checkReviewerUnchanged compares the hashes of each reviewer run", () => {
  const ev = (before, after) => ({ kind: "loop-tick", role: "reviewer", task: "t1", reviewer_before: before, reviewer_after: after });
  assert.equal(smoke.checkReviewerUnchanged([ev("a", "a")]).ok, true);
  assert.equal(smoke.checkReviewerUnchanged([ev("a", "b")]).ok, false);
  assert.equal(smoke.checkReviewerUnchanged([{ kind: "loop-tick", role: "worker", task: "t1" }]).ok, true);
  assert.equal(smoke.checkReviewerUnchanged([ev(undefined, "a")]).ok, false);
});

test("checkNoNestedLoop finds a loop command in the output and ignores a plain mention", () => {
  const clean = [{ source: "reviewer/runs/r1/last-message.md", text: "Reviewed. The loop will route the task. Status: approved." }];
  assert.equal(smoke.checkNoNestedLoop(clean).ok, true);
  for (const text of ["I ran agent-rig loop --once", "node /x/dist/index.js loop --once", '"/x/dist/index.js" loop', "/x/y/agent-rig/dist/index.js loop", "agent-rig  loop"]) {
    const result = smoke.checkNoNestedLoop([{ source: "s", text }]);
    assert.equal(result.ok, false, text);
    assert.match(result.details.join("\n"), /s/);
  }
});

test("fingerprint changes with deliverables and ignores .agent-rig and the marker", () => {
  const dir = freshDir();
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(git("init", "-q").status, 0);
  mkdirSync(join(dir, ".agent-rig"));
  writeFileSync(join(dir, ".gitignore"), ".agent-rig/\n");
  writeFileSync(join(dir, "a.txt"), "one\n");
  const base = smoke.fingerprint(dir);
  assert.equal(smoke.fingerprint(dir), base);
  writeFileSync(join(dir, ".agent-rig", "x.json"), "changed");
  writeFileSync(join(dir, smoke.MARKER_FILE), "changed");
  assert.equal(smoke.fingerprint(dir), base);
  writeFileSync(join(dir, "a.txt"), "two\n");
  const edited = smoke.fingerprint(dir);
  assert.notEqual(edited, base);
  writeFileSync(join(dir, "b.txt"), "new\n");
  assert.notEqual(smoke.fingerprint(dir), edited);
});

test("checkCanonicalStatuses", () => {
  assert.equal(smoke.checkCanonicalStatuses([task("t1", "review", [hand("worker", "review"), hand("reviewer", "approved")])]).ok, true);
  assert.equal(smoke.checkCanonicalStatuses([task("t1", "review", [hand("worker", "complete")])]).ok, false);
  assert.equal(smoke.checkCanonicalStatuses([task("t1", "finished", [])]).ok, false);
});

test("checkStateChanges needs a planner action for done and no loop tick that ends in done", () => {
  const planner = (id, action) => ({ kind: "planner-action", task: id, action });
  assert.equal(smoke.checkStateChanges([task("t1", "done", [])], [planner("t1", "done")]).ok, true);
  assert.equal(smoke.checkStateChanges([task("t1", "done", [])], []).ok, false);
  assert.equal(smoke.checkStateChanges([task("t1", "review", [])], [{ kind: "loop-tick", role: "worker", task: "t1", final_status: "done" }]).ok, false);
  const result = smoke.checkStateChanges([task("t1", "done", [])], [planner("t1", "ready"), planner("t1", "done")]);
  assert.match(result.details.join("\n"), /ready/);
});

const goodTasks = () => [task("task-0001", "done", [hand("worker", "review"), hand("reviewer", "approved")])];
const goodEvents = () => [{ kind: "planner-action", task: "task-0001", action: "done" }, { kind: "loop-tick", role: "reviewer", task: "task-0001", reviewer_before: "h", reviewer_after: "h", final_status: "review" }];
const goodRuns = () => [{ source: "worker/runs/r1/last-message.md", text: "done" }];

test("evaluateContract passes for good data", () => {
  const result = smoke.evaluateContract({ tasks: goodTasks(), events: goodEvents(), texts: goodRuns(), runFolders: 2 });
  assert.equal(result.ok, true, JSON.stringify(result.checks));
});

test("evaluateContract does not pass an empty workspace", () => {
  const result = smoke.evaluateContract({ tasks: [task("t1", "todo", []), task("t2", "todo", [])], events: [], texts: [], runFolders: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.name === "evidence").ok, false);
  assert.equal(smoke.evaluateContract({ tasks: [], events: [], texts: [], runFolders: 0 }).ok, false);
});

test("evaluateContract fails when one check fails", () => {
  const bad = smoke.evaluateContract({ tasks: goodTasks(), events: goodEvents(), texts: [{ source: "s", text: "agent-rig loop --once" }], runFolders: 2 });
  assert.equal(bad.ok, false);
  assert.equal(bad.checks.find((c) => c.name === "no nested loop").ok, false);
});

test("renderReport says tool calls are not visible and lists tasks and checks", () => {
  const evaluation = smoke.evaluateContract({ tasks: goodTasks(), events: goodEvents(), texts: goodRuns(), runFolders: 2 });
  const text = smoke.renderReport({ tasks: goodTasks(), events: goodEvents(), evaluation });
  assert.match(text, /task-0001/);
  assert.match(text, /tool calls are not visible/i);
  assert.match(text, /planner action/i);
  assert.match(text, /PASS/);
});

// ---- command line: dry run, setup, cleanup, limit (no Claude) ----

function fakeClaudeBin() {
  const bin = freshDir("live-smoke-bin-");
  const sentinel = join(bin, "claude-was-started");
  writeFileSync(join(bin, "claude"), `#!/bin/sh\ntouch "${sentinel}"\n`);
  chmodSync(join(bin, "claude"), 0o755);
  return { bin, sentinel };
}

function runCli(args, tmp, fake, extraEnv = {}) {
  const env = { ...process.env, TMPDIR: tmp, PATH: `${fake.bin}:${process.env.PATH}`, ...extraEnv };
  delete env.AGENT_RIG_ROLE;
  delete env.AGENT_RIG_LOOP_REVIEW_TASK;
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env, cwd: tmp });
}

test("--dry-run for every step starts no claude and prints the sandbox wrapper", () => {
  const tmp = freshDir();
  const fake = fakeClaudeBin();
  for (const step of ["setup", "run-happy", "run-repair", "report", "cleanup"]) {
    const result = runCli([step, "--dry-run"], tmp, fake);
    assert.equal(result.status, 0, `${step}: ${result.stderr}${result.stdout}`);
    assert.match(result.stdout, /dry run/i, step);
    assert.equal(existsSync(fake.sentinel), false, step);
  }
  for (const step of ["run-happy", "run-repair"]) {
    const result = runCli([step, "--dry-run"], tmp, fake);
    assert.match(result.stdout, /sandbox-run\.sh --allow-write \S*agent-rig-live-smoke\/\S+ /, step);
    assert.match(result.stdout, / -- \S+ \S+dist\/index\.js loop --once/, step);
    assert.ok(!result.stdout.includes("--allow-tmp"), step);
  }
  // A dry run creates nothing: not even the fixed parent folder.
  assert.deepEqual(readdirSync(tmp), []);
});

test("--no-sandbox --dry-run prints a warning and no runner", () => {
  const tmp = freshDir();
  const fake = fakeClaudeBin();
  const result = runCli(["run-happy", "--dry-run", "--no-sandbox"], tmp, fake);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout + result.stderr, /warning.*sandbox/i);
  assert.ok(!result.stdout.includes("sandbox-run.sh"));
  assert.match(result.stdout, /dist\/index\.js loop --once/);
  assert.equal(existsSync(fake.sentinel), false);
});

test("the script refuses a path option", () => {
  const tmp = freshDir();
  const fake = fakeClaudeBin();
  for (const args of [["setup", "--dir", tmp], ["cleanup", "--workspace", tmp], ["cleanup", "--workspace", "../x"]]) {
    const result = runCli(args, tmp, fake);
    assert.notEqual(result.status, 0, args.join(" "));
  }
  assert.deepEqual(readdirSync(tmp), []);
});

function openStore(dir) {
  return new Database(join(dir, ".agent-rig", "_shared", "workflow.sqlite"), { readonly: true, fileMustExist: true });
}

test("setup builds the workspace under the fixed parent, then cleanup deletes it", () => {
  const tmp = freshDir();
  const fake = fakeClaudeBin();
  const setup = runCli(["setup"], tmp, fake);
  assert.equal(setup.status, 0, setup.stderr + setup.stdout);
  const parent = join(tmp, "agent-rig-live-smoke");
  assert.equal(lstatSync(parent).mode & 0o777, 0o700);
  const names = readdirSync(parent);
  assert.equal(names.length, 1);
  assert.match(names[0], /^run-[0-9]{8}-[0-9]{6}-[a-z0-9]{4}$/);
  const dir = join(parent, names[0]);
  assert.deepEqual(readdirSync(tmp), ["agent-rig-live-smoke"]);

  const marker = JSON.parse(readFileSync(join(dir, smoke.MARKER_FILE), "utf8"));
  assert.equal(marker.name, names[0]);
  assert.equal(marker.claude_runs, 0);
  for (const agent of ["worker", "reviewer"]) {
    assert.match(readFileSync(join(dir, ".agent-rig", agent, "agent.toml"), "utf8"), /^tool = "claude"$/m, agent);
  }
  for (const role of ["planner", "worker", "reviewer"]) {
    assert.equal(readFileSync(join(dir, ".agent-rig", role, "instructions.md"), "utf8"), readFileSync(join(repo, ".agent-rig", role, "instructions.md"), "utf8"), role);
  }
  assert.equal(readFileSync(join(dir, ".agent-rig", "_shared", "context.md"), "utf8"), readFileSync(join(repo, ".agent-rig", "_shared", "context.md"), "utf8"));
  assert.ok(existsSync(join(dir, ".git")));
  assert.ok(existsSync(join(dir, "check-greeting.mjs")));
  assert.equal(existsSync(join(dir, "greeting.txt")), false);

  const db = openStore(dir);
  const rows = db.prepare("select task_id, status, assigned_to, title from tasks order by task_id").all();
  db.close();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.status), ["todo", "todo"]);
  assert.ok(rows.every((r) => r.assigned_to === "worker"));
  assert.match(rows[1].title, /repair/i);

  // report on a workspace with no evidence must fail
  const report = runCli(["report"], tmp, fake);
  assert.equal(report.status, 1, report.stdout + report.stderr);
  assert.match(report.stdout, /no evidence/i);

  // run limit across calls: the marker already holds six runs, so a run step refuses before any state change
  marker.claude_runs = 6;
  writeFileSync(join(dir, smoke.MARKER_FILE), JSON.stringify(marker));
  const limited = runCli(["run-happy"], tmp, fake);
  assert.notEqual(limited.status, 0);
  assert.match(limited.stderr + limited.stdout, /limit/i);
  assert.equal(existsSync(fake.sentinel), false);
  const db2 = openStore(dir);
  assert.equal(db2.prepare("select status from tasks where task_id = (select min(task_id) from tasks)").get().status, "todo");
  db2.close();

  const dry = runCli(["cleanup", "--dry-run"], tmp, fake);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(existsSync(dir));

  const cleanup = runCli(["cleanup", "--workspace", names[0]], tmp, fake);
  assert.equal(cleanup.status, 0, cleanup.stderr + cleanup.stdout);
  assert.equal(existsSync(dir), false);
  assert.ok(existsSync(parent));
  assert.equal(existsSync(fake.sentinel), false);
  assert.equal(basename(dir), names[0]);
});
