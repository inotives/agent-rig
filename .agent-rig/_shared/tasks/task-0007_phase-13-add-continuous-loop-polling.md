---
id: task-0007
title: "Phase 13: add continuous loop polling"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-15
priority: normal
parent: ""
depends_on:
  - task-0006
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
