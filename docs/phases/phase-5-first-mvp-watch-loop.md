# Phase 5: First MVP Watch Loop

## Goal

Deliver the first end-to-end MVP: a watch daemon that turns filesystem state changes into headless agent prompts and records the result.

## Scope

- `agent-rig watch`
- File watcher for task queues and state transitions
- Prompt assembly from shared instructions, agent instructions, and task context
- Headless invocation adapter boundary
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
- A fake adapter can complete a task and write a handoff log.
- Failure writes a visible blocker or error state.
- The full MVP flow works from `init --yes` through validate, watch, task completion, and status.

## Queue Lifecycle

- MVP task states: `ready`, `running`, `done`, `blocked`.
- Valid transitions: `ready -> running -> done` or `ready -> running -> blocked`.
- Failures become `blocked` with a visible message.
- No retry state, priority, or cancellation in MVP.

## Adapter Interface

MVP adapters expose one async operation:

```ts
runAgent({ agent, prompt, env, cwd }) -> { status: "done" | "blocked", message, handoff }
```

- Implement a fake adapter for integration tests.
- Implement one real shell adapter that runs the configured command.
- Do not add per-tool SDK adapters in MVP.

## Blocker Notifications

- MVP blocker notifications are filesystem-only.
- Write blockers to `session.json`.
- Write a handoff or blocker log entry.
- Slack, GitHub, and other external notifications are post-MVP.

## Open Decisions

None.
