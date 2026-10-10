# Task: Support planner-owned final-review completion

## Context

SQLite completion currently requires the latest worker and reviewer handoffs.
Phase 26 intentionally assigns the final integrated-review task to the
planner-manager, so that task must have a truthful completion path.

## Goal

Allow the planner-manager to complete the explicit final integrated-review task
after recording its own approved planner handoff.

## Scope

- Workflow completion validation.
- Final integrated-review task metadata or role handling.
- SQLite and Markdown parity where both providers support completion.
- Regression tests.

Do not weaken normal worker task completion requirements.

## Planner Notes

- Normal implementation tasks still require worker `review` followed by
  reviewer `approved`.
- Only the explicit planner-owned final integrated-review task may use the
  planner completion path.
- Do not use `--admin-override`.
- Do not fabricate worker or reviewer handoffs.

## Implementation Plan

1. Identify the smallest explicit marker for a planner-owned final review.
2. Accept an approved planner handoff only for that marked task.
3. Keep normal task completion validation unchanged.
4. Add SQLite and Markdown regression coverage where applicable.
5. Verify the final task can complete through the normal CLI.

## Acceptance Criteria

- [ ] A marked planner-owned final-review task completes after an approved
      planner handoff.
- [ ] A normal task cannot complete from a planner-only handoff.
- [ ] No administrative override is required.
- [ ] SQLite and Markdown behavior is consistent.
- [ ] Focused and full tests pass.
