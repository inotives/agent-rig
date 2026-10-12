# Phase 28: Planner-Mediated Direct Execution

Status: planning

## Objective

Replace the unreliable AgentRig loop as the supported implementation and
review workflow with planner-mediated direct worker and reviewer execution.

AgentRig remains the task, handoff, prompt, and audit store. The planner
launches provider-specific headless sub-agents and remains the only workflow
state writer.

Investigation evidence is recorded in:

`docs/reports/planner-mediated-direct-execution-investigation.md`

## Accepted decisions

- The planner selects one task and launches one worker, then one independent
  reviewer.
- The planner records worker and reviewer handoffs and owns task transitions.
- The worker and reviewer return handoff content. They do not mutate SQLite or
  task status directly.
- `agent-rig tasks prompt <task-id> --agent <worker|reviewer>` is a read-only,
  fail-closed prompt generator.
- Prompts use complete role instructions, shared context, the task brief, and
  only the latest relevant handoffs. The target is 4,000 to 6,000 tokens with
  an 8,000-token soft limit.
- Human findings use `human -> planner: changes_requested`. The planner sends
  a focused `planner -> worker: changes_requested` handoff.
- Planner final approval is recorded through task completion evidence, not a
  `planner -> planner` self-handoff.
- The planner's integrated review and the human final review are separate
  gates. The planner verifies the implementation; the human verifies the
  end-to-end result and accepts the phase. Human findings use the normal
  `human -> planner: changes_requested` route.
- Normal task editing and incident repair are separate operations.
- `tasks repair` is planner-only, requires a reason, preserves audit history,
  and cannot mark a task done.
- Child failure does not trigger automatic retry. The planner keeps the task
  eligible, saves diagnostic output, and decides whether to retry or ask the
  human.
- Codex is implemented first with `workspace-write` and `--approve-for-me`.
  Claude and OpenCode remain agent-agnostic adapter contracts until live tools
  are available.
- The planner resolves the child workspace from the deployed project's
  repository root. It must not use the AgentRig source checkout as a default.
  Worker and reviewer use the same project workspace so the reviewer can inspect
  the worker's diff.
- The provider launch must apply the provider's workspace policy directly. It
  must not wrap a Codex child in the project macOS `sandbox-run.sh` runner.
- `agent-rig loop` remains temporarily available as a deprecated diagnostic
  command. It is not part of the supported workflow or generated instructions.
- Existing deployments receive a safe upgrade command that backs up the
  deployment, updates instructions, validates state, and does not launch
  agents.
- After each task passes review and the planner marks it `done`, the planner
  must commit the completed task changes before selecting or starting the next
  task. A failed or unverified commit keeps the next task blocked.

## Workflow

```text
planner -> worker -> planner -> reviewer -> planner
                       ^                  |
                       +-- changes_requested
```

Task transitions:

```text
ready -> in_progress -> review -> done
                          |
                          +-> in_progress
```

The planner uses `blocked` only for a real task or environment blocker.

Worker outcomes:

```text
review -> reviewer
blocked -> planner
```

Reviewer outcomes:

```text
approved -> planner
changes_requested -> worker
blocked -> planner
```

## Implementation slices

1. Add the shared planner-mediated workflow contract and role instructions.
2. Add the fail-closed prompt generation command.
3. Add planner-only task editing and incident repair for both providers.
4. Add the human review route and remove the planner self-handoff contract.
5. Document the Codex headless launch and provider adapter boundary.
6. Add the safe upgrade command for existing deployments.
7. Deprecate the loop in help and supported documentation.
8. Add unit, integration, and isolated live worker/reviewer coverage.
9. Add and verify the planner commit gate between completed tasks.

## Acceptance criteria

- The planner can generate worker and reviewer prompts without mutating state.
- Prompt output contains the required role, context, task, handoff, and outcome
  contract within the context budget.
- Worker and reviewer output uses the standard Markdown handoff format.
- Only the planner writes task state and canonical handoffs in the new flow.
- Human findings route through the planner to the worker.
- Invalid state stops safely and `tasks repair` restores valid state with a
  reason without losing audit history.
- Existing deployments upgrade with a backup and no agent launch.
- Supported generated instructions contain no `agent-rig loop` launch step.
- The old loop is marked diagnostic and deprecated.
- Codex runs without an approval prompt inside `workspace-write`.
- A deployed AgentRig instance launches worker and reviewer in the current
  project's repository root, independent of where AgentRig itself was built or
  installed.
- The launch path does not nest the provider sandbox inside
  `.agent-rig/_shared/tools/sandbox-run.sh`.
- The phase is not complete until the planner integrated review passes and the
  human final acceptance check is recorded.
- The next task never starts before the previous task's completed changes have
  a verified planner commit.

## Out of scope

- Deleting the existing loop implementation in this phase.
- Live Claude or OpenCode validation without those tools installed and
  authenticated.
- Automatic retries after child failure.
- A new orchestration wrapper that owns the worker/reviewer cycle.
