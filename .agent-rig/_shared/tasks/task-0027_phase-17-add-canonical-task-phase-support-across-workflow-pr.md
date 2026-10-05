---
id: task-0027
title: "Phase 17: add canonical task phase support across workflow providers"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-10-05
updated_on: 2026-10-05
priority: high
parent: ""
storage_status: migrated
migrated_to: sqlite
migrated_at: "2026-10-05T12:30:14Z"
depends_on: []
---


# Task

## Context

Phase 17 needs an optional canonical task phase so the UI can filter tasks
without relying only on legacy title or filename inference.


## Goal

Expose and persist `phase` through the provider-neutral workflow model, the
Markdown provider, the SQLite provider, and task create/update commands.


## Scope

- Add the optional phase field to the shared task model and provider contract.
- Persist it in Markdown frontmatter and SQLite.
- Accept phase on task creation and update paths.
- Preserve legacy inference as a display-only fallback.


## Planner Notes

Use explicit phase first, then `phase-<number>` or `phase <number>` from title
or filename, otherwise `Unassigned`. Do not silently rewrite inferred values.


## Implementation Plan


## Acceptance Criteria

- [ ] Markdown and SQLite tasks can round-trip an explicit optional phase.
- [ ] Task create/update paths accept and preserve phase.
- [ ] Provider-neutral reads expose the same phase shape.
- [ ] Legacy records resolve to explicit phase, recognized token, or
      `Unassigned` without mutation.
- [ ] Existing workflow-store tests remain green.

## Notes
