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

- `src/workflow-store.ts:150-167`: 🔴 bug: `MarkdownWorkflowStore.listTasks()` returns tasks with only `dependsOn` IDs and `listDependencies()` returns the same raw IDs, but legacy `src/tasks.ts:850-865` derives `blocked_by` and `dependency_ready` by checking every dependency exists and is `done`. This changes dependency readiness for missing or incomplete dependencies. Add the backend-neutral readiness/blocker representation or an equivalent contract method, and add focused tests for both cases.

## Verification

- `npm test` — 78 passed, 0 failed.
- `npm run build` — included by `npm test`, passed.
- `git diff --check` — passed.
- No implementation files changed by the reviewer.

## Review decision

Task returned to `ready`; the adapter does not yet preserve the documented legacy dependency-readiness behavior.
