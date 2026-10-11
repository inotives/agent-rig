# Project Context

Project: @inotives/agent-rig
Type: Node.js project

README: ./README.md
# AgentRig Coordination Contract

The `planner` profile is the planner-manager. It works with the human, owns
the approved plan, selects tasks, manages dependencies, and controls task
state. The profile token and handoff recipient remain `planner`.

Task states are exactly:

- `ready`: eligible for worker selection.
- `in_progress`: the assigned worker is implementing or repairing the task.
- `review`: the worker handoff is ready for independent review.
- `blocked`: a real blocker prevents progress.
- `done`: the planner-manager accepted an approved review.

The worker implements the assigned task, verifies it, and writes a handoff with
decision `review`. The reviewer independently checks the worker handoff and
changed files. The reviewer writes exactly one handoff decision:
`approved`, `changes_requested`, or `blocked`. The reviewer sends the handoff
to the role that acts next:

- `approved`: to `planner`. The planner-manager marks the task `done`.
- `changes_requested`: to `worker`. The same worker repairs the task.
- `blocked`: to `planner`. The planner-manager resolves the blocker with the
  human.

The reviewer does not change task state or dependencies.

The planner-manager reads each reviewer decision and changes task state. For
`changes_requested`, the task stays in `review`. The same worker reads both
handoffs, repairs the task, and writes a new `review` handoff. Then an
independent reviewer reviews the task again. The planner-manager does not set
the task back to `in_progress`. For `approved`, the planner-manager marks the
task `done` and unblocks only the next selected dependent task. For `blocked`,
the planner-manager sets the task to `blocked` and resolves the blocker with
the human. The planner-manager directly performs the final
integrated review. If it finds a problem, it routes the `changes_requested`
repair through the same worker and independent reviewer cycle, then repeats the
integrated review. The planner-manager owns final phase acceptance.

Child agents do not start nested AgentRig loops. In SQLite mode, mutate tasks
and handoffs only through the project-local `agent-rig tasks ...` CLI. Migrated
task and handoff Markdown is historical reference only.

## Safe Operations

These rules are mandatory. A test run once deleted files outside the repository.

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
