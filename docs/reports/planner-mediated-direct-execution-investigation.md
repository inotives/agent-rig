# Planner-Mediated Direct Execution Investigation

Status: investigation on `feature/investigate-loop-workflow`

## Finding

`agent-rig loop` is not reliable enough to be the primary implementation and
review workflow for this repository.

The proven workflow in `ino-ai` keeps the planner as the only task-state
manager. The planner launches one worker, reads the worker handoff, launches
one independent reviewer, and applies the reviewer decision. AgentRig stores
the task state and handoffs, but does not control the whole implementation
cycle through a wrapper loop.

## Evidence

- The runner can report `No actionable loop task` while phase work still
  exists.
- Child worker or reviewer startup can fail before a useful handoff exists.
- Child prompts and local role context are not always propagated reliably.
- A failed or interrupted child can leave task state that needs manual repair.
- A reviewer launch in an isolated reproduction ran for two minutes without a
  result and had to be interrupted.
- The current Codex launch includes `workspace-write` but no non-interactive
  approval setting. A headless Codex process can therefore wait for approval.
- The installed Codex CLI exposes `--approve-for-me`, which keeps the sandbox
  and routes eligible approvals through automatic review.

## Supported workflow direction

The planner should launch sub-agents directly and own all task-state changes:

```text
planner -> worker -> planner -> reviewer -> planner
                       ^                  |
                       +-- changes_requested
```

The worker and reviewer must receive a standard prompt contract containing:

1. Agent identity and role.
2. Repository root and active workflow provider.
3. Complete local role instructions.
4. Shared project context.
5. Task brief and acceptance criteria.
6. Relevant current handoffs.
7. Current diff or review scope.
8. The permitted task transition.
9. The exact handoff command and recipient.
10. A prohibition on starting a nested AgentRig loop.

The role contract remains agent-agnostic. Provider-specific approval and
sandbox flags belong to the planner launch command.

## Accepted prompt boundary

AgentRig will expose a read-only prompt command for the planner:

```sh
agent-rig tasks prompt <task-id> --agent <worker|reviewer>
```

The command will print the complete role prompt to stdout. It will not launch
an agent or mutate task state. The planner will pipe that prompt to the
provider-specific headless CLI and will perform all task-state mutations.

The command will fail closed when the task is not valid for the requested role.
Workers require an assigned eligible task. Reviewers require a `review` task
with a worker handoff. A worker repair prompt may include the latest reviewer
findings.

Prompts use progressive disclosure. They include complete role instructions,
shared context, the task brief, and only the latest relevant handoffs. They do
not include unrelated history or the full repository diff. The target is
approximately 4,000 to 6,000 tokens, with an 8,000-token soft limit.

The reviewer returns the handoff content to the planner instead of writing the
workflow store directly. The planner records the result as the canonical
reviewer handoff and performs the task-state transition. This keeps reviewer
repository access read-only while preserving the reviewer sender and decision
in the audit trail.

Reviewer results use a small provider-neutral Markdown handoff template with a
decision, recipient, summary, findings, evidence, and requested action. The
planner validates the decision and recipient before recording the message.

The worker also returns its handoff content to the planner. The planner records
the `worker -> reviewer: review` handoff and changes the task to `review`.
Workers and reviewers do not mutate workflow state directly.

Planner final approval is recorded as task completion with final-review
evidence. The new contract does not use a `planner -> planner` self-handoff.

The planner owns task transitions: `ready -> in_progress` before worker
launch, `in_progress -> review` after a valid worker result, `review -> done`
after reviewer approval and planner checks, `review -> in_progress` after
review findings, and `blocked` only for a real blocker.

Normal task changes and incident recovery are separate operations. A planner
uses `tasks edit` for task fields such as body, title, priority, phase,
assignment, and dependencies. A planner uses a reasoned, planner-only
`tasks repair` operation for invalid lifecycle state. Repair preserves all
handoffs and audit fields and cannot mark a task done.

Existing deployments need a safe upgrade command. It backs up `.agent-rig`,
updates planner, worker, reviewer, and shared workflow instructions, preserves
workflow data and local assets, validates the result, and reports invalid task
state. It does not launch agents or a loop.

The existing `agent-rig loop` command remains temporarily available as a
deprecated diagnostic command. It is removed from generated instructions and
supported workflows. Its eventual removal waits for live planner-mediated
worker and reviewer coverage.

## Planning location

The accepted implementation plan and acceptance criteria are in:

`docs/phases/phase-28-planner-mediated-direct-execution.md`

## Accepted human-review route

Human review findings use an explicit `human -> planner` handoff with the
`changes_requested` status. The planner converts the finding into a focused
`planner -> worker` handoff, sets the task to `in_progress`, and starts the
normal worker and reviewer repair cycle.

## Accepted child-failure policy

The planner does not retry a child automatically. If a child exits without a
handoff or exceeds its timeout, the planner does not mark the task done. It
keeps the task in its current eligible state, saves command output as a
diagnostic artifact, and decides whether to retry or ask the human. The
planner uses `blocked` only for a real task or environment blocker.

For the installed Codex CLI, the worker launch must use a non-interactive
approval mode such as:

```sh
codex exec --ephemeral --ignore-user-config \
  --cd <repo> --sandbox workspace-write --approve-for-me -
```

## Scope boundary

This report does not delete or change the existing loop implementation. The
loop remains available for diagnostic experiments until the replacement flow
has prompt, handoff, failure, and live worker/reviewer coverage.

No phase document or existing phase decision is changed by this investigation.

## Open decisions

- The exact standard prompt format for worker and reviewer sessions.
- Whether every child launch needs a durable run record in addition to task
  state and handoffs.
- The provider-specific non-interactive settings for Claude and OpenCode.
- The deprecation message and eventual removal policy for `agent-rig loop`.
