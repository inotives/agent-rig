---
id: task-0019
title: "Phase 15: run live loop observability smoke"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0018
message: ""
---

# Task

## Context

Phase 15 plan: `docs/phases/phase-15-loop-observability.md`.

Fixture tests are not enough for Phase 15. The phase must prove status output is useful after real mixed-tool loop runs.

## Goal

Run and record a live disposable smoke for loop observability.

## Scope

- Use a disposable temp repo/workspace.
- Use Codex as worker.
- Use OpenCode as reviewer.
- Run real `agent-rig loop --once` ticks.
- Run `agent-rig status` and `agent-rig status --json` after the loop runs.
- Verify status text and JSON show lock state, next action/idle, and latest worker/reviewer run summaries.
- Record smoke result in the Phase 15 doc or PR notes.
- Do not run against this repo's real task queue.

## Planner Notes

- This smoke verifies observability after real runs; it does not need to re-prove every Phase 14 adapter behavior.
- If local auth/provider/sandbox state blocks live execution, record exact blockers and do not mark this task done.

## Implementation Plan

1. Build the project.
2. Create a disposable temp repo and initialize AgentRig.
3. Configure Codex worker and OpenCode reviewer.
4. Create one harmless ready task assigned to `worker`.
5. Run the loop until worker moves it to `review`.
6. Run the loop until reviewer moves it to `done`.
7. Run `agent-rig status` and confirm compact loop text.
8. Run `agent-rig status --json` and confirm top-level `loop`.
9. Record smoke commands, final task status, status evidence, and run record paths.
10. Run final `npm test`, `git diff --check`, and `node dist/index.js validate`.
11. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Disposable workspace is used.
- [ ] Codex worker and OpenCode reviewer run through real loop ticks.
- [ ] Final task status reaches `done`.
- [ ] `agent-rig status` shows loop observability after the runs.
- [ ] `agent-rig status --json` includes top-level `loop` after the runs.
- [ ] Latest worker and reviewer run summaries appear in status output.
- [ ] Live smoke result is recorded in the Phase 15 doc or PR notes.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.
- [ ] `node dist/index.js validate` passes.

## Notes

