---
agent: reviewer
role: reviewer
tool: codex
task: task-0023
task_title: Route commands and loop behavior through the workflow store
status: handoff
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Findings

- `src/tasks.ts:445-470`: 🔴 bug: SQLite `watch --once` sends a ready worker task through `updateTaskWithHandoff` with `status: done`, so SQLite completion-trail validation rejects the transition and the catch path records the task as blocked after only one worker handoff. Preserve the provider-compatible watch behavior or make the fake/legacy path perform the required worker/reviewer sequence; add a SQLite watch regression test.
- `npm test`: 🟡 risk: two existing loop failure tests still fail because captured stderr has one extra trailing newline at `test/init.test.mjs:1403` and `1490`; resolve or explicitly separate this residual failure before phase acceptance.

## Verification

- `npm run build`: passed.
- `node --test test/workflow-store.test.mjs test/init.test.mjs`: same two loop stderr assertion failures.
- Fresh SQLite CLI smoke: `init --yes`, configure `workflow_store.provider=sqlite`, create ready worker task, `watch --once`; command exits 0 but status shows `blocked: 1`, one blocked worker handoff, and no done task.
- `status --json` derives provider, task counts, and handoffs from SQLite as expected.
- `git diff --check`: not rerun in this review.

## Recommendation

Return task to `ready` for the SQLite watch compatibility fix and regression coverage.
