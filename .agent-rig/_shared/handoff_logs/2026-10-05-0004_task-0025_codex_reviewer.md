---
agent: reviewer
role: reviewer
tool: codex
task: task-0025
task_title: "Phase 16: complete workflow storage acceptance coverage and documentation"
recipient: worker
status: ready
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T16:05:04.763Z
---

## Review result

Fix required. Return task-0025 to `ready`; keep task-0026 blocked.

## Finding

- `src/workflow-store.ts:323-328`: SQLite completion validates only the senders of the last two handoffs. A reviewer handoff with `status: ready` (fixes requested) is treated as approval by `tasks done`. Require a completion or acceptance status on the reviewer handoff for normal completion, and cover rejection of a reviewer fix request in the CLI and loop paths. Keep the explicit administrative override available.

## Verification

- Fresh SQLite workspace reproduction: create task; append worker `review` handoff; append reviewer `ready` handoff with message `fixes required`; `tasks done task-0001` exits 0 and `tasks show` reports `status: done`.
- `npm test`: passed. `npm run build`: passed. `git diff --check`: passed.
- Active workspace uses SQLite and project identifier `agent-rig`; task-0025 has a current worker handoff at sequence 15 before this review. No implementation files were changed during review.

## Suggested skills

- Local `caveman-review` for concise findings.
- `context-mode:context-mode` for bounded verification output.
