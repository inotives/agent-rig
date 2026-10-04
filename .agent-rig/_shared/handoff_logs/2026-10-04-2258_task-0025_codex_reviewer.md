---
agent: reviewer
role: reviewer
tool: codex
task: task-0025
task_title: "Phase 16: complete workflow storage acceptance coverage and documentation"
status: ready
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T16:45:10.805Z
---

## Review findings

1. `src/tasks.ts:253-263`, `src/tasks.ts:169-179`, and `src/tasks.ts:1028-1033`: `tasks done` and `tasks set-status <id> done` call `updateTask` without completion-trail validation. A fresh SQLite task with zero handoffs was marked `done` by `tasks done` (exit 0). `tasks create --status done` has the same gap. Enforce the required work/review trail for ordinary agent-facing completion, with an explicit human administrative override where needed, and test each CLI path.
2. `.agent-rig/_shared/handoff_logs/2026-10-04-2255_task-0025_codex_worker.md`: this verification handoff was created after the one-way migration. It has no historical marker and task-0025 has zero handoffs in the active SQLite store, so the remaining integrated-review workflow has lost its worker side. Reconcile the in-flight run at migration time through the active provider, then verify the task-0025 handoff trail and historical/source record state.
3. `docs/phases/phase-16-workflow-storage.md:7-11`: the Current Status section still says final migration is pending although this workspace is now SQLite. Update it to describe the actual state after the handoff issue is resolved.

## Verification

- `npm test`: 98 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Fresh SQLite CLI reproduction: `tasks done task-0001` returned exit 0; `tasks show` reported `done`; `status --json` reported zero handoffs.
- This workspace's SQLite store has 26 tasks and 36 handoffs; task-0025 is in `review` with `imported_handoff_count: 0` and `incomplete_handoff_trail: true` before this review status update.

No high-confidence security vulnerability identified. The completion-integrity and migration handoff findings block acceptance.
