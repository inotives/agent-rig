---
agent: reviewer
role: reviewer
tool: codex
task: task-0024
task_title: "Phase 16: add Markdown to SQLite workflow migration"
status: handoff
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Findings

- 🔴 `src/workflow.ts:78`: `taskSourceFiles()` only matches task filenames whose ID is followed by `_` or `-`; a valid Markdown task named `task-0001.md` is accepted by `MarkdownWorkflowStore` but cannot be mapped, so migration aborts before import. Match the parsed task ID with the filename including the `.md` terminator.
- 🔴 `src/workflow.ts:38,59`: the `existsSync(databasePath)` check is not an atomic no-overwrite guarantee; another process can create `workflow.sqlite` after the check and `renameSync()` will replace it on POSIX. Install with a no-clobber primitive/lock and test the race-safe behavior.
- 🟡 `test/workflow-migration.test.mjs`: acceptance requires marker-write failure/partial-marker coverage, but the suite only covers pre-switch validation failures. Add a fixture that makes one historical file unreplaceable, verifies SQLite/config remain switched, and verifies the reported failure plus already-written markers.

## Verification

- `npm test` passed: 93 tests, 0 failures.
- `npm run build` passed.

Task should remain `ready` until the findings and required coverage are addressed.
