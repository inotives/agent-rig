---
id: task-0017
title: "Phase 15: cover loop observability edge cases"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0016
message: "Accepted: task 17 closes the remaining Phase 15 status edge cases by
  preserving raw loop.lock pid bytes in JSON, rendering them safely in plain
  status via JSON.stringify, and adding deterministic coverage for malformed
  latest worker runs, missing reviewer runs, dependency-blocked ready tasks, and
  read-only status behavior; npm test -- --test-name-pattern='status lists
  agents|status --json reports loop lock|status loop observability edge cases'
  passed (3), npm test passed (66), node dist/index.js validate returned only
  expected downstream dependency warnings for tasks 0018-0019, and git diff
  --check passed."
---


# Task

## Context

Phase 15 plan: `docs/phases/phase-15-loop-observability.md`.

The observability surface should degrade gracefully because status is a diagnostic command. It should not become fragile when run records are absent or broken.

## Goal

Add deterministic coverage for missing, malformed, and dependency-blocked loop status scenarios.

## Scope

- Test missing worker/reviewer run directories.
- Test malformed latest `result.json`.
- Test dependency-blocked ready tasks.
- Test lock pid text preservation.
- Test that status does not mutate task files.
- Run the full test suite after focused tests pass.

## Planner Notes

- Prefer fixture-style tests over new helpers unless existing helpers are awkward.
- The output contract should stay small; do not add new fields just for tests.

## Implementation Plan

1. Add targeted test fixtures around status JSON and text.
2. Assert missing/malformed run data returns `null` or compact unavailable text.
3. Assert dependency-blocked ready tasks are not reported as next worker action.
4. Assert status does not claim or update tasks.
5. Run `npm test`.
6. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Missing run records do not fail status.
- [ ] Malformed latest run records do not fail status.
- [ ] Dependency-blocked ready tasks are not selected as next action.
- [ ] Lock pid text is reported exactly as stored.
- [ ] Status does not mutate task frontmatter.
- [ ] `npm test` passes.

## Notes

- Fixed `src/live.ts` lock pid handling to preserve the raw `.agent-rig/_shared/loop.lock` contents instead of trimming them.
- Plain `agent-rig status` now renders lock pid text with `JSON.stringify(...)` so whitespace and trailing newline bytes stay visible without breaking the compact text output.
- Added a focused status edge-case test in `test/init.test.mjs` covering:
  - missing reviewer run directory,
  - malformed latest worker `result.json`,
  - dependency-blocked `ready` worker task not being selected,
  - exact raw lock pid text preservation,
  - `status` remaining read-only and not mutating task frontmatter.
- Updated the earlier Phase 15 lock expectations to match the raw-pid contract.
- Verification:
  - `npm test -- --test-name-pattern='status lists agents|status --json reports loop lock|status loop observability edge cases'`
  - `npm test`
  - `node dist/index.js validate`
  - `git diff --check`
