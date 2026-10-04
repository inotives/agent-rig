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

1. 🔴 `src/live.ts:64-244` still derives status, loop selection, task counts, and handoff listings by scanning `.agent-rig/_shared/tasks` and `.agent-rig/_shared/handoff_logs`. With a SQLite provider, `agent-rig status` therefore reports empty/stale Markdown state instead of the active workflow store, failing the status/inspection routing criterion.
2. 🔴 `src/tasks.ts:440-463` and `src/tasks.ts:702-715` update the task with `store.updateTask`, then append the handoff with `store.addHandoff` as separate operations. The available `updateTaskWithHandoff` transaction is not used. A failure between the two calls leaves a task transition without its required handoff, violating the transactional pairing criterion; the CLI lifecycle helpers at `src/tasks.ts:175-286` also transition tasks without paired handoffs.
3. 🟡 `src/tasks.ts:481-484` still emits `Task file: <path>` for Markdown tasks. The task explicitly asks prompts to identify work by project identifier and task ID rather than a canonical task-file path; remove this identity field while retaining the AgentRig mutation guidance.

## Verification

- `npm test`: 85 passed, 0 failed.
- `git diff --check`: passed.
- Existing tests do not exercise CLI/status/loop compatibility with an SQLite-configured workspace, so the direct `live.ts` Markdown reads were not caught.

## Required follow-up

Return task to `ready`. Route `src/live.ts` through `createWorkflowStore` and store queries, use the transactional task-plus-handoff API for loop/lifecycle transitions, remove the canonical task-file prompt identity, and add provider compatibility coverage before re-review.

Suggested skills: security-review, caveman-review
