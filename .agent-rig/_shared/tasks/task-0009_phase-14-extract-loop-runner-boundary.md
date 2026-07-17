---
id: task-0009
title: "Phase 14: extract loop runner boundary"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on: []
message: ""
---

# Task

## Context

Phase 14 plan: `docs/phases/phase-14-opencode-loop-adapter.md`.

Phase 13 implemented `agent-rig loop` with a direct Codex runner. Phase 14 needs OpenCode support without changing task selection, locking, prompt assembly, or lifecycle behavior.

## Goal

Extract the minimum runner boundary needed for the loop to dispatch by `agent.tool`.

## Scope

- Keep existing Codex behavior unchanged.
- Introduce a small runner helper for loop invocations.
- Support only `codex` in this task; OpenCode comes next.
- Preserve existing run record files and fields.
- Do not change task selection, dependency gating, locking, polling, or prompt assembly behavior.

## Planner Notes

- Keep this small. This is not a generic plugin architecture.
- The helper exists because Codex and OpenCode have different command shapes.
- Avoid adding a broad adapter interface unless the current code needs it.

## Implementation Plan

1. Identify the current direct Codex runner path in `src/tasks.ts`.
2. Move only the command-specific execution into a small helper.
3. Keep Codex command args, `--output-last-message` fallback, failure messages, and run record output unchanged.
4. Run focused loop tests.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Existing fake Codex loop tests still pass.
- [ ] Codex command args are unchanged.
- [ ] Codex `--output-last-message` fallback still works.
- [ ] Run records keep the same shape for Codex.
- [ ] No OpenCode behavior is added in this task.

## Notes

