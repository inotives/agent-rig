---
id: task-0003
title: "Phase 13: implement review-first task selection"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-15
priority: normal
parent: ""
depends_on:
  - task-0002
message: "Accepted: review-first loop selection verified; review tasks stay
  unmodified, worker claims reuse dependency-ready selection, other-agent and
  blocked tasks are skipped, no-action path works; npm test and git diff --check
  clean."
---


# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

After the loop command exists, it needs deterministic task selection before any Codex process is launched.

## Goal

Implement one-shot loop task selection with review-first priority and worker task claiming.

## Scope

- Read canonical shared tasks from `.agent-rig/_shared/tasks/*.md`.
- On each loop tick, select the first deterministic task with `status: review`.
- If a review task exists, report/select it for reviewer execution without claiming worker work.
- If no review task exists, select the next dependency-ready task with:
  - `status: ready`
  - `assigned_to: <worker>`
- Claim selected worker tasks by setting `status: in_progress` and updating `updated_on`.
- If no review or worker task exists, print a concise no-action message and exit zero for `--once`.
- Do not run Codex in this task.
- Do not implement continuous polling in this task.

## Planner Notes

- Review work always takes priority over ready worker work.
- Returned reviewer work is just `status: ready` with notes, so it should flow through the same worker selection path.
- Reuse existing dependency readiness semantics from `tasks next`; do not invent a second dependency model.

## Implementation Plan

1. Extract or reuse shared task reading/selection helpers as needed.
2. Add review-first selection to the loop tick.
3. Add worker-ready selection using existing dependency-ready behavior.
4. Mutate only worker claims, not review tasks.
5. Add tests for review priority, worker claim, dependency blocking, and no-action behavior.
6. Run `npm test`.

## Acceptance Criteria

- [ ] A `review` task is selected before any `ready` worker task.
- [ ] A selected review task is not mutated by selection.
- [ ] A dependency-ready worker task is claimed as `in_progress` when no review task exists.
- [ ] Worker selection ignores ready tasks assigned to other agents.
- [ ] Worker selection ignores ready tasks with incomplete dependencies.
- [ ] Returned tasks with `status: ready` and reviewer notes are claimable normally.
- [ ] `agent-rig loop --once` exits zero and prints a no-action message when nothing is actionable.
- [ ] `npm test` passes.

## Notes

- Implemented review-first loop selection in `src/tasks.ts`.
- `agent-rig loop --once` now selects the first `review` task for the configured reviewer without mutating it.
- When no review task exists, the loop reuses the existing dependency-ready worker selection path and claims the selected worker task by setting `status: in_progress`.
- Ready tasks assigned to other agents and ready tasks with incomplete dependencies are ignored.
- Returned worker tasks with `status: ready` remain claimable normally even when reviewer notes are present in the body.
- No Codex execution or continuous polling was added in this task.
- Ran `npm test` successfully: 44 passed, 0 failed.
