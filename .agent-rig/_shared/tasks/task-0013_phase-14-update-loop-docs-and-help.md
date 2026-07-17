---
id: task-0013
title: "Phase 14: update loop docs and help"
type: doc
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on:
  - task-0012
message: ""
---

# Task

## Context

Phase 14 plan: `docs/phases/phase-14-opencode-loop-adapter.md`.

After implementation and deterministic tests, update user-facing docs so the loop contract matches the new Codex/OpenCode behavior.

## Goal

Document OpenCode support for `agent-rig loop`.

## Scope

- Update README and task/workflow docs where they currently describe the loop as Codex-only.
- Update CLI help text if it still says or implies Codex-only behavior.
- Document that OpenCode uses its configured default model.
- Document that AgentRig does not pass `--model` or `--auto`.
- Document that live OpenCode smoke testing is manual and not CI.
- Do not add new runtime behavior in this task.

## Planner Notes

- Keep docs practical. Avoid long adapter architecture explanation.
- Make it clear that Claude is still unsupported by `agent-rig loop`.

## Implementation Plan

1. Search docs/help for stale Codex-only loop wording.
2. Update the minimal docs/help text needed for Phase 14.
3. Run docs-relevant tests or full `npm test`.
4. Run `git diff --check`.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] README describes Codex and OpenCode loop support.
- [ ] Docs no longer describe Phase 14 loop execution as Codex-only.
- [ ] Docs state OpenCode default model is used.
- [ ] Docs state AgentRig does not pass OpenCode `--model` or `--auto`.
- [ ] Docs say Claude loop execution is still unsupported.
- [ ] `git diff --check` passes.

## Notes

