# Phase 26: Planner-Manager Worker-Reviewer Contract

## Objective

Make the deployed planner, worker, and reviewer workflow match the approved
planner-manager design. The planner is the main agent and manager. Worker and
reviewer agents are atomic child agents for one task.

## Accepted decisions

- Keep the `planner` profile and recipient token. Its role is
  `planner-manager`.
- Worker and reviewer communicate directly through handoffs.
- The planner owns task selection, claims, retries, completion, blocking, and
  dependency unblocking.
- Worker and reviewer may perform only their stage transitions. Neither child
  may complete a task or unblock a dependency.
- Task states remain `ready`, `in_progress`, `review`, `blocked`, and `done`.
- Handoff decisions are `review`, `changes_requested`, `approved`, and
  `blocked`.
- Worker sends `review` to reviewer.
- Reviewer sends `changes_requested` to worker when it finds a problem.
- Planner sends `changes_requested` to worker when integrated review finds a
  problem.
- Reviewer sends `approved` to planner after a clean task review.
- Planner performs the final integrated review. A finding starts another
  worker-reviewer repair cycle.
- A loop tick processes one lifecycle transition for one task.
- Child startup and permission failures are infrastructure failures. They keep
  the task retryable and must not mark it `blocked`.
- Instructions are tool-agnostic. The runtime selects a launcher from the
  profile tool. Claude support is implemented with mocked tests; live Claude
  execution is deferred to the next phase.
- Existing SQLite tasks and handoffs remain historical records. New mutations
  use the canonical vocabulary and routing rules.

## Scope

### In scope

- Root workflow documentation and deployed role instructions.
- Profile templates and generated prompt context.
- Loop lifecycle handling and retryable child-process failures.
- Profile-based Codex, OpenCode, and Claude launchers.
- Role-aware task transitions and handoff validation.
- Upgrade instructions for existing `.agent-rig/` deployments.
- Unit, integration, and mocked launcher tests.

### Out of scope

- Rewriting historical SQLite task or handoff records.
- An automated `agent-rig upgrade` command.
- Live Claude smoke testing.
- A separate `manager` profile.
- A new task state for integration fixes.

## Implementation slices

1. Update the canonical contract, deployed instructions, templates, and shared
   context.
2. Make loop ticks and child failures follow the contract.
3. Add profile-based launchers for Codex, OpenCode, and Claude.
4. Enforce new handoff and role-specific transition rules.
5. Document the safe upgrade path for older deployments and legacy history.
6. Add regression and integration coverage.
7. Support planner-owned completion for the final integrated-review task.
8. Perform the final planner integration review across the complete diff.

## Acceptance criteria

- [x] The generated planner, worker, and reviewer prompts contain the same
  planner-manager contract.
- [x] No deployed instruction requires the missing `_shared/workflow.md` file.
- [x] The worker-reviewer happy path and repair path use the canonical handoff
  decisions.
- [x] Planner integrated findings restart the worker-reviewer pair.
- [x] Planner marks a task `done` only after reviewer approval and its own final
  check.
- [x] The planner can complete the explicit final integrated-review task without
  fabricating worker or reviewer handoffs.
- [x] Downstream tasks stay blocked until their dependencies are done.
- [x] Child startup failures leave tasks retryable and record the error.
- [x] Invalid new recipients, decisions, and role transitions are rejected.
- [x] Historical records remain readable and are not rewritten.
- [x] Codex, OpenCode, and mocked Claude launchers pass tests.
- [x] Older deployed `.agent-rig/` folders have a documented, backup-first upgrade
  procedure.
- [x] Tests, typecheck, build, and diff checks pass.

## Completion evidence

- `npm test`: 281 tests passed.
- Live Codex worker run completed task-0102 and left it in `review`.
- Live Codex reviewer run approved task-0102.
- Planner completed task-0102 after reviewer approval.
- The child runtime uses an ephemeral Codex session, isolated temporary home,
  existing `auth.json`, and ignores user config to avoid PATH-alias startup
  failures.
- Network and permission failures remain retryable and record their evidence.

## Deferred verification

Run a live Claude loop smoke test in the next phase on a machine with Claude
installed and authenticated.
