---
id: task-0032
title: "Phase 17: add UI API, frontend, and CLI verification coverage"
type: task
status: todo
assigned_to: worker
created_by: planner
created_on: 2026-10-05
updated_on: 2026-10-05
priority: high
parent: ""
storage_status: migrated
migrated_to: sqlite
migrated_at: "2026-10-05T12:30:14Z"
depends_on: [task-0030, task-0031]
---

# Task

## Context

Phase 17 requires automated confidence across the provider boundary, API,
frontend behavior, and CLI launch path before human acceptance.


## Goal

Add focused tests and smoke coverage for the agreed UI behavior.


## Scope

- Unit tests for phase resolution, status ordering, filtering, handoff sorting,
  search, and theme preference behavior.
- API tests proving read-only provider-neutral behavior.
- CLI smoke test for default and custom ports.
- Browser smoke test for board, phase filter, task route, handoff search,
  detail modal, and theme toggle.


## Planner Notes


## Implementation Plan


## Acceptance Criteria

- [ ] Unit, API, CLI, and browser smoke checks pass.
- [ ] Tests cover the no-handoff empty state and stale task route.
- [ ] Tests verify no write occurs through UI requests.
- [ ] Existing project checks remain green.

## Notes
