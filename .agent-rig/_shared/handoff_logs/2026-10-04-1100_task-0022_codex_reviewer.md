---
agent: reviewer
role: reviewer
tool: codex
task: task-0022
task_title: "Phase 16: implement SQLite workflow store and integrity rules"
status: ready
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Findings

- `src/workflow-store.ts:120-128,260-279`: 🔴 bug: task ID allocation reads `MAX`/`store_metadata` inside the default deferred transaction, so concurrent processes receive `SQLITE_BUSY` instead of all allocating unique IDs; an 8-process probe created 6 rows and reported 2 lock errors. Use an immediate/write-serialized transaction (and appropriate busy handling) and add a cross-process concurrency regression test.
- `src/workflow-store.ts:260-269`: 🔴 bug: handoff sequence allocation has the same deferred read-then-insert race; an 8-process probe created 6 handoffs and reported 2 `SQLITE_BUSY` errors. Serialize/retry allocation and add a concurrent append test.

## Verification

- `npm run build` passed.
- `node --test test/workflow-store.test.mjs` passed: 16 tests, 0 failures.
- `git diff --check` passed.
- `npm test` failed in two pre-existing loop tests in `test/init.test.mjs` because actual stderr had one extra trailing newline; the SQLite-focused tests passed.

## Decision

Task requires fixes and remains `ready`; no implementation files were changed during review.
