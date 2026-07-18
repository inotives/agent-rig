---
id: task-0017
title: "Phase 15: cover loop observability edge cases"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0016
message: ""
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

