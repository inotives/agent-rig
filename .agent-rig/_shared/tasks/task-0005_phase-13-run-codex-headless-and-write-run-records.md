---
id: task-0005
title: "Phase 13: run Codex headless and write run records"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-16
priority: normal
parent: ""
depends_on:
  - task-0004
message: "Accepted: codex loop invocation and run-record contract verified;
  worker/reviewer actions write prompt.md, last-message.md, and result.json;
  unsupported --output-last-message falls back cleanly; missing/non-zero codex
  exits now return friendly non-zero CLI errors without stack traces while
  preserving run artifacts; npm test passed (51) and live missing-codex repro
  verified."
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

- Added direct `codex exec` invocation for `agent-rig loop` selections in `src/tasks.ts`.
- Worker and reviewer loop actions now run `codex exec -C <repo-root> --sandbox workspace-write --ask-for-approval never --output-last-message <path> -` with the assembled prompt on stdin.
- Each loop invocation now writes `.agent-rig/<agent>/runs/<run-id>/prompt.md`, `last-message.md`, and `result.json`.
- `result.json` now records agent name, role, tool, task id, command args, exit status, timestamps, and final task status after the run.
- Added a fake `codex` test helper with PATH injection and direct assertions for command args, stdin prompt content, and run-record files.
- Added fallback behavior for Codex builds that reject `--output-last-message`: retry once without the flag and still write an empty `last-message.md`.
- Fixed loop command exit behavior: if `codex exec` exits non-zero, `agent-rig loop` now exits non-zero too while still preserving the run record for task 6 to handle.
- Added subprocess debug details to `result.json` (`stdout`, `stderr`, `error`) and surfaced the first stderr line in the loop failure message so failed reviewer/worker runs are diagnosable from run artifacts.
- Added a clearer missing-Codex failure message when `codex` is not on PATH, while still preserving the run record with the raw spawn error for debugging.
- Added `failure_summary` to `result.json` so failed run artifacts carry a human-readable explanation even without the CLI stderr.
- Fixed the `runLoop` async error boundary by awaiting `withLock(...)` inside the local `try/catch`, so failed Codex runs now return friendly stderr only instead of leaking a raw Node stack trace.
- Ignored `.agent-rig/*/runs/` in the repo `.gitignore` so task 5 run artifacts no longer pollute `git status` during review or development.
- Left stale-state failure handling and task-status repair for the next Phase 13 task.
- Ran `npm test` successfully: 51 passed, 0 failed.
- Reviewer note: the remaining bug is the async error boundary in `runLoop`, not the Codex launch/result capture itself. `runLoop` is wrapped in `try/catch`, but it currently does `return withLock(..., async () => { ... throw new Error(...) })` instead of `return await withLock(...)`. Because the promise from `withLock` is returned without being awaited inside the local `try`, the rejection from the inner async callback escapes `fail(message(cause))` and Node prints a raw stack trace.
- Reviewer note: this is reproducible with `PATH=/usr/bin:/bin /Users/inotives/.nvm/versions/node/v24.16.0/bin/node dist/index.js loop --once`. Current behavior: exit status `1`, friendly missing-Codex text, plus a raw `file:///.../dist/tasks.js` stack trace. Expected behavior: exit status `1`, friendly stderr only, no Node stack trace.
- Reviewer note: the likely fix is only at the `runLoop` boundary: await `withLock(...)` inside the existing `try/catch` so non-zero Codex failures flow through `fail(message(cause))`. Keep the existing run-record behavior and failure-summary fields unchanged.
