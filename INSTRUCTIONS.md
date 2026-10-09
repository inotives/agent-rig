# AgentRig instructions

This file contains maintainer and agent operating instructions. The [README](README.md)
contains the user-facing installation and feature guide.

## Workspace rules

AgentRig stores project coordination in `.agent-rig/`:

```text
.agent-rig/
├── _shared/        # context, workflow store, profiles, notes, handoff logs
├── .creds/         # gitignored local secrets
├── <agent>/        # agent.toml, instructions.md, context, skills, tools, runs
└── human/          # human approval, unblock, and override helpers
```

Use `_shared/handoff_logs/` for session-end context such as the current branch,
active task, unresolved blockers, and the exact next step. Do not add a handoff
after every normal worker or reviewer task.

Use `_shared/notes/` for short findings worth carrying across sessions. Do not
use notes for routine progress logs.

Read the relevant phase plan under `docs/` and the target profile or skill
before changing code. Check `git status --short` and preserve unrelated changes.
Keep implementation small and do not add dependencies without a clear need.

## Task lifecycle

The planner and human must approve the phase plan before implementation tasks
are created. Create small tasks with explicit dependencies:

1. Set only dependency-free tasks to `ready`.
2. Keep downstream tasks `blocked`.
3. Assign each selected task to its worker.
4. Use the local CLI for all task and handoff mutations.
5. Do not edit the workflow SQLite database directly.

New task briefs require non-empty `Context`, `Goal`, `Scope`, `Planner Notes`,
and `Implementation Plan` sections, plus at least one checklist item under
`Acceptance Criteria`. `Notes` is optional.

```sh
agent-rig tasks create "Implement X" \
  --body-file docs/tasks/implement-x.md \
  --assigned-to worker --status ready --type task
agent-rig tasks next --agent worker
agent-rig tasks next --agent worker --claim
agent-rig tasks show task-0001
agent-rig status
```

## Workflow storage

Markdown is the default workflow store. SQLite is the live source of truth after
migration. Check the active provider in `.agent-rig/_shared/agent-rig.json`.

```sh
agent-rig workflow migrate --to sqlite
agent-rig workflow import --from markdown
agent-rig workflow backup [--output <path>]
agent-rig workflow rebuild --replace --confirm "REPLACE SQLITE"
```

Migration validates the new database before switching providers and marks the
original Markdown records as historical. Rebuild is a dry run unless explicitly
confirmed. It creates a timestamped backup and keeps SQLite records on same-ID
conflicts.

In SQLite mode, task completion requires a worker handoff followed by a
reviewer handoff. Use `agent-rig tasks handoff` for manual handoffs. Use
`--admin-override` only for exceptional human completion.

## Worker-reviewer loop

The planner and human first finalize the phase documents under `docs/`. After
approval, create dependency-gated tasks. For each selected task:

1. The manager starts the assigned worker.
2. The worker implements the task and leaves it in `review` or `blocked`.
3. The manager starts an independent reviewer.
4. The reviewer leaves the task in `done`, `ready`, or `blocked`.
5. Findings return to the same worker for focused fixes and re-review.
6. The manager unblocks the next selected dependent task only after clean review.
7. A final integrated reviewer checks the complete phase.

The normal lifecycle is:

```text
ready -> in_progress -> review -> done
                         \-> ready
                         \-> blocked
```

Run one deterministic tick with `agent-rig loop --once`. The continuous loop
uses `agent-rig loop`. `agent-rig watch --once` is the older filesystem-only
single-task adapter.

### Process boundary

Run the manager loop from a normal host terminal, outside any worker or reviewer
Codex session. Do not start `agent-rig loop` from inside a Codex task. The
manager launches the worker and reviewer as separate child processes.

Before starting the loop, verify the child runtime from the same terminal:

```sh
command -v agent-rig
command -v codex
codex --version
agent-rig status
```

The terminal must have the required Codex authentication and network access.
Do not assume permission granted to the parent session is available to a child
Codex process.

If a child process fails before changing the task or writing a handoff, treat it
as an infrastructure failure. Keep a worker task `ready` or a reviewer task
`review`, record the error, and retry from the host terminal. Mark a task
`blocked` only for a real task blocker or a stale task state after a successful
child run.

Do not use `--dangerously-bypass-approvals-and-sandbox` as a general fix. If the
host cannot start child Codex processes, use a separately managed runner or
perform the task manually while preserving the worker and reviewer handoffs.

OpenCode uses its configured default model. AgentRig does not pass `--model` or
`--auto`. Claude loop execution is unsupported. Live OpenCode smoke testing is
manual and is not part of CI.

## GitHub issue planning

GitHub planning is separate from normal local task work and requires an
authenticated GitHub CLI session.

```sh
agent-rig plan github-issue
agent-rig plan github-issue 123
agent-rig plan branch 123
agent-rig plan resume 123
agent-rig plan approve 123
agent-rig plan tasks 123
```

Issue discovery excludes pull requests and does not create tasks. Do not create
workflow tasks before the human approves the plan. The branch command requires a
clean worktree and GitHub push access. AgentRig prints a compare link and does
not create a pull request automatically.

## Development and release checks

Run the narrowest relevant checks, then run the full release checks when needed:

```sh
npm run build
npm test
npm --cache /tmp/agent-rig-npm-cache pack --dry-run
git diff --check
```

`npm run build` is required when changing UI source or packaging a release. It
runs TypeScript and the Tailwind/DaisyUI static-asset build.

Do not commit, push, publish, or create a pull request unless explicitly asked.
