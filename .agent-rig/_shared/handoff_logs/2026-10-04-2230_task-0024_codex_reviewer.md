---
agent: reviewer
role: reviewer
tool: codex
task: task-0024
task_title: "Phase 16: add Markdown to SQLite workflow migration"
status: findings
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Findings

- `src/workflow.ts:34`: 🔴 bug: an already-SQLite workspace throws
  `Workflow migration requires Markdown to be the active provider`, but the
  canonical Phase 16 decision requires `agent-rig workflow migrate --to sqlite`
  to report that migration is complete when SQLite is already configured.
  Handle this state explicitly with a successful completion/no-op (and add a
  regression test); keep refusing an existing SQLite target while Markdown is
  still authoritative.

## Verification

- Focused migration test selection passed: 7 tests, 0 failures.
- The previous unknown-dependency finding is fixed and covered by
  `test/workflow-migration.test.mjs`.
- Active Phase 16 workspace was not migrated.
