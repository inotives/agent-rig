---
id: task-0012
title: "Phase 14: add fake OpenCode coverage"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0011
message: "Accepted: task 12 completes the deterministic fake OpenCode coverage
  by adding the missing worker happy-path test while keeping reviewer,
  mixed-tool, missing-executable, and non-zero-exit coverage in place; tests now
  assert opencode run --dir --file --title, no --model, no --auto, prompt-file
  usage, stdout-backed last-message.md, and result.json tool/args fields for
  both worker and reviewer paths; npm test passed (64) and git diff --check
  passed."
---


# Task

## Context

Phase 14 plan: `docs/phases/phase-14-opencode-loop-adapter.md`.

Fake tests are required for deterministic coverage. They are not sufficient for final phase acceptance, but they should cover the normal and failure paths.

## Goal

Add deterministic fake OpenCode tests for the Phase 14 loop behavior.

## Scope

- Add a fake `opencode` executable test helper or extend the existing fake-tool helper.
- Test OpenCode worker execution on a ready task.
- Test OpenCode reviewer execution on a review task.
- Test mixed Codex worker plus OpenCode reviewer behavior.
- Test missing OpenCode and non-zero OpenCode failure paths.
- Assert command args, attached prompt file usage, stdout capture, and run records.

## Planner Notes

- Do not require real OpenCode auth in automated tests.
- Keep fake OpenCode behavior similar to fake Codex where practical.
- Assert that `--model` and `--auto` are absent from command args.

## Implementation Plan

1. Add fake OpenCode PATH injection for tests.
2. Write tests for worker, reviewer, mixed-tool, missing-executable, and non-zero exit paths.
3. Assert `result.json` includes `tool: "opencode"` and OpenCode command args.
4. Assert `last-message.md` is populated from stdout.
5. Run `npm test`.
6. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Fake OpenCode worker test passes.
- [ ] Fake OpenCode reviewer test passes.
- [ ] Fake mixed Codex-worker/OpenCode-reviewer test passes.
- [ ] Missing OpenCode test passes.
- [ ] Non-zero OpenCode exit test passes.
- [ ] Tests assert OpenCode args omit `--model` and `--auto`.
- [ ] `npm test` passes.

## Notes

- Added and reused a fake `opencode` test helper so OpenCode loop coverage stays deterministic and does not require real auth.
- Added a dedicated fake OpenCode worker happy-path test asserting:
  - `opencode run --dir <repo-root> --file <prompt.md> --title ...`
  - no `--model`
  - no `--auto`
  - prompt file usage
  - stdout capture into `last-message.md`
  - `result.json` with `tool: "opencode"` and command args
- Kept fake OpenCode reviewer, mixed Codex-worker/OpenCode-reviewer, missing-executable, and non-zero-exit tests in coverage.
- Verification on July 18, 2026: `npm test` passed with 64 tests.
