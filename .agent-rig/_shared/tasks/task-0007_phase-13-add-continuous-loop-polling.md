---
id: task-0007
title: "Phase 13: add continuous loop polling"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-16
priority: normal
parent: ""
depends_on:
  - task-0006
message: "Accepted: loop now runs continuously by default while preserving
  --once; 60-second default waits and --interval overrides are covered by
  bounded continuous-mode tests; review work still wins before worker work on
  each tick; loop.lock cleanup verified by tests after bounded completion; npm
  test passed (57)."
---


# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

The one-shot loop is useful for tests and scripting, but the user-facing workflow is `agent-rig loop` running continuously after phase planning is complete.

## Goal

Add continuous polling mode for `agent-rig loop`.

## Scope

- Make `agent-rig loop` run continuously by default.
- Keep `agent-rig loop --once` as a single tick.
- Default polling interval is 60 seconds.
- `--interval <seconds>` overrides the interval.
- When no review or ready worker task exists, continuous mode waits and polls again.
- Handle interrupt/cleanup so `.agent-rig/_shared/loop.lock` is removed when possible.
- Keep polling sequential; do not run worker and reviewer in parallel.
- Do not add file-system watch events in this phase.

## Planner Notes

- Tests should use a small interval or a test seam; do not make tests wait 60 seconds.
- Continuous mode should be boring and deterministic.

## Implementation Plan

1. Add the continuous loop around the existing one-shot tick.
2. Add interval parsing/validation.
3. Ensure lock lifetime covers the continuous process.
4. Add signal or finally cleanup where practical.
5. Add tests for default continuous behavior through a bounded test seam and interval override.
6. Run `npm test`.

## Acceptance Criteria

- [ ] `agent-rig loop --once` still runs exactly one tick.
- [ ] `agent-rig loop` defaults to continuous mode.
- [ ] Continuous mode uses a 60 second default interval.
- [ ] `--interval <seconds>` changes the polling interval.
- [ ] Continuous mode waits when no task is actionable.
- [ ] Continuous mode processes review work before worker work on each tick.
- [ ] Lock cleanup still occurs after normal bounded/test completion.
- [ ] `npm test` passes.

## Notes

- Replaced the one-shot-only placeholder in `src/tasks.ts` with a real
  continuous polling loop that keeps the existing review-first task selection
  and worker/reviewer execution semantics.
- Kept `agent-rig loop --once` as a single tick by factoring the existing tick
  body into `runLoopTick(...)` and reusing it from both one-shot and continuous
  mode.
- Added the smallest test seam needed for continuous-mode coverage:
  `AGENT_RIG_LOOP_MAX_TICKS` bounds the loop during tests and
  `AGENT_RIG_LOOP_INTERVAL_MS` shrinks the actual sleep without changing the
  user-facing interval contract.
- Added `Waiting <seconds> before next poll.` logging so the configured
  interval is observable and testable without a long real wait.
- Updated lock handling so the loop still cleans up `.agent-rig/_shared/loop.lock`
  on normal exit and also removes it on `SIGINT` / `SIGTERM` when possible.
- Extended the fake Codex harness to record every invocation and support
  per-call status sequences, which lets the tests prove continuous review-first
  behavior across multiple ticks.
- Added continuous loop tests for default polling, `--interval` override, and
  review-before-worker ordering across ticks while preserving the existing
  one-shot and failure-path coverage.
- Ran `npm test` successfully: 57 passed, 0 failed.
