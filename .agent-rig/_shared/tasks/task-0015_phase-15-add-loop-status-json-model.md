---
id: task-0015
title: "Phase 15: add loop status JSON model"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-18
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on: []
message: "Accepted: status --json now adds the read-only loop object with
  loop.lock, loop.next_action, and latest default worker/reviewer run summaries;
  implementation mirrors existing loop priority by preferring review tasks
  before dependency-ready ready worker tasks and returns null for malformed
  latest run records instead of failing status output; npm test --
  --test-name-pattern='status lists agents|status --json reports loop lock'
  passed (2), npm test passed (65), node dist/index.js validate returned only
  expected downstream dependency warnings for tasks 0016-0019, and git diff
  --check passed."
---


# Task

## Context

Phase 15 plan: `docs/phases/phase-15-loop-observability.md`.

`agent-rig status --json` currently reports session, queues, agents, and handoffs. Phase 15 adds read-only loop observability derived from existing tasks, lock file, and run records.

## Goal

Add the top-level `loop` object to `agent-rig status --json`.

## Scope

- Implement the JSON model in `src/live.ts`.
- Add `loop.lock` reporting from `.agent-rig/_shared/loop.lock`.
- Add next-action calculation for default `worker` and `reviewer`.
- Add latest run summaries for default `worker` and `reviewer`.
- Keep behavior read-only.
- Do not change `agent-rig loop` behavior.
- Do not add status flags for custom worker/reviewer names.

## Planner Notes

- Mirror loop priority: review task first, then dependency-ready ready task assigned to `worker`, then idle.
- Use `null` for missing or malformed latest run data.
- Do not read or inline prompt/last-message content.

## Implementation Plan

1. Inspect current `statusModel(...)` and local task/run parsing helpers.
2. Add a `loop` object to the status JSON model.
3. Parse `loop.lock` as existence plus raw pid text only.
4. Derive next action from shared task files without mutating them.
5. Read latest run `result.json` for `worker` and `reviewer`.
6. Add JSON-focused tests.
7. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] `agent-rig status --json` includes top-level `loop`.
- [ ] `loop.lock` reports `locked`, `pid`, and path.
- [ ] `loop.next_action.kind` is `review`, `worker`, or `idle`.
- [ ] Review tasks take priority over ready worker tasks.
- [ ] Ready worker tasks are dependency-aware.
- [ ] `loop.latest_runs.worker` and `.reviewer` summarize latest run metadata or `null`.
- [ ] Missing or malformed run records do not fail `agent-rig status --json`.

## Notes

- Implemented the top-level `loop` object in `src/live.ts` without changing `agent-rig loop` behavior.
- `loop.lock` now reports `locked`, trimmed pid text, and `.agent-rig/_shared/loop.lock`.
- `loop.next_action` mirrors loop priority: deterministic first `review` task, otherwise first dependency-ready `ready` task assigned to default `worker`, otherwise `idle`.
- `loop.latest_runs.worker` and `.reviewer` read only the latest default run directory and expose metadata fields plus run path.
- Missing or malformed `result.json` now returns `null` for the affected latest run summary instead of failing `status --json`.
- Added JSON coverage in `test/init.test.mjs` for default idle state, review-before-worker priority, dependency-aware worker fallback, lock reporting, and malformed reviewer run data.
- Verification:
  - `npm test -- --test-name-pattern='status lists agents|status --json reports loop lock'`
  - `npm test`
  - `node dist/index.js validate`
  - `git diff --check`
