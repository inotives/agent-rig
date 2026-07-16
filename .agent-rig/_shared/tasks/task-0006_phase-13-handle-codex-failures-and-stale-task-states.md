---
id: task-0006
title: "Phase 13: handle Codex failures and stale task states"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-16
priority: normal
parent: ""
depends_on:
  - task-0005
message: "Accepted: loop now blocks non-zero codex exits and stale
  in_progress/review states using the existing blocker pattern; result.json is
  rewritten with final_task_status and blocked failure_summary after post-run
  reconciliation; accepted reviewer done/ready and worker review transitions are
  covered; npm test passed (54)."
---


# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

The loop must be safe when headless Codex fails or forgets to move the task to a terminal state for that run.

## Goal

Add failure handling for non-zero Codex exits and stale task statuses after worker/reviewer runs.

## Scope

- If Codex exits non-zero, mark the active task `blocked` with a concise failure summary.
- If worker Codex exits zero but leaves the task `in_progress`, mark it `blocked`.
- If reviewer Codex exits zero but leaves the task `review`, mark it `blocked`.
- Preserve useful failure information in the task body or frontmatter using the existing blocker pattern.
- Update `result.json` to reflect final task status after failure handling.
- Do not interpret reviewer prose to infer done/ready.
- Do not add new review metadata.

## Planner Notes

- The loop must not guess whether implementation or review succeeded.
- Existing task status is the source of truth after Codex exits.
- Use current `tasks block` style semantics where practical.

## Implementation Plan

1. Reload the task from disk after each Codex invocation.
2. Check exit status and role-specific expected terminal states.
3. Apply blocking updates for non-zero exits or stale statuses.
4. Record the final post-handling status in `result.json`.
5. Add tests for non-zero worker, stale worker, non-zero reviewer, and stale reviewer cases.
6. Run `npm test`.

## Acceptance Criteria

- [ ] Non-zero worker Codex exit marks the task `blocked`.
- [ ] Non-zero reviewer Codex exit marks the task `blocked`.
- [ ] Worker leaving the task `in_progress` marks the task `blocked`.
- [ ] Reviewer leaving the task `review` marks the task `blocked`.
- [ ] Reviewer changing a task to `done` is accepted.
- [ ] Reviewer changing a task to `ready` with notes is accepted.
- [ ] Worker changing a task to `review` is accepted.
- [ ] Failure handling updates `result.json` with the final task status.
- [ ] `npm test` passes.

## Notes

- Updated `src/tasks.ts` so `runLoop` now post-processes every Codex run before returning:
  non-zero exits become `blocked`, worker runs that remain `in_progress` become
  `blocked`, and reviewer runs that remain `review` become `blocked`.
- Added shared helpers to reuse the existing blocker semantics: reload the task
  from disk after Codex exits, apply `blocked_reason` / `blocked_on`, append a
  `## Blockers` entry, and then rewrite the run artifact with the final
  post-handling task status.
- Extended `result.json` handling so loop run records now reflect the final task
  status after stale-state repair or non-zero failure handling, not just the
  immediate pre-repair state.
- Extended the fake Codex test harness so tests can drive explicit task status
  transitions and reviewer note appends by mutating the task file named in the
  loop prompt.
- Updated loop coverage to verify accepted reviewer `done`, accepted reviewer
  `ready` with notes, accepted worker `review`, non-zero reviewer failure,
  missing-Codex failure, stale worker blocking, and stale reviewer blocking.
- Ran `npm test` successfully: 54 passed, 0 failed.
