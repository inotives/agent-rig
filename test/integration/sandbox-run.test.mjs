import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, accessSync, chmodSync, symlinkSync, readFileSync, constants } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../../templates/tools/sandbox-run.sh", import.meta.url));
const deployedRunner = fileURLToPath(new URL("../../.agent-rig/_shared/tools/sandbox-run.sh", import.meta.url));
const hasSandbox = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const skip = hasSandbox ? false : "sandbox-exec is not available";

// Every path below is inside this fresh temporary directory.
// HOME for every child process is the decoy home inside it. The real home is never used.
const base = realpathSync(mkdtempSync(join(tmpdir(), "agent-rig-sandbox-")));
const decoyHome = join(base, "home");
const work = join(base, "work");
const outside = join(base, "outside");
for (const dir of [decoyHome, work, outside]) mkdirSync(dir);
const decoyFiles = [join(decoyHome, "keep.txt")];
mkdirSync(join(decoyHome, "sub"));
decoyFiles.push(join(decoyHome, "sub", "deep.txt"));
for (const file of decoyFiles) writeFileSync(file, "decoy\n", "utf8");

after(() => {
  // Delete only the fresh temporary directory that this file created.
  assert.ok(basename(base).startsWith("agent-rig-sandbox-"));
  assert.ok(base.startsWith(realpathSync(tmpdir()) + "/"));
  rmSync(base, { recursive: true, force: true });
});

function run(args, env = {}) {
  return spawnSync("/bin/sh", [runner, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: decoyHome, ...env }
  });
}

function assertDecoySurvives() {
  for (const file of decoyFiles) assert.ok(existsSync(file), `decoy file was deleted: ${file}`);
}

function sentinelRefusal(extraArgs, label) {
  const sentinel = join(work, `sentinel-${label}`);
  const result = run(["--allow-write", work, ...extraArgs, "--", "/usr/bin/touch", sentinel]);
  assert.equal(result.status, 2, `${label}: ${result.stdout}${result.stderr}`);
  assert.equal(existsSync(sentinel), false, `${label}: the command ran`);
  return result;
}

test("runner is executable and shows help", () => {
  accessSync(runner, constants.X_OK);
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: sandbox-run\.sh/);
  assert.match(result.stdout, /--allow-write/);
  assert.match(result.stdout, /--allow-tmp/);
});

test("a write inside an allowed folder works", { skip }, () => {
  const target = join(work, "ok.txt");
  const result = run(["--allow-write", work, "--", "/usr/bin/touch", target]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(target));
});

test("a write to a path that is not allowed is denied", { skip }, () => {
  const target = join(outside, "nope.txt");
  const result = run(["--allow-write", work, "--", "/usr/bin/touch", target]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(target), false);
});

test("writes to /dev/null still work", { skip }, () => {
  const result = run(["--allow-write", work, "--", "/bin/sh", "-c", "echo x > /dev/null"]);
  assert.equal(result.status, 0, result.stderr);
});

test("rm -rf of the decoy home is denied and the files survive", { skip }, () => {
  const result = run(["--allow-write", work, "--", "/bin/rm", "-rf", decoyHome]);
  assert.notEqual(result.status, 0);
  assertDecoySurvives();
});

test("a recursive rmSync from a Node child is denied and the files survive", { skip }, () => {
  const script = 'require("node:fs").rmSync(process.env.HOME, { recursive: true, force: true });';
  const result = run(["--allow-write", work, "--", process.execPath, "-e", script]);
  assert.notEqual(result.status, 0);
  assertDecoySurvives();
});

test("--allow-tmp allows TMPDIR and nothing else", { skip }, () => {
  const tmpA = join(base, "tmpA");
  mkdirSync(tmpA);
  const inTmp = join(tmpA, "ok.txt");
  const notTmp = join(outside, "nope.txt");
  const result = run(["--allow-tmp", "--", "/bin/sh", "-c", `echo x > "$1"; echo y > "$2"`, "sh", inTmp, notTmp], { TMPDIR: tmpA });
  assert.notEqual(result.status, 0);
  assert.ok(existsSync(inTmp));
  assert.equal(existsSync(notTmp), false);
});

test("the runner refuses /", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-write", "/"], "root").stderr, /refused/);
});

test("the runner refuses the home directory", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-write", decoyHome], "home").stderr, /refused/);
});

test("the runner refuses a parent of the home directory", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-write", base], "parent").stderr, /refused/);
  assert.match(sentinelRefusal(["--allow-write", `${base}/work/../`], "parent-dotdot").stderr, /refused/);
});

test("the runner refuses a path that does not exist", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-write", join(work, "missing")], "missing").stderr, /does not exist/);
});

test("the runner refuses a path with a double quote", { skip }, () => {
  const quoted = join(work, 'a"b');
  mkdirSync(quoted);
  assert.match(sentinelRefusal(["--allow-write", quoted], "quote").stderr, /refused/);
});

test("the runner refuses a path with a backslash or a newline", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-write", `${work}\\x`], "backslash").stderr, /refused/);
  assert.match(sentinelRefusal(["--allow-write", `${work}\n${outside}`], "newline").stderr, /refused/);
});

test("the runner fails closed when sandbox-exec is missing", () => {
  const sentinel = join(work, "sentinel-closed");
  const result = run(["--allow-write", work, "--", "/usr/bin/touch", sentinel], { SANDBOX_EXEC: "no-such-sandbox-exec-command" });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /not found|not macOS/);
  assert.equal(existsSync(sentinel), false);
});

test("the exit status and the environment pass through", { skip }, () => {
  const status = run(["--", "/bin/sh", "-c", "exit 42"]);
  assert.equal(status.status, 42);
  const env = run(["--", "/bin/sh", "-c", 'printf "%s" "$SANDBOX_TEST_VALUE"'], { SANDBOX_TEST_VALUE: "passed" });
  assert.equal(env.status, 0);
  assert.equal(env.stdout, "passed");
});

test("the runner needs a command", () => {
  const result = run(["--allow-write", work]);
  assert.notEqual(result.status, 0);
  assert.equal(result.status, 2);
});

test("the deployed runner in this repository equals the template", () => {
  assert.equal(readFileSync(deployedRunner, "utf8"), readFileSync(runner, "utf8"));
  accessSync(deployedRunner, constants.X_OK);
});

test("the runner refuses repeated slashes, //., and a symlink to //", { skip }, () => {
  for (const [label, path] of [["slash2", "//"], ["slash3", "///"], ["slash2dot", "//."], ["slash-dot-slash", "//./"]]) {
    assert.match(sentinelRefusal(["--allow-write", path], label).stderr, /refused/);
  }
  const link = join(base, "link-to-root");
  symlinkSync("//", link);
  assert.match(sentinelRefusal(["--allow-write", link], "link-root").stderr, /refused/);
});

test("the runner refuses the home directory in other spellings", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-write", `${decoyHome}/`], "home-slash").stderr, /refused/);
  assert.match(sentinelRefusal(["--allow-write", `${decoyHome}//`], "home-slash2").stderr, /refused/);
  const link = join(base, "link-to-home");
  symlinkSync(decoyHome, link);
  assert.match(sentinelRefusal(["--allow-write", link], "link-home").stderr, /refused/);
  const upper = decoyHome.toUpperCase();
  if (existsSync(upper)) assert.match(sentinelRefusal(["--allow-write", upper], "home-case").stderr, /refused/);
});

test("the runner refuses the real home of the account when HOME is a decoy", { skip }, () => {
  // The path is only an argument. The runner refuses before it starts the command.
  const realHome = userInfo().homedir; // safe-ops: not a delete target
  assert.notEqual(realHome, decoyHome);
  assert.match(sentinelRefusal(["--allow-write", realHome], "real-home").stderr, /refused/);
  assert.match(sentinelRefusal(["--allow-write", `${realHome}/`], "real-home-slash").stderr, /refused/);
  assert.match(sentinelRefusal(["--allow-write", join(realHome, "..")], "real-home-parent").stderr, /refused/);
});

test("writes to /dev/stdout and /dev/stderr work, also when stdout is a file", { skip }, () => {
  const out = join(work, "stdout.txt");
  const direct = run(["--allow-write", work, "--", "/bin/sh", "-c", "echo a > /dev/stdout; echo b > /dev/stderr; echo c > /dev/fd/1"]);
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /a/);
  assert.match(direct.stderr, /b/);
  const redirected = run(["--allow-write", work, "--", "/bin/sh", "-c", `echo a > /dev/stdout; echo b > /dev/stderr; echo c > /dev/fd/2 ; echo d > ${JSON.stringify(out)}`]);
  assert.equal(redirected.status, 0, redirected.stderr);
  const toFile = run(["--allow-write", work, "--", "/bin/sh", "-c", "echo to-file > /dev/stdout"]);
  assert.equal(toFile.status, 0);
  const viaShell = spawnSync("/bin/sh", ["-c", `exec "$0" "$@" > "${join(work, "redir.txt")}"`, "/bin/sh", runner, "--allow-write", work, "--", "/bin/sh", "-c", "echo r > /dev/stdout"], { encoding: "utf8", env: { ...process.env, HOME: decoyHome } });
  assert.equal(viaShell.status, 0, viaShell.stderr);
  assert.equal(readFileSync(join(work, "redir.txt"), "utf8"), "r\n");
});

test("a write to a file outside the allowed folders is still denied next to /dev/stdout", { skip }, () => {
  const target = join(outside, "nope2.txt");
  const result = run(["--allow-write", work, "--", "/bin/sh", "-c", `echo a > /dev/stdout; echo x > "$1"`, "sh", target]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(target), false);
});

// Copy the runner into a fresh directory under base and replace helper paths in the COPY.
// The runner uses absolute helper paths, so a test cannot use PATH for a fake helper.
let copyCount = 0;
function makeCopy(replacements) {
  const dir = join(base, `copy-${copyCount++}`);
  mkdirSync(dir);
  let text = readFileSync(runner, "utf8");
  for (const [from, stubBody] of Object.entries(replacements)) {
    assert.ok(text.includes(from), `the runner has no ${from}`);
    const stub = join(dir, `stub-${basename(from)}`);
    writeFileSync(stub, `#!/bin/sh\n${stubBody}\n`, "utf8");
    chmodSync(stub, 0o755);
    text = text.split(from).join(stub);
  }
  const copy = join(dir, "sandbox-run.sh");
  writeFileSync(copy, text, "utf8");
  return copy;
}

function runCopy(copy, args, env = {}, dropHome = false) {
  const full = { ...process.env, HOME: decoyHome, ...env };
  if (dropHome) delete full.HOME;
  return spawnSync("/bin/sh", [copy, ...args], { encoding: "utf8", env: full });
}

function assertCopyRefuses(copy, label, env = {}, dropHome = false) {
  const sentinel = join(work, `sentinel-${label}`);
  const result = runCopy(copy, ["--allow-write", work, "--", "/usr/bin/touch", sentinel], env, dropHome);
  assert.equal(result.status, 2, `${label}: ${result.stdout}${result.stderr}`);
  assert.equal(existsSync(sentinel), false, `${label}: the command ran`);
}

test("the runner fails closed on a system that is not macOS", () => {
  const copy = makeCopy({ "/usr/bin/uname": "echo Linux" });
  const sentinel = join(work, "sentinel-linux");
  const result = runCopy(copy, ["--allow-write", work, "--", "/usr/bin/touch", sentinel]);
  assert.equal(result.status, 127);
  assert.match(result.stderr, /not macOS/);
  assert.equal(existsSync(sentinel), false);
});

test("the runner refuses when dscl prints nothing", { skip }, () => {
  assertCopyRefuses(makeCopy({ "/usr/bin/dscl": "exit 0" }), "dscl-empty");
});

test("the runner refuses when dscl exits with status 1", { skip }, () => {
  assertCopyRefuses(makeCopy({ "/usr/bin/dscl": "exit 1" }), "dscl-fail");
});

test("the runner refuses when HOME is not set", { skip }, () => {
  assertCopyRefuses(makeCopy({}), "home-unset", {}, true);
});

test("the runner refuses when HOME is empty", { skip }, () => {
  assertCopyRefuses(makeCopy({}), "home-empty", { HOME: "" });
});

test("a fake dscl first in PATH does not hide the real home", { skip }, () => {
  const fakeBin = join(base, "fakebin-dscl");
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, "dscl"), "#!/bin/sh\necho 'NFSHomeDirectory: /nonexistent'\n", "utf8");
  chmodSync(join(fakeBin, "dscl"), 0o755);
  // The real home is only an argument. HOME is the decoy. The runner must refuse before the command starts.
  const realHome = userInfo().homedir; // safe-ops: not a delete target
  const sentinel = join(work, "sentinel-fake-dscl");
  const result = run(["--allow-write", realHome, "--", "/usr/bin/touch", sentinel], { PATH: `${fakeBin}:${process.env.PATH}` });
  assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
  assert.equal(existsSync(sentinel), false);
});

test("a fake sandbox-exec first in PATH is not used", { skip }, () => {
  const fakeBin = join(base, "fakebin-sandbox");
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, "sandbox-exec"), '#!/bin/sh\nshift 2\nexec "$@"\n', "utf8");
  chmodSync(join(fakeBin, "sandbox-exec"), 0o755);
  const target = join(outside, "nope-fake-sandbox.txt");
  const result = run(["--allow-write", work, "--", "/usr/bin/touch", target], { PATH: `${fakeBin}:${process.env.PATH}` });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(target), false);
});

test("the runner refuses a home path in another Unicode spelling", { skip }, () => {
  const nfd = join(base, "caf\u0065\u0301-home");
  const nfc = join(base, "caf\u00e9-home");
  mkdirSync(nfd);
  if (!existsSync(nfc)) return; // this file system treats the two spellings as different names
  const sentinel = join(work, "sentinel-unicode");
  const result = run(["--allow-write", work, "--allow-write", nfc, "--", "/usr/bin/touch", sentinel], { HOME: nfd });
  assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
  assert.equal(existsSync(sentinel), false);
  const parent = run(["--allow-write", nfc.replace(/caf.*$/, ""), "--", "/usr/bin/touch", sentinel], { HOME: nfd });
  assert.equal(parent.status, 2);
});

test("--allow-tmp puts the real /private/tmp and TMPDIR in the profile", { skip }, () => {
  // A fake sandbox-exec prints the profile. Nothing is written to /private/tmp.
  const fake = join(base, "fake-sandbox-exec");
  writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$2"\n', "utf8");
  chmodSync(fake, 0o755);
  const result = run(["--allow-tmp", "--", "/usr/bin/true"], { SANDBOX_EXEC: fake, TMPDIR: outside });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('(subpath "/private/tmp")'), result.stdout);
  assert.ok(result.stdout.includes(`(subpath "${outside}")`), result.stdout);
  assert.ok(result.stdout.includes('(literal "/dev/stdout")'), result.stdout);
});

test("HOME inside TMPDIR with --allow-tmp is refused (documented pitfall)", { skip }, () => {
  assert.match(sentinelRefusal(["--allow-tmp"], "tmp-parent-of-home").stderr, /refused/);
});

test("a nested sandbox exits with status 71 and the command does not run", { skip }, () => {
  const sentinel = join(work, "sentinel-nested");
  // The inner runner asks for a different profile, so sandbox-exec cannot apply a second sandbox.
  const result = run(["--allow-write", work, "--", "/bin/sh", runner, "--allow-write", outside, "--", "/usr/bin/touch", sentinel]);
  assert.equal(result.status, 71, result.stderr);
  assert.equal(existsSync(sentinel), false);
});
