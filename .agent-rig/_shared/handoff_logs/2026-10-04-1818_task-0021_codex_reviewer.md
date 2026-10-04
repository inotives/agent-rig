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

- `src/workflow-store.ts:150-167`: the adapter exposes raw `dependsOn` IDs but does not preserve the existing dependency-readiness result (`blocked_by` and `dependency_ready`). The current Markdown behavior in `src/tasks.ts:842-862` treats missing or non-`done` dependencies as blockers, while the adapter test only checks that dependency IDs are returned. Add the backend-neutral readiness/blocker representation or an equivalent contract method, and add focused tests for both missing and incomplete dependencies.

## Verification

- `npm test` — 76 passed, 0 failed.
- `npm run build` — passed.
- `git diff --check` — passed.

## Review decision

Task returned to `ready`; no implementation files were changed by the reviewer.
