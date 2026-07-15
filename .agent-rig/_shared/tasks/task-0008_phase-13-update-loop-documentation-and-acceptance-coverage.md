---
id: task-0008
title: "Phase 13: update loop documentation and acceptance coverage"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-15
priority: normal
parent: ""
depends_on:
  - task-0007
---

# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

This task closes the phase by aligning docs, help text, and acceptance coverage with the implemented Codex-backed loop behavior.

## Goal

Document and verify the end-to-end Phase 13 worker-reviewer loop.

## Scope

- Update README command table and workflow text for `agent-rig loop`.
- Update task docs if needed to explain planner -> feature branch -> loop -> worker/reviewer flow.
- Ensure CLI help text matches implemented behavior.
- Add or tighten end-to-end-ish tests around:
  - fake Codex worker moves task to `review`,
  - fake Codex reviewer moves task to `done`,
  - fake Codex reviewer returns task to `ready`,
  - run records are written,
  - `watch --once` remains unchanged.
- Run full verification.
- Do not add new product behavior unless required to satisfy the documented Phase 13 acceptance criteria.

## Planner Notes

- Keep this as close-out, not a second implementation phase.
- The docs should be clear that Phase 13 is Codex-only and does not support Claude/OpenCode execution yet.
- Mention that branch creation remains manual/outside `agent-rig loop`.

## Implementation Plan

1. Review README, docs/tasks.md, and CLI help for stale watch-only wording.
2. Update docs to describe the new loop workflow and Codex-only boundary.
3. Add final acceptance tests using fake Codex.
4. Run `npm test`.
5. Run `git diff --check`.
6. Set this task to `review` with the final verification summary.

## Acceptance Criteria

- [ ] README documents `agent-rig loop`.
- [ ] Docs explain the standard workflow after planner creates ready tasks.
- [ ] Docs say branch creation remains outside the loop.
- [ ] Docs say Phase 13 loop execution is Codex-only.
- [ ] Tests cover worker -> review -> reviewer -> done using fake Codex.
- [ ] Tests cover reviewer returning a task to `ready`.
- [ ] Tests prove `watch --once` behavior remains unchanged.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.

## Notes
