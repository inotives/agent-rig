---
id: task-0016
title: "Phase 15: add compact loop status text"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0015
message: "Accepted: plain status now renders a compact Loop section from the
  existing task-0015 loop model instead of adding a second source of truth,
  covering lock state, next action, and latest default worker/reviewer run
  summaries while keeping output metadata-only and path-based; text assertions
  prove unlocked idle, locked review-first, worker fallback, reviewer
  missing-run, and idle fallback behavior; npm test --
  --test-name-pattern='status lists agents|status --json reports loop lock'
  passed (2), npm test passed (65), node dist/index.js validate returned only
  expected downstream dependency warnings for tasks 0017-0019, and git diff
  --check passed."
---


# Task

## Context

Phase 15 plan: `docs/phases/phase-15-loop-observability.md`.

After the JSON model exists, plain `agent-rig status` should expose the same loop facts compactly.

## Goal

Add a compact loop section to text status output.

## Scope

- Extend plain `agent-rig status` output.
- Show lock state.
- Show next loop action.
- Show latest worker and reviewer run summaries.
- Keep text output compact and metadata-only.
- Do not print prompt text, stdout/stderr bodies, or `last-message.md` content.

## Planner Notes

- Text output should answer "what will the loop do next?" and "what happened last?"
- Full details should be reachable through run paths, not inlined in status.

## Implementation Plan

1. Reuse the JSON loop model from task 15.
2. Add a small `Loop:` section to `printStatus(...)`.
3. Format idle/missing/latest-run-null states cleanly.
4. Add text-output tests for lock, next action, latest runs, and idle.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Plain `agent-rig status` includes a compact `Loop:` section.
- [ ] Text output shows unlocked and locked states.
- [ ] Text output shows reviewer next action before worker next action.
- [ ] Text output shows worker next action when appropriate.
- [ ] Text output shows idle when no actionable task exists.
- [ ] Text output shows latest worker/reviewer run metadata only.

## Notes

- Reused the existing `model.loop` data from task 15 and extended `printStatus(...)` in `src/live.ts`.
- Plain `agent-rig status` now prints a compact `Loop:` section with:
  - lock state and `.agent-rig/_shared/loop.lock` path,
  - next loop action,
  - latest worker run summary,
  - latest reviewer run summary.
- Idle and missing-run states render as `next: idle` and `<agent>: none`.
- Latest run text stays metadata-only and includes the run path instead of inlining prompt, stdout/stderr, or `last-message.md` content.
- Added text assertions in `test/init.test.mjs` for unlocked idle output, locked review-first output, worker fallback output, and idle fallback after no actionable task remains.
- Verification:
  - `npm test -- --test-name-pattern='status lists agents|status --json reports loop lock'`
  - `npm test`
  - `node dist/index.js validate`
  - `git diff --check`
