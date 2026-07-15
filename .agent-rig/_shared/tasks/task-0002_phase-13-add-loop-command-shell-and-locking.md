---
id: task-0002
title: "Phase 13: add loop command shell and locking"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-15
priority: normal
parent: ""
depends_on:
  - task-0001
---

# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

This task adds the top-level `agent-rig loop` command surface and the lock that prevents two loop processes from coordinating the same workspace at once.

## Goal

Add the `agent-rig loop` CLI shell with option parsing, help text, and `.agent-rig/_shared/loop.lock` handling.

## Scope

- Route `agent-rig loop` from the CLI entrypoint.
- Add help text for:
  - `agent-rig loop`
  - `agent-rig loop --once`
  - `agent-rig loop --worker <agent>`
  - `agent-rig loop --reviewer <agent>`
  - `agent-rig loop --interval <seconds>`
- Defaults:
  - worker: `worker`
  - reviewer: `reviewer`
  - interval: `60`
  - no `--once` means continuous mode, but this task does not need to implement polling behavior yet.
- Validate that selected worker and reviewer agents exist.
- Validate that selected agents use `tool = "codex"` and fail clearly otherwise.
- Add `.agent-rig/_shared/loop.lock` creation and cleanup around loop execution.
- Do not run Codex in this task.
- Do not implement task selection beyond a placeholder no-action tick if needed.

## Planner Notes

- Keep `watch --once` unchanged.
- Use a separate `loop.lock`; do not reuse `watch.lock`.
- Do not add git branch automation.
- Keep parsing small and consistent with existing command style.

## Implementation Plan

1. Add a `runLoop` command entrypoint and wire it into `src/index.ts`.
2. Parse `--once`, `--worker`, `--reviewer`, and `--interval`.
3. Add agent existence and `tool = "codex"` validation.
4. Add lock acquire/release behavior for `.agent-rig/_shared/loop.lock`.
5. Add focused tests for help, defaults, unknown agents, non-Codex agents, and existing lock refusal.
6. Run `npm test`.

## Acceptance Criteria

- [ ] `agent-rig --help` lists the `loop` command.
- [ ] `agent-rig loop --help` documents flags and defaults.
- [ ] `agent-rig loop --once` works as a valid command without invoking Codex yet.
- [ ] Unknown worker or reviewer agents fail clearly.
- [ ] Non-Codex worker or reviewer agents fail clearly with a Phase 13 Codex-only message.
- [ ] A pre-existing `.agent-rig/_shared/loop.lock` makes `agent-rig loop --once` fail clearly.
- [ ] The loop lock is removed on normal command completion.
- [ ] Existing `agent-rig watch --once` tests still pass.
- [ ] `npm test` passes.

## Notes
