# Task: Align loop lifecycle and infrastructure failure handling

## Context

The loop currently blocks a task after any non-zero child exit. This turns
Codex startup and permission failures into false task blockers.

## Goal

Make one loop tick perform one safe lifecycle transition and keep child startup
failures retryable.

## Scope

- Loop orchestration and result handling under `src/workflow/`.
- Manager-owned completion and dependency unblocking.
- Worker-reviewer retry sequencing.
- Infrastructure failure recording and tests.

## Planner Notes

- A worker handles `ready` or a worker repair request.
- A reviewer handles `review`.
- A reviewer approval does not directly complete the task.
- The planner marks `done` after approval and integrated verification.

## Implementation Plan

1. Map each loop tick to one task transition.
2. Keep worker and reviewer execution sequential for one task.
3. Separate child startup failure from task failure.
4. Preserve the task's retryable state after infrastructure failure.
5. Record enough error context for the planner to retry from the host.
6. Add focused tests for happy path, repair path, and child startup failure.

## Acceptance Criteria

- [ ] A worker success leaves the task in `review`.
- [ ] A reviewer approval is visible to the planner without bypassing it.
- [ ] A reviewer finding starts a worker repair cycle.
- [ ] A child startup failure does not set the task to `blocked`.
- [ ] One `loop --once` does not process two lifecycle transitions.
- [ ] Focused loop tests pass.
