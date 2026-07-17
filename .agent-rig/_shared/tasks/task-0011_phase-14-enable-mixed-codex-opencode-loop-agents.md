---
id: task-0011
title: "Phase 14: enable mixed Codex and OpenCode loop agents"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on:
  - task-0010
message: ""
---

# Task

## Context

Phase 14 plan: `docs/phases/phase-14-opencode-loop-adapter.md`.

The loop currently rejects non-Codex agents. Phase 14 should allow Codex and OpenCode in any worker/reviewer combination.

## Goal

Allow `agent-rig loop` to run mixed Codex/OpenCode worker and reviewer agents.

## Scope

- Replace the Codex-only loop validation with Codex-or-OpenCode validation.
- Keep unsupported tools failing clearly.
- Allow Codex worker plus OpenCode reviewer.
- Allow OpenCode worker plus Codex reviewer.
- Allow OpenCode worker plus OpenCode reviewer.
- Preserve review-first task selection.

## Planner Notes

- Do not add Claude support in this phase.
- Do not change `agent-rig watch --once`.
- Mixed-tool support is the main user-facing value of this phase.

## Implementation Plan

1. Update loop agent validation to allow `codex` and `opencode`.
2. Route each selected agent by its configured `tool`.
3. Keep existing stale-status blocking behavior for worker and reviewer roles.
4. Add or adjust tests for mixed-tool combinations.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] `agent-rig loop --once` accepts a Codex worker and OpenCode reviewer.
- [ ] `agent-rig loop --once` accepts an OpenCode worker and Codex reviewer.
- [ ] Unsupported tools still fail before the loop starts.
- [ ] Review tasks still run before new worker tasks.
- [ ] Existing Codex-only loop behavior still works.

## Notes

