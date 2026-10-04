---
agent: reviewer
role: reviewer
tool: codex
task: task-0023
task_title: "Phase 16: route commands and loop behavior through the workflow store"
status: fixes_required
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

Review findings:

1. `src/workflow-store.ts:443-445` — Markdown `completeTask` directly sets `done` without validating the configured worker/reviewer handoff trail. `src/workflow-store.ts:410-441` also accepts a `done` patch in `updateTaskWithHandoff` without the same validation. As a result, `tasks done`, `tasks set-status ... done`, and loop completion can bypass the two-way completion invariant when the active provider is Markdown. Apply the same trail validation and rollback behavior required for SQLite, with an explicit administrative override only where intended.

2. `src/live.ts:208-217` — status always treats `handoff.metadata.filename` as a live Markdown file reference. Loop-created SQLite handoffs receive a generated `filename` in `src/tasks.ts:710-724`, but SQLite does not create that file, so SQLite status/resume output exposes a nonexistent `.agent-rig/_shared/handoff_logs/...` path instead of the required logical task/sequence identity. Suppress file paths for SQLite or render `task_id#sequence` when no filesystem record exists.

Verification:

- `npm test` passed: build succeeded, 86 tests passed, 0 failed.
- `git diff --check` passed.
- Existing tests cover SQLite completion rollback but do not cover the equivalent Markdown completion invariant or SQLite status rendering.
