---
id: task-0009
title: "Phase 14: extract loop runner boundary"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on: []
message: "Accepted: extracted a minimal loop runner seam via
  requireLoopAgent/runLoopAgent plus a shared LoopRunResult type while leaving
  Codex args, --output-last-message fallback, run-record fields, task selection,
  locking, polling, and prompt assembly unchanged; no OpenCode execution path
  was added; npm test -- --test-name-pattern='loop' passed (23) and git diff
  --check passed."
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

- Added a small `runLoopAgent(...)` dispatch seam in `src/tasks.ts` and kept the existing Codex execution path inside `runCodexLoop(...)`.
- Renamed the loop agent validator to `requireLoopAgent(...)` without changing the current Codex-only validation behavior.
- Introduced a shared `LoopRunResult` type so loop result handling no longer depends on the concrete Codex runner function type.
- Left task selection, lock handling, polling, prompt assembly, Codex args, fallback behavior, and run record fields unchanged.
- Verification: `npm test -- --test-name-pattern='loop'` passed with 23 tests.
