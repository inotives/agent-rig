# Task: Add a provider-safe marker for manual planner final reviews

## Context

Task-0100 is the manually created Phase 26 final planner review. The workflow
store requires an explicit `planner_owned_final_review` marker before it accepts
a planner-to-planner approval as the completion trail.

Generated plan tasks already receive this marker. Manually created tasks have
no supported way to add it, so the planner must not use an administrative
override or mutate SQLite directly.

## Goal

Add a normal AgentRig CLI command that marks an eligible manual planner final
review for provider-neutral completion.

## Scope

- Add `agent-rig tasks mark-final-review <task-id>`.
- Validate that the task is assigned to `planner` and its title identifies a
  final review.
- Preserve all existing task metadata and update the marker through the active
  workflow store.
- Add CLI coverage for Markdown and SQLite providers, including rejection of
  ineligible tasks.
- Use the command to repair task-0100 after review.

## Planner Notes

Keep the command explicit and narrow. Do not weaken normal worker/reviewer
completion validation. Do not add an administrative bypass.

## Implementation Plan

1. Add the command to the task CLI help and dispatch.
2. Implement eligibility validation and provider-neutral metadata update.
3. Add focused CLI regression tests for both providers.
4. Build and run the focused and full test suites.
5. Mark task-0100, record the planner approval, and complete it normally.

## Acceptance Criteria

- [ ] The command marks an eligible planner final-review task in Markdown mode.
- [ ] The command marks an eligible planner final-review task in SQLite mode.
- [ ] The command rejects tasks not assigned to `planner` or without a final
      review title.
- [ ] Existing metadata remains unchanged.
- [ ] `npm test`, `npm run build`, and `git diff --check` pass.
- [ ] Task-0100 completes without `--admin-override`.

## Notes
