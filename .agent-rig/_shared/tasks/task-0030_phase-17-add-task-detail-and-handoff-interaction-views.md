---
id: task-0030
title: "Phase 17: add task detail and handoff interaction views"
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
depends_on: [task-0029]
---

# Task

## Context

Users need to move from a board card into the complete task and inspect the
worker/reviewer handoff loop without leaving the local UI.


## Goal

Implement task routing, Markdown detail rendering, searchable handoff table,
and handoff detail modal.


## Scope

- Client-side `#/tasks/<task-id>` route with browser back/forward support.
- Task header, rendered Markdown body, dependencies, and handoff timeline.
- Handoff table sorted by sequence descending.
- Search across metadata and summary/body text, case-insensitively.
- Detail modal with rendered content and collapsible JSON metadata.
- Safe Markdown rendering with raw HTML disabled and sanitized output.
- Empty state for tasks with no handoffs and not-found handling.


## Planner Notes


## Implementation Plan


## Acceptance Criteria

- [ ] Card navigation opens a task route and browser back returns to the board.
- [ ] Task Markdown renders safely with raw HTML disabled.
- [ ] Handoff rows show sequence, sender, recipient, status, timestamp, and
      detail action.
- [ ] Search filters the agreed handoff fields without a new server query.
- [ ] Detail modal opens/closes correctly and shows metadata JSON.
- [ ] Tasks with no handoffs render a clear empty state.

## Notes
