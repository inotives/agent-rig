---
id: task-0016
title: "Phase 15: add compact loop status text"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0015
message: ""
---

# Task

## Context

Phase 15 plan: `docs/phases/phase-15-loop-observability.md`.

After the JSON model exists, plain `agent-rig status` should expose the same loop facts compactly.

## Goal

Add a compact loop section to text status output.

## Scope

- Extend plain `agent-rig status` output.
- Show lock state.
- Show next loop action.
- Show latest worker and reviewer run summaries.
- Keep text output compact and metadata-only.
- Do not print prompt text, stdout/stderr bodies, or `last-message.md` content.

## Planner Notes

- Text output should answer "what will the loop do next?" and "what happened last?"
- Full details should be reachable through run paths, not inlined in status.

## Implementation Plan

1. Reuse the JSON loop model from task 15.
2. Add a small `Loop:` section to `printStatus(...)`.
3. Format idle/missing/latest-run-null states cleanly.
4. Add text-output tests for lock, next action, latest runs, and idle.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Plain `agent-rig status` includes a compact `Loop:` section.
- [ ] Text output shows unlocked and locked states.
- [ ] Text output shows reviewer next action before worker next action.
- [ ] Text output shows worker next action when appropriate.
- [ ] Text output shows idle when no actionable task exists.
- [ ] Text output shows latest worker/reviewer run metadata only.

## Notes

