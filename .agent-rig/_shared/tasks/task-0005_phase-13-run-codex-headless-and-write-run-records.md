---
id: task-0005
title: "Phase 13: run Codex headless and write run records"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-15
priority: normal
parent: ""
depends_on:
  - task-0004
---

# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

After task selection and prompt assembly exist, the loop can invoke Codex headlessly and keep debug artifacts for each run.

## Goal

Run selected worker/reviewer tasks with `codex exec` and write per-agent run records.

## Scope

- Invoke Codex as:
  - `codex exec -C <repo-root> --sandbox workspace-write --ask-for-approval never -`
- Pass the assembled prompt via stdin.
- Use `--output-last-message <path>` when available.
- Write run records under `.agent-rig/<agent>/runs/<run-id>/`.
- Minimum run files:
  - `prompt.md`
  - `result.json`
  - `last-message.md`
- `result.json` includes:
  - agent name,
  - role,
  - tool,
  - task id,
  - command arguments,
  - exit status,
  - started and finished timestamps,
  - final task status after the run.
- Add tests with a fake `codex` executable; do not require real Codex auth in tests.
- Do not implement stale-state failure handling in this task unless needed for the basic result record.
- Do not add dangerous bypass mode.

## Planner Notes

- Keep this Codex-only.
- Do not introduce a generic adapter abstraction in this phase.
- Use fake `codex` in tests to assert command args and stdin content.

## Implementation Plan

1. Add a Codex invocation helper around `spawnSync` or equivalent.
2. Create a run directory before invocation.
3. Write `prompt.md` before invoking Codex.
4. Invoke fake/real `codex exec` with the exact Phase 13 arguments.
5. Capture the final message path and write `result.json`.
6. Add tests using PATH injection with a fake `codex`.
7. Run `npm test`.

## Acceptance Criteria

- [ ] Worker loop action invokes `codex exec` with `-C <repo-root>`, workspace-write sandbox, no approvals, and stdin prompt.
- [ ] Reviewer loop action invokes the same Codex command shape.
- [ ] The implementation never uses `--dangerously-bypass-approvals-and-sandbox`.
- [ ] Each invocation writes `prompt.md`.
- [ ] Each invocation writes `last-message.md`.
- [ ] Each invocation writes `result.json` with command args, timestamps, exit status, and final task status.
- [ ] Tests use a fake `codex` binary and do not require network or real Codex auth.
- [ ] `npm test` passes.

## Notes
