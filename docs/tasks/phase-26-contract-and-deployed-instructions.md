# Task: Update the planner-manager contract and deployed instructions

## Context

The current root and deployed instructions use mixed manager, planner, worker,
reviewer, and handoff terminology. Some deployed roles reference a missing
`.agent-rig/_shared/workflow.md` file.

## Goal

Make the canonical planner-manager, worker, reviewer, task-state, and handoff
contract consistent across root docs, deployed roles, shared context, and
profile templates.

## Scope

- `AGENTS.md`
- `INSTRUCTIONS.md`
- `.agent-rig/_shared/context.md`
- `.agent-rig/planner/`
- `.agent-rig/worker/`
- `.agent-rig/reviewer/`
- `templates/profiles/`
- `templates/workflow.md`
- Generated prompt documentation where needed

Do not change runtime behavior or historical SQLite records in this task.

## Planner Notes

- Keep `planner` as the profile and recipient token.
- Describe its role as `planner-manager`.
- Use task states `ready`, `in_progress`, `review`, `blocked`, and `done`.
- Use handoff decisions `review`, `changes_requested`, `approved`, and
  `blocked`.
- State that children do not start nested AgentRig loops.

## Implementation Plan

1. Remove references to the missing shared workflow file.
2. Define the direct worker-reviewer routing and planner authority.
3. Define the planner integrated-review repair cycle.
4. Regenerate or update the deployed profile templates.
5. Check all affected instructions for conflicting status or recipient terms.

## Acceptance Criteria

- [ ] All listed instruction sources use the same role and status vocabulary.
- [ ] Worker, reviewer, and planner-manager responsibilities are explicit.
- [ ] No listed deployed instruction requires a missing file.
- [ ] The instructions contain no Codex-only assumption.
- [ ] `git diff --check` passes.
