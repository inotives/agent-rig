---
id: task-0028
title: "Phase 17: add read-only workflow UI API"
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
depends_on: [task-0027]
---

# Task

## Context

The browser needs a small provider-neutral read boundary over the active
workflow store.


## Goal

Add read-only JSON endpoints for board summaries, task detail, and handoffs.


## Scope

- `GET /api/workflow` with project identity, phases, and task summaries.
- `GET /api/tasks/:taskId` with full task detail.
- `GET /api/tasks/:taskId/handoffs` with ordered handoff rows and modal data.
- Read-only routing with no mutation endpoints.
- Provider-neutral access through the active WorkflowStore.


## Planner Notes

SQLite is the primary tested provider; Markdown remains supported. Handoff
ordering is sequence descending. Return metadata without exposing raw storage
paths as primary UI data.


## Implementation Plan


## Acceptance Criteria

- [ ] All three endpoints return stable JSON for SQLite-backed workflow data.
- [ ] The same handlers work through the Markdown provider boundary.
- [ ] No UI route can mutate tasks or handoffs.
- [ ] Missing tasks and handoffs produce predictable not-found/error responses.

## Notes
