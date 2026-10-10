# Safe Operations

## Why these rules exist

A test run in Phase 27 deleted files outside the repository. A worker agent
wrote a test that called a cleanup function with the real home directory as the
target. Then it disabled the guard in a scratch copy of the script to prove the
test, and the delete ran for real. A recursive delete cannot be undone. Rules
that only people and agents must remember are not enough, so AgentRig adds a
technical guard: a sandbox runner.

## The rules

These rules are in the worker, reviewer, planner, and designer profiles and in
`.agent-rig/_shared/context.md`.

- Do not run a command, script, or test that deletes, moves, or overwrites files outside the repository and a temporary directory that you created.
- A test or script that deletes files takes its root directory as a parameter. Tests pass a new temporary directory as the root. Tests never use the home directory, `/`, or the current directory as the root.
- Before you delete a path that comes from a variable, check that the variable is not empty and that its real path is inside the directory that you created.
- Run mutation tests, fault-injection tests, generated scripts, and real agent processes through `.agent-rig/_shared/tools/sandbox-run.sh`, with `HOME` set to a temporary directory.
- A reviewer records `changes_requested` for a test or script that deletes outside a temporary root that it receives as a parameter.
- A planner names the sandbox runner in the brief of every task that deletes files, runs generated code, or starts a real agent.

Call the sandbox runner like this:

```sh
.agent-rig/_shared/tools/sandbox-run.sh --allow-write <directory> -- <command> [arguments]
```

- Give each directory that the command must write to its own `--allow-write <directory>`.
- The runner refuses the home directory and a directory that contains it. Do not set `HOME` to a folder inside `$TMPDIR` or `/private/tmp` and also use `--allow-tmp`, because `$TMPDIR` then contains `HOME`. Use `--allow-write <directory>` for a temporary directory that does not contain `HOME`. To allow writes inside `HOME`, allow a subfolder of it, for example `--allow-write "$HOME/.cache"`.
- A write to a `mktemp` folder or to `$TMPDIR` is denied unless you use `--allow-tmp` or an `--allow-write` covers it. The only error is "Operation not permitted".
- The runner cannot start inside another sandbox that uses a different profile. In that case it exits with status 71 and does not run the command.

A static test (`test/integration/safe-operations.test.mjs`) fails if a file in
`test/` or `scripts/` uses the word `homedir` (for example `homedir()`, `os.homedir`, or
`{ homedir: hd }`) on a line without the
comment `safe-ops: not a delete target`.

## The sandbox runner

The source file is `templates/tools/sandbox-run.sh`. `agent-rig init` copies it
to `.agent-rig/_shared/tools/sandbox-run.sh` with mode 0755. A test fails if the
copy in this repository differs from the template.

```sh
.agent-rig/_shared/tools/sandbox-run.sh [--allow-write <path>]... [--allow-tmp] -- <command> [args...]
```

The runner uses macOS `sandbox-exec`. The sandbox profile starts with
`(allow default)` and `(deny file-write*)`. Then it allows writes under each
allowed path. It always allows `/dev/null`, `/dev/tty`, `/dev/dtracehelper`, `/dev/stdout`,
`/dev/stderr`, and `/dev/fd/0`, `/dev/fd/1`, `/dev/fd/2`.
`--allow-tmp` allows the real paths of `$TMPDIR` and `/private/tmp`. The runner
passes the environment and the exit status of the command through.

The runner refuses these allowed paths and does not start the command:

- `/`, the home directory, and a parent of the home directory. The runner
  checks `$HOME` and also the real home directory of the account, which it reads
  from the user database (`dscl`), not from `$HOME`. It collapses repeated
  slashes (`//`), removes trailing slashes, resolves symbolic links, and ignores
  letter case before it compares;
- a path that does not exist;
- a path with a double quote, a newline, or a backslash.

The runner fails closed. If `sandbox-exec` is missing or the system is not
macOS, it prints an error, exits with status 127, and does not run the command.
The runner calls its helper commands (`dscl`, `id`, `sed`, `tr`, `head`,
`uname`, `dirname`, `basename`, `cat`) and `sandbox-exec` by absolute path. A
fake command in `PATH` has no effect. `SANDBOX_EXEC` replaces the sandbox
command. It is for TESTS ONLY and not for agents. An agent that sets
`SANDBOX_EXEC` turns the sandbox off.

The runner cannot run inside another sandbox. If the process that starts the
runner is already in a sandbox, `sandbox-exec` fails to apply a second,
different sandbox. It prints `sandbox_apply: Operation not permitted`, exits
with status 71, and the command does not run.

### Exit codes

| Status | Meaning |
| --- | --- |
| 2 | The runner refused a path, or the usage is wrong. The command did not start. |
| 127 | The runner cannot run: `sandbox-exec` is missing or the system is not macOS. The command did not start. |
| 71 | `sandbox-exec` itself failed, for example inside another sandbox. The command did not start. |
| other | The exit status of the command. |

### Pitfalls

- Each directory that the command must write to needs its own `--allow-write`.
- The runner refuses the home directory and a directory that contains it. If
  `HOME` is a folder inside `$TMPDIR` or `/private/tmp`, then `--allow-tmp` is
  refused, because `$TMPDIR` contains `HOME`. Do not combine them. Use
  `--allow-write <directory>` for a temporary directory that does not contain
  `HOME`. To allow writes inside `HOME`, allow a subfolder, for example
  `--allow-write "$HOME/.cache"`.
- A write to a `mktemp` folder or to `$TMPDIR` is denied unless you use
  `--allow-tmp` or an `--allow-write` covers it. The only error is
  `Operation not permitted`.

### Examples

Set `HOME` to a temporary directory first. Make it a different directory from
the work directory:

```sh
work=$(mktemp -d)
home=$(mktemp -d)
```

A mutation test:

```sh
HOME="$home" .agent-rig/_shared/tools/sandbox-run.sh \
  --allow-write "$work" -- node --test test/my-mutation.test.mjs
```

A generated script (it can write only inside `$work`):

```sh
HOME="$home" .agent-rig/_shared/tools/sandbox-run.sh \
  --allow-write "$work" -- sh "$work/generated.sh"
```

A real agent process. Do not add `--allow-tmp` here, because `$home` is inside
`$TMPDIR`. Allow the folders that the agent needs for its configuration and
cache as subfolders of `$home`:

```sh
mkdir "$home/.cache"
HOME="$home" .agent-rig/_shared/tools/sandbox-run.sh \
  --allow-write "$work" --allow-write "$home/.cache" -- agent-rig loop --once
```

## What the runner does not do

- It limits writes only. It does not hide reads. A command can still read your
  files and use the network.
- It needs macOS. On other systems it fails closed with status 127.
- It does not check what the command does inside the allowed paths. Keep the
  allowed paths small and keep them inside a temporary directory.
- It does not replace the rules above. Write safe code first.

## When a process needs more write paths

1. Run the process once and read the "Operation not permitted" error. It names
   the path.
2. Decide if the process really needs that path. Prefer a setting that moves the
   path into the temporary directory, for example `HOME` or `TMPDIR`.
3. If it needs the path, add one more `--allow-write <path>` for the smallest
   folder that works. The runner refuses `/`, the home directory, and its
   parents. Do not work around that refusal.
4. Ask the human before you allow a folder that holds real user data.
