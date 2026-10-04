---
id: task-0022
title: "Phase 16: implement SQLite workflow store and integrity rules"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-10-04
updated_on: 2026-10-04
priority: high
parent: ""
depends_on:
  - task-0021
message: "Accepted by independent review: SQLite build/focused tests pass;
  schema, transactional allocation, handoff integrity, legacy markers, and
  override verified. Full suite has two unrelated pre-existing stderr newline
  failures in test/init.test.mjs."
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---








# Task

## Context

Depends on task-0021. SQLite becomes canonical only after explicit migration.
The store must support future relational adapters without introducing a generic
ORM layer.

## Goal

Implement the local SQLite workflow store and its transactional integrity
rules.

## Scope

- Add the `tasks`, `task_dependencies`, `handoffs`, and provider-owned
  `store_metadata` tables with required indexes.
- Store known query fields in columns, task/handoff Markdown as text, and
  custom fields as serialized metadata JSON.
- Implement transactional human-readable task ID allocation and per-task
  handoff sequence allocation.
- Make task lifecycle plus handoff insertion atomic.
- Keep handoffs append-only and preserve sender/recipient metadata, timestamps,
  reply links when known, and optional opaque run metadata.
- Enforce the configured work/review handoff requirement for loop completion;
  keep an explicit human administrative override path.
- Do not reject legacy records during import solely because they have zero or
  one handoff. Preserve their historical task status, record the imported
  handoff count and an explicit incomplete-trail marker in task metadata, and
  enforce the two-handoff rule for any new completion decision.
- Do not migrate or model run directories, prompts, result files, or `docs/`.

## Planner Notes

Use the driver selected by task-0020. Keep the schema local-provider focused;
do not implement PostgreSQL or event sourcing.

## Implementation Plan

1. Add schema bootstrap and provider lifecycle handling.
2. Implement task/dependency reads and writes.
3. Implement handoff append and chronological queries.
4. Add transaction and concurrency tests for counters and paired writes.
5. Add integrity/error behavior for incomplete loop completion.

## Acceptance Criteria

- [ ] SQLite opens under Node.js `>=20` and bootstraps the documented schema.
- [ ] Task IDs remain project-scoped `task-0001`-style identifiers and are
      safe under concurrent creation.
- [ ] Handoff sequence starts at 1 per task, is monotonic, and is safe under
      concurrent append.
- [ ] Task updates and corresponding handoff inserts commit or roll back
      together.
- [ ] Rich Markdown, metadata JSON, dependencies, timestamps, and source
      metadata are preserved.
- [ ] Handoffs are append-only and incomplete loop completion is rejected
      unless explicitly administratively overridden.
- [ ] Legacy tasks with zero or one imported handoff remain importable with
      their historical status and are visibly marked as incomplete-trail
      records; ordinary new completion still rejects them until the trail is
      repaired.
- [ ] Focused SQLite tests and `git diff --check` pass.

## Notes
