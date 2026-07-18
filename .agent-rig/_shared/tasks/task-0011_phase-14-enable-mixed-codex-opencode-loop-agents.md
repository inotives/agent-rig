---
id: task-0011
title: "Phase 14: enable mixed Codex and OpenCode loop agents"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on:
  - task-0010
message: "Accepted: task 11 adds the missing mixed-tool acceptance coverage
  rather than changing loop behavior; tests now prove Codex worker plus OpenCode
  reviewer with review-first selection, OpenCode worker plus Codex reviewer,
  unsupported-tool rejection, and existing Codex/OpenCode loop behavior through
  the fake-tool PATH merge; node --test mixed-tool patterns passed (2), node
  --test OpenCode failure/runner patterns passed (4), npm test --
  --test-name-pattern='loop|opencode' passed (28), and git diff --check passed."
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

- The loop code already accepted `codex` and `opencode`; task 11 mainly needed acceptance coverage for mixed worker/reviewer combinations.
- Added a shared fake-OpenCode test helper and a `mergeEnv(...)` helper that keeps fake tool bins ahead of the system PATH so mixed-tool tests do not accidentally hit a real local `opencode`.
- Added coverage for:
  - Codex worker plus OpenCode reviewer, with review-first selection preserved.
  - OpenCode worker plus Codex reviewer.
  - Unsupported tools still failing with the Phase 14 validator message.
- Verification on July 17, 2026:
  - `node --test --test-name-pattern='loop accepts a codex worker with an opencode reviewer|loop accepts an opencode worker with a codex reviewer'`
  - `node --test --test-name-pattern='loop reviewer action invokes opencode run and writes run records|loop exits non-zero when opencode exits non-zero but still writes run records|loop fails clearly when opencode is not on PATH and still writes run records|loop rejects unsupported loop tools with a phase 14 message'`
