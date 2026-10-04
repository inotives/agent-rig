---
id: task-0024
title: "Phase 16: add Markdown to SQLite workflow migration"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-10-04
updated_on: 2026-10-04
priority: high
parent: ""
depends_on:
  - task-0023
message: Reviewed migration implementation and focused tests; accepted. Full
  suite retains two unrelated loop error-record newline failures.
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---
















# Task

## Context

Depends on task-0023. Migration is the only operation that changes a workspace
from Markdown authority to SQLite authority.

## Goal

Implement safe, explicit Markdown-to-SQLite workflow migration.

## Scope

- Add `agent-rig workflow migrate --to sqlite`.
- Validate tasks, dependencies, handoffs, project identifier, and supported
  source metadata before import.
- Build a temporary SQLite database, import tasks and handoffs, preserve rich
  content/custom metadata, preserve source filenames and deterministic
  chronology, verify counts/links, then atomically install it.
- Switch provider configuration only after verification.
- Add `storage_status`, `migrated_to`, and `migrated_at` markers to historical
  Markdown task and handoff files afterward using safe per-file replacement.
- Refuse unsafe reruns or overwrites; leave Markdown authoritative on failures
  before the provider switch.
- Exclude `docs/`, run artifacts, and agent-harness state from migration.

## Planner Notes

Marker failures after the provider switch are reported but do not roll back
SQLite. Do not invent reply links when legacy Markdown cannot prove them.
Implement and test the migration here, but do not switch this Phase 16
workspace to SQLite in this task. The real workspace migration is the final
acceptance step after all Markdown-backed implementation tasks pass review.

## Implementation Plan

1. Add migration command parsing and preflight validation.
2. Import representative tasks, dependencies, and handoff chains.
3. Import legacy tasks with zero or one handoff without inventing missing
   history; preserve their task status and record an incomplete-trail marker
   plus the imported handoff count in task metadata.
4. Verify counts, keys, metadata, order, and content before installation.
5. Switch configuration and annotate historical Markdown records.
6. Add failure, rerun, partial-marker, and legacy-incomplete-trail tests.

## Acceptance Criteria

- [ ] Migration succeeds on a representative Markdown workspace and produces
      the documented SQLite records.
- [ ] Migration preserves task bodies, handoff messages, metadata, dependency
      links, project identity, filenames, timestamps, and chronological order.
- [ ] Tasks with zero or one handoff are imported without fabricated handoffs
      or fabricated reply links; their historical task status is preserved and
      their incomplete handoff trail is explicit in SQLite metadata.
- [ ] Provider configuration changes only after successful verification.
- [ ] Existing SQLite targets are never overwritten or merged implicitly.
- [ ] Historical Markdown records are distinguishable with migration markers;
      task lifecycle status remains unchanged.
- [ ] `docs/` and run artifacts are untouched except for no migration writes.
- [ ] Failure, rerun, and marker-write behavior are covered by tests.
- [ ] Unit/integration fixtures prove migration behavior without changing the
      active Phase 16 workspace provider.

## Notes
