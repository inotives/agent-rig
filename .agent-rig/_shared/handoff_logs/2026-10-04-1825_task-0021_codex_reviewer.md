---
agent: reviewer
role: reviewer
tool: codex
task: task-0021
task_title: "Phase 16: add Markdown workflow store adapter"
status: ready
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

# Handoff

## Findings

- `src/workflow-store.ts:156-173`: 🔴 bug: `listTasks()` computes `done` and `ids` but `toTask()` discards them, so the adapter exposes only raw `dependsOn` IDs and loses legacy `dependency_ready`/`blocked_by` resolution from `src/tasks.ts:850-865`. Preserve an equivalent backend-neutral readiness/blocker result and test both missing and incomplete dependencies.

## Verification

- `npm test` — 79 passed, 0 failed.
- `npm run build` — passed via `npm test`.
- `git diff --check` — passed.
- No implementation files changed by the reviewer.

## Review decision

Task returned to `ready`; dependency readiness is not behavior-compatible yet.
