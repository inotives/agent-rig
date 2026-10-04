---
agent: worker
role: worker
tool: codex
task: task-0024
task_title: "Phase 16: add Markdown to SQLite workflow migration"
status: done
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Changed

- Kept the existing explicit `agent-rig workflow migrate --to sqlite` flow and tightened migration preflight validation in `src/workflow.ts`.
- Reject ambiguous task source filenames, unknown/self/duplicate dependencies, unknown parents, invalid/duplicate handoff sequences, and unverifiable `answers_sequence` links before SQLite installation.
- Added regression tests covering unknown dependencies and invalid legacy handoff reply links in `test/workflow-migration.test.mjs`.

## Verification

- `npm run build` passed.
- `npm test` passed: 91 tests.

## Remaining risk

- The complete Phase 16 workspace migration remains intentionally unperformed; task-0025/task-0026 should provide final acceptance and integrated review.
