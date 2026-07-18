---
id: task-0018
title: "Phase 15: update loop observability docs"
type: doc
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0017
message: "Accepted: README and docs/tasks now document the actual Phase 15
  status contract by describing read-only loop observability in plain status,
  the top-level loop object in status --json, default worker/reviewer scope
  only, and run-path pointers for detailed artifacts without claiming stale-lock
  handling or cleanup; node dist/index.js status --help still only prints the
  existing usage line, so the user-facing contract lives in the updated docs;
  git diff --check passed."
---


# Task

## Context

Phase 15 plan: `docs/phases/phase-15-loop-observability.md`.

After implementation and deterministic tests, update user-facing docs so users know where to inspect loop state.

## Goal

Document loop observability in `agent-rig status`.

## Scope

- Update README/status docs where relevant.
- Explain that `agent-rig status` now includes compact loop observability.
- Explain that `agent-rig status --json` includes top-level `loop`.
- Document that status is read-only and uses default `worker`/`reviewer` names.
- Mention that run paths point to detailed local run artifacts.
- Do not document deferred custom agent flags as available.

## Planner Notes

- Keep docs short. This is a status enhancement, not a new workflow.
- Avoid promising stale-lock detection or cleanup.

## Implementation Plan

1. Search docs for current `agent-rig status` wording.
2. Update the minimum docs needed.
3. Verify help output if changed.
4. Run `git diff --check`.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] README or docs describe the loop section in `agent-rig status`.
- [ ] Docs mention `status --json` top-level `loop`.
- [ ] Docs state status is read-only.
- [ ] Docs state Phase 15 uses default `worker`/`reviewer` names.
- [ ] Docs do not claim stale-lock detection or cleanup.
- [ ] `git diff --check` passes.

## Notes

- Updated `README.md` to explain that `agent-rig status` is read-only and now includes compact Phase 15 loop observability for the default `worker` and `reviewer`.
- Documented that `agent-rig status --json` exposes the same derived data under a top-level `loop` object.
- Documented that detailed artifacts remain in local run paths under `.agent-rig/worker/runs/` and `.agent-rig/reviewer/runs/`.
- Updated the `agent-rig status` command summary in the README command table to mention loop observability.
- Updated the implementation phase summary in `README.md` to reflect active Phase 15 loop observability work.
- Added a short matching note in `docs/tasks.md` so the loop/task workflow docs point users to `status` for read-only loop inspection.
- Kept docs explicit that only the default `worker` and `reviewer` names are covered here and did not document stale-lock detection or cleanup.
- Verification:
  - `git diff --check`
