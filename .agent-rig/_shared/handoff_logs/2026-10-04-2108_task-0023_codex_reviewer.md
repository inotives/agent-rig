---
agent: reviewer
role: reviewer
tool: codex
task: task-0023
task_title: Phase 16: route commands and loop behavior through the workflow store
status: handoff
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Findings

- `src/tasks.ts:250-259` implements `tasks done` through `store.updateTask`, bypassing SQLite's `completeTask`/completion-trail integrity check. The command can mark a task done without the required worker/reviewer handoffs.
- `src/tasks.ts:717-725` only uses the atomic `updateTaskWithHandoff` path for SQLite; Markdown falls back to separate task and handoff writes. A failure between those writes leaves the lifecycle transition and handoff unpaired, contrary to the acceptance criterion for transactional pairing.
- The full test suite fails 15 loop/prompt tests. Existing prompt assertions still expect `Task file: .agent-rig/_shared/tasks/...`, while the new contract emits project/task identity and AgentRig mutation guidance. Compatibility tests need to be updated to the new contract and the loop suite must pass before acceptance.

## Checks

- `npm run build` passes.
- Workflow-store tests pass, including SQLite allocation, handoff sequencing, and rollback tests.
- `npm test` fails in loop selection/actions and worker/reviewer prompt tests.

## Recommendation

Return task to `ready`. Fix lifecycle completion routing, provide a provider-level paired transition for Markdown (or document and test a safe equivalent), and update/add provider-compatible loop tests before review.
