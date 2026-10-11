import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repo, "dist", "index.js");
const MARKER = "safe-ops: not a delete target";

const RULE_PHRASES = [
  "Do not run a command, script, or test that deletes, moves, or overwrites files outside the repository and a temporary directory that you created.",
  "Tests never use the home directory, `/`, or the current directory as the root.",
  "check that the variable is not empty and that its real path is inside the directory that you created",
  "through `.agent-rig/_shared/tools/sandbox-run.sh`, with `HOME` set to a temporary directory",
  "A reviewer records `changes_requested` for a test or script that deletes outside a temporary root that it receives as a parameter.",
  "A planner names the sandbox runner in the brief of every task that deletes files, runs generated code, or starts a real agent.",
  ".agent-rig/_shared/tools/sandbox-run.sh --allow-write <directory> -- <command> [arguments]",
  "Give each directory that the command must write to its own `--allow-write <directory>`.",
  "Do not set `HOME` to a folder inside `$TMPDIR` or `/private/tmp` and also use `--allow-tmp`",
  "Use `--allow-write <directory>` for a temporary directory that does not contain `HOME`.",
  "denied unless you use `--allow-tmp` or an `--allow-write` covers it",
  "The runner cannot start inside another sandbox that uses a different profile. In that case it exits with status 71 and does not run the command."
];

function unmarkedLines(text) {
  const lines = [];
  text.split("\n").forEach((line, index) => {
    if (/\bhomedir\b/.test(line) && !line.includes(MARKER)) lines.push(index + 1);
  });
  return lines;
}

function sourceFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(mjs|js|cjs|ts|sh)$/.test(name)) files.push(path);
  }
  return files;
}

test("every homedir() use in test/ and scripts/ is marked", () => {
  const self = fileURLToPath(import.meta.url);
  const unmarked = [];
  for (const dir of ["test", "scripts"]) {
    const root = join(repo, dir);
    if (!existsSync(root)) continue;
    for (const file of sourceFiles(root)) {
      if (file === self) continue;
      for (const line of unmarkedLines(readFileSync(file, "utf8"))) unmarked.push(`${relative(repo, file)}:${line}`);
    }
  }
  assert.deepEqual(unmarked, []);
});

test("the homedir check catches aliased and destructured uses", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "agent-rig-safeops-scan-")));
  try {
    const file = join(dir, "sample.mjs");
    writeFileSync(file, [
      'import { homedir as hd } from "node:os";',
      "const { homedir } = os;",
      "const a = os.homedir();",
      "const b = hd();",
      "const c = userInfo().homedir;",
      `const d = os.homedir(); // ${MARKER}`,
      "const e = 1;"
    ].join("\n"), "utf8");
    assert.deepEqual(unmarkedLines(readFileSync(file, "utf8")), [1, 2, 3, 5]);
  } finally {
    // Delete only the fresh temporary directory that this test created.
    assert.ok(basename(dir).startsWith("agent-rig-safeops-scan-"));
    assert.ok(dir.startsWith(realpathSync(tmpdir()) + "/"));
    rmSync(dir, { recursive: true, force: true });
  }
});

function assertRules(text, label) {
  for (const phrase of RULE_PHRASES) assert.ok(text.includes(phrase), `${label} is missing: ${phrase}`);
}

test("generated instructions and shared context contain the safe-operations rules", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-safeops-"));
  const env = { ...process.env, AGENT_RIG_SKIP_SKILLS: "1" };
  assert.equal(spawnSync(process.execPath, [cli, "init", "--yes"], { cwd, encoding: "utf8", env }).status, 0);
  for (const role of ["reviewer", "planner", "designer"]) {
    const added = spawnSync(process.execPath, [cli, "add", role, "--role", role, "--tool", "codex"], { cwd, encoding: "utf8", env });
    assert.equal(added.status, 0, added.stderr);
  }
  for (const agent of ["worker", "reviewer", "planner", "designer"]) {
    assertRules(readFileSync(join(cwd, ".agent-rig", agent, "instructions.md"), "utf8"), `${agent} instructions`);
  }
  assertRules(readFileSync(join(cwd, ".agent-rig", "_shared", "context.md"), "utf8"), "shared context");
});

test("this repository's deployed instructions and shared context contain the rules", () => {
  for (const agent of ["worker", "reviewer", "planner", "designer"]) {
    assertRules(readFileSync(join(repo, ".agent-rig", agent, "instructions.md"), "utf8"), `deployed ${agent} instructions`);
    assertRules(readFileSync(join(repo, ".agent-rig", "_shared", "profiles", `${agent}.md`), "utf8"), `deployed ${agent} profile`);
  }
  assertRules(readFileSync(join(repo, ".agent-rig", "_shared", "context.md"), "utf8"), "deployed shared context");
});

test("the check fails when the rules are removed from a copy of a deployed profile", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "agent-rig-safeops-profile-")));
  try {
    const original = readFileSync(join(repo, ".agent-rig", "_shared", "profiles", "worker.md"), "utf8");
    const file = join(dir, "worker.md");
    writeFileSync(file, original, "utf8");
    assertRules(readFileSync(file, "utf8"), "copy");
    const start = original.indexOf("sandbox-run.sh");
    assert.ok(start > 0);
    writeFileSync(file, original.split("\n").filter((line) => !line.includes("sandbox-run.sh")).join("\n"), "utf8");
    assert.throws(() => assertRules(readFileSync(file, "utf8"), "copy"), /is missing/);
  } finally {
    // Delete only the fresh temporary directory that this test created.
    assert.ok(basename(dir).startsWith("agent-rig-safeops-profile-"));
    assert.ok(dir.startsWith(realpathSync(tmpdir()) + "/"));
    rmSync(dir, { recursive: true, force: true });
  }
});
