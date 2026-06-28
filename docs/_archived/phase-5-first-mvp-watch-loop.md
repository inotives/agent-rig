# Phase 5: First MVP Watch Loop

## Goal

Deliver the first end-to-end MVP: a watch loop that turns filesystem queue changes into prompt/run records, blockers, and handoff logs.

Decision record: [ADR 0001: Filesystem-Only Watch Loop](../adr/0001-filesystem-only-watch-loop.md)

## Scope

- `agent-rig watch`
- `agent-rig task add --agent <name> --title <title> --body <body>`
- File watcher for task queues and state transitions
- Prompt assembly from shared instructions, agent instructions, and task context
- Filesystem-only run adapter boundary
- Handoff log writing
- Basic blocker notification path
- MVP integration test using a fake tool adapter

## Out of Scope

- Real Slack/GitHub driver hardening beyond the spec's minimal notification path
- Distributed locking
- Multi-machine coordination
- Rich UI

## Acceptance Criteria

- `agent-rig watch` detects ready work from the filesystem.
- The daemon assembles prompts in the documented order.
- A fake filesystem adapter can complete a task and write a handoff log.
- Failure writes a visible blocker or error state.
- The full MVP flow works from `init --yes` through validate, watch, task completion, and status.
- `agent-rig status` queue summaries count `ready`, `running`, `blocked`, and `done` tasks separately.

## Queue Lifecycle

- MVP queues are lightweight indexes. Agent-local queue item shape:

```json
{
  "id": "task-2026-06-28-103012",
  "status": "ready",
  "title": "Implement X",
  "task_file": "tasks/task-2026-06-28-103012.md",
  "simulate": "done"
}
```

- Shared queue items add `agent`:

```json
{
  "id": "task-2026-06-28-103012",
  "agent": "worker",
  "status": "ready",
  "title": "Implement X",
  "task_file": "../worker/tasks/task-2026-06-28-103012.md"
}
```

- Task detail lives in Markdown with YAML frontmatter:

```md
---
id: task-2026-06-28-103012
title: Implement X
status: ready
agent: worker
created_at: 2026-06-28T10:30:12+08:00
run_id:
started_at:
finished_at:
message:
---

# Implement X

## Objective

What needs to be achieved.

## Context

Relevant background, constraints, links, or files.

## Acceptance Criteria

- Observable outcome 1
- Observable outcome 2

## Notes

Extra details, edge cases, or human guidance.
```

- `agent-rig task add --agent <name> --title <title> (--body <body>|--body-file <path>)` creates `.agent-rig/<agent>/tasks/<task_id>.md` and appends the queue item to `.agent-rig/<agent>/queue.json`.
- `task add` requires exactly one of `--body` or `--body-file`.
- `task add` writes the body text under `## Objective` by default and leaves the other sections as placeholders.
- `task add` writes agent-local tasks only in Phase 5; no `--shared`, list, update, or delete command yet.
- Phase 5 keeps task creation as core AgentRig CLI behavior, not a shared skill.
- A later planner flow can break a human request into smaller tasks and enqueue them for worker agents through AgentRig's task creation path.
- `agent` is required for tasks in `.agent-rig/_shared/task_queue.json`.
- `agent` is optional for tasks in `.agent-rig/<agent>/queue.json` because the folder already selects the agent.
- `agent-rig watch` reads both `.agent-rig/_shared/task_queue.json` and `.agent-rig/<agent>/queue.json`.
- Shared queue tasks are routed by their `agent` field.
- Agent-local queue tasks belong to that folder's agent.
- MVP task states: `ready`, `running`, `done`, `blocked`.
- Valid transitions: `ready -> running -> done` or `ready -> running -> blocked`.
- Failures become `blocked` with a visible message.
- Completed and blocked tasks stay in the queue and are mutated in place.
- Runtime fields added by `watch` to queue items and task frontmatter: `run_id`, `started_at`, `finished_at`, `status`, and `message`.
- `watch` keeps queue item status and task Markdown frontmatter status in sync.
- No retry state, priority, dependencies, due dates, labels, or cancellation in MVP.
- `simulate` is optional and used only by the fake filesystem adapter in tests and demos.
- If `simulate` is `"blocked"`, the fake adapter writes a blocked result.
- Otherwise, the fake adapter writes a done result.

## Status Counts

- Phase 5 updates `agent-rig status` queue summaries to count tasks by state.
- `pending` counts only tasks with `status === "ready"`.
- Status also reports `running`, `blocked`, and `done` counts.
- Missing or invalid queue files still report `error`.

## Session Updates

- Before processing a task, `watch` sets the agent status to `running` and updates `last_seen_at`.
- After a done task, `watch` sets the agent status to `idle` and updates `last_seen_at`.
- After a blocked task or processing error, `watch` sets the agent status to `blocked` and updates `last_seen_at`.

## Validation

- `agent-rig validate` lightly validates queue task objects.
- Queue files must be JSON arrays.
- Each queue item must have string `id`, `status`, `title`, and `task_file`.
- Referenced task Markdown files must exist and have matching frontmatter `id`, `title`, `status`, and `agent`.
- Validation fails if queue item status and task Markdown frontmatter status drift.
- Shared queue tasks must have a valid `agent`.
- `status` must be one of `ready`, `running`, `done`, or `blocked`.
- Unknown extra fields warn but do not fail validation.
- Phase 5 does not validate runtime timestamps, run record existence, or handoff log consistency.

## Run Records

- `run_id` format is `<YYYY-MM-DD-hhmmss>_<task_id>`, for example `2026-06-27-151422_task-1`.
- If a run folder already exists, append `-2`, `-3`, and so on.
- Phase 5 writes run records under `.agent-rig/<agent>/runs/<run_id>/`.
- `runs/` folders are created lazily when the first task runs.
- Each run record includes `prompt.md` with the assembled prompt that a future real tool adapter would receive.
- Each run record includes `result.json` with the fake filesystem adapter result.
- Run records are the MVP audit trail for prompt assembly and task outcome.

## Handoff Logs

Handoff logs use Markdown with YAML frontmatter:

```md
---
agent: worker
role: worker
tool: codex
task: task-1
task_title: Implement X
run: run-1
status: done
---

# Handoff

## Message

Fake adapter completed task-1.
```

- Handoff filename follows Phase 4: `<date-YYYY-MM-DD-hhmm>_<run_id>_<tool>_<role>.md`.
- Handoff logs do not duplicate the full prompt body because `.agent-rig/<agent>/runs/<run_id>/prompt.md` stores it.

## Prompt Assembly

MVP prompt assembly order:

1. `.agent-rig/_shared/context.md`
2. `.agent-rig/<agent>/instructions.md`
3. `.agent-rig/<agent>/context.md`
4. Task `title`
5. Task Markdown body

- Do not inline skills, credentials, previous handoffs, or full logs in the MVP prompt.
- Prompt content can reference paths for the agent to inspect later.

## Watch Lock

- `agent-rig watch` creates `.agent-rig/_shared/watch.lock` while running.
- If `watch.lock` already exists, `agent-rig watch` exits with a clear error.
- The lock is removed on clean shutdown.
- No stale lock recovery, distributed locking, or multi-watch coordination in Phase 5.

## Watch Modes

- `agent-rig watch` runs continuously.
- `agent-rig watch --once` processes currently ready tasks and exits.
- MVP tests and demos use `--once` for deterministic behavior.
- `watch --once` processes all currently ready tasks.
- Processing order is deterministic: shared queue array order first, then agent-local queues by agent name and array order.
- Phase 5 does not process tasks concurrently.

## Adapter Interface

Phase 5 stays filesystem-only. The watch loop does not launch Claude, Codex, OpenCode, or shell commands in MVP.

MVP adapters expose one async operation:

```ts
runAgent({ agent, prompt, env, cwd }) -> { status: "done" | "blocked", message, handoff }
```

- Implement a fake filesystem adapter for integration tests.
- Fake adapter done message: `Fake adapter completed <task id>.`
- Fake adapter blocked message: `Fake adapter blocked <task id>.`
- Do not add shell, SDK, Claude, Codex, or OpenCode adapters in MVP.

## Blocker Notifications

- MVP blocker notifications are filesystem-only.
- Fake adapter `blocked` results add a blocker entry to `session.json`.
- Watch/runtime failures while processing a task mark the task `blocked`, add a blocker entry to `session.json`, and write a result plus handoff log.
- Slack, GitHub, and other external notifications are post-MVP.

## Open Decisions

None.
