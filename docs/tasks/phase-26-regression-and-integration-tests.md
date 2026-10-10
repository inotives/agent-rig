# Task: Add planner-manager workflow regression coverage

## Context

The workflow contract spans prompts, task transitions, handoffs, child launch,
and dependency gating. Unit tests alone can miss a broken end-to-end sequence.

## Goal

Verify the complete planner-manager and worker-reviewer contract with focused
automated tests.

## Scope

- Prompt assembly tests.
- Task and handoff validation tests.
- Loop lifecycle tests.
- Launcher adapter tests with mocked executables.
- Dependency gating and retry tests.

## Planner Notes

- Use the current workflow store and CLI boundaries.
- Do not rewrite or normalize historical records in test setup.
- Claude tests must be mocked because Claude is not installed here.

## Implementation Plan

1. Add fixtures for the canonical task lifecycle.
2. Test worker review, reviewer findings, and re-review.
3. Test planner integrated findings and repair.
4. Test retryable child startup failure.
5. Test prompt inclusion and tool dispatch.
6. Run the full project verification suite.

## Acceptance Criteria

- [ ] The happy path passes.
- [ ] Reviewer findings return to the worker.
- [ ] Planner integration findings restart the pair.
- [ ] Dependencies stay blocked until completion.
- [ ] Startup failure remains retryable.
- [ ] Codex, OpenCode, and mocked Claude launcher tests pass.
- [ ] Full tests, typecheck, and build pass.
