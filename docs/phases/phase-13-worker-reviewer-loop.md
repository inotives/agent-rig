# Phase 13: Worker-Reviewer Loop

## Goal

Add a real Codex-backed worker-reviewer loop for AgentRig-managed phase work.

After the planner finalizes phase docs and creates ready worker tasks, the human should be able to start a phase feature branch and run:

```bash
agent-rig loop
```

The loop should run the configured worker and reviewer through headless Codex sessions until phase tasks are either done or blocked.

## Scope

- Add a new `agent-rig loop` CLI command.
- Support Codex headless execution for agents whose `agent.toml` has `tool = "codex"`.
- Run worker and reviewer from the repo root using `codex exec`.
- Coordinate the existing shared task lifecycle:
  - worker claims `ready` tasks,
  - worker sends completed implementation to `review`,
  - reviewer marks accepted work `done`,
  - reviewer returns rejected work to `ready` with notes,
  - blocked work becomes `blocked`.
- Prompt-enforce AgentRig-local skills and tools for each headless Codex run.
- Add one-shot and continuous loop modes.
- Record enough run output to debug what each headless Codex invocation did.
- Update docs and tests for the new workflow.

## Out Of Scope

- Claude or OpenCode execution.
- A generic multi-tool adapter abstraction.
- Dangerous sandbox bypass mode.
- Automatic git branch creation, switching, committing, pushing, or PR creation.
- Native Codex MCP/function-tool mounting for `.agent-rig/<agent>/tools/`.
- Automatic interpretation of reviewer prose without task status changes.
- Parallel worker/reviewer execution.
- Multi-machine locking or distributed coordination.

## CLI Contract

Default continuous loop:

```bash
agent-rig loop
```

One-shot loop tick:

```bash
agent-rig loop --once
```

Agent selection:

```bash
agent-rig loop --worker worker --reviewer reviewer
```

Polling:

```bash
agent-rig loop --interval 60
```

Defaults:

- `--worker worker`
- `--reviewer reviewer`
- `--interval 60`
- no `--once` means continuous mode

## Loop Behavior

The loop uses `.agent-rig/_shared/tasks/*.md` as the source of truth.

Each loop tick:

1. Refuses to start if `.agent-rig/_shared/loop.lock` already exists.
2. Looks for the first deterministic task with `status: review`.
3. If a review task exists, runs the reviewer agent on that task.
4. If no review task exists, finds the next dependency-ready task with:
   - `status: ready`
   - `assigned_to: <worker>`
5. Claims the worker task by setting `status: in_progress`.
6. Runs the worker agent on that task.
7. Exits after one tick in `--once` mode.
8. Sleeps for `--interval` seconds and repeats in continuous mode.

Review has priority over claiming more worker work. This keeps the feedback loop tight and avoids piling up unreviewed implementation tasks.

## Task State Contract

The existing task statuses stay unchanged:

```text
todo -> ready -> in_progress -> review -> done
             \-> blocked
review -> ready
review -> blocked
```

Worker responsibilities:

- Read the task file and phase docs.
- Implement only the assigned task.
- Run focused checks.
- Set the task to `review` when ready for reviewer.
- Set the task to `blocked` with a clear reason if it cannot continue.

Reviewer responsibilities:

- Review against the task file, phase docs, and current repo behavior.
- If accepted, set the task to `done`.
- If fixes are needed, write findings into the task `## Notes` section and set the task back to `ready`.
- If blocked by missing intent or external state, set the task to `blocked`.

No new review metadata is added in Phase 13. Reviewer result state is represented by task notes plus task status.

## Codex Execution Contract

Phase 13 supports only `tool = "codex"`.

Each agent run uses headless Codex:

```bash
codex exec -C <repo-root> --sandbox workspace-write --ask-for-approval never -
```

The prompt is passed through stdin. AgentRig should also capture the final message with `--output-last-message <path>` when available.

Do not use:

```bash
--dangerously-bypass-approvals-and-sandbox
```

If the selected worker or reviewer is not configured with `tool = "codex"`, `agent-rig loop` fails clearly and says Phase 13 supports Codex only.

## Prompt Assembly

Each headless prompt must be self-contained. It should include:

- the agent name, role, and task id,
- the current task file path and task body,
- `.agent-rig/_shared/context.md`,
- `.agent-rig/<agent>/instructions.md`,
- `.agent-rig/<agent>/context.md`,
- the relevant phase doc path when it can be inferred from the task title/body,
- explicit task lifecycle instructions for worker or reviewer,
- explicit instructions to leave the task in `review`, `ready`, `done`, or `blocked`.

Skill and tool precedence must be included in every prompt:

1. Read applicable skills from `.agent-rig/<agent>/skills/` first.
2. Then read applicable shared skills from `.agent-rig/_shared/skills/`.
3. Use global Codex skills only when no AgentRig-local skill applies.
4. Check `.agent-rig/<agent>/tools/` before `.agent-rig/_shared/tools/`.
5. Do not assume a project-local tool exists unless an actual file or script exists there.

This is prompt-enforced. Phase 13 does not make `.agent-rig/<agent>/tools/` native Codex MCP/function tools.

## Run Records

For each Codex invocation, write a run record under:

```text
.agent-rig/<agent>/runs/<run-id>/
```

Minimum files:

- `prompt.md`
- `result.json`
- `last-message.md`

`result.json` should include:

- agent name,
- role,
- tool,
- task id,
- command arguments,
- exit status,
- started and finished timestamps,
- final task status after the run.

The run record is the debug artifact for headless execution. Routine worker-reviewer transitions should still be captured in task status and task notes, not handoff logs.

## Locking And Failure Behavior

- Use `.agent-rig/_shared/loop.lock`.
- Remove the lock on normal exit and interrupt when possible.
- If Codex exits non-zero, mark the task `blocked` with the failure summary.
- If the worker finishes but leaves the task `in_progress`, mark it `blocked` because the loop cannot know whether the implementation is ready.
- If the reviewer finishes but leaves the task `review`, mark it `blocked` because the loop cannot infer acceptance or rejection.
- If no review task or ready worker task exists, continuous mode waits for the next poll; `--once` prints that no actionable task exists and exits zero.

## Accepted Decisions

### Phase 13 Runs Real Codex Sessions

The loop should run worker and reviewer, not only print coordination hints.

The first supported execution target is Codex headless mode because local Codex supports `codex exec` and the immediate workflow needs Codex-run worker/reviewer agents.

### Codex First, No Generic Adapter Yet

Do not add a generic adapter seam in Phase 13.

A direct Codex implementation is smaller, easier to verify, and enough to prove the workflow. Claude, OpenCode, and custom tool adapters can be added after the Codex loop is stable.

### Branch Setup Stays Outside The Loop

The human or planner starts the phase feature branch before running `agent-rig loop`.

The loop must not create branches, switch branches, commit, push, or open PRs. Git automation is a later phase.

### Workspace Sandbox, No Dangerous Bypass

Run Codex with workspace-write sandboxing and no interactive approvals.

This keeps the loop non-interactive while avoiding full sandbox bypass as a default project workflow.

### AgentRig Skills And Tools Are Prompt-Enforced

Codex does not automatically treat `.agent-rig/<agent>/skills/` and `.agent-rig/<agent>/tools/` as native global skills or function tools.

AgentRig must therefore inject explicit local skill/tool precedence into each prompt and require the running Codex agent to inspect those paths before acting.

### Review Result Uses Task Notes And Status

Reviewer outcome is represented by existing task artifacts:

- accepted: `status: done`
- needs fixes: findings in `## Notes`, then `status: ready`
- blocked: `status: blocked` plus blocker reason

No review result fields or separate review files are added in this phase.

### Review Work Has Priority

When both review work and ready worker work exist, `agent-rig loop` runs reviewer first.

This keeps feedback close to the implementation and reduces stale rework.

### Continuous Mode Is The Default

`agent-rig loop` runs continuously by default with a 60 second interval.

`--once` exists for deterministic tests, scripting, and manual single-step operation.

## Acceptance Criteria

- `agent-rig loop --help` documents the loop command, defaults, and flags.
- `agent-rig loop --once` runs the reviewer when a task is in `review`.
- `agent-rig loop --once` claims and runs the next dependency-ready worker task when no review task exists.
- `agent-rig loop` runs continuously and polls every 60 seconds by default.
- `--interval <seconds>` changes the polling interval.
- `--worker` and `--reviewer` select agent names and default to `worker` and `reviewer`.
- The loop fails clearly when selected agents do not exist.
- The loop fails clearly when selected agents are not configured with `tool = "codex"`.
- The loop uses `.agent-rig/_shared/loop.lock` and refuses a second concurrent loop.
- Each Codex run writes `prompt.md`, `result.json`, and `last-message.md`.
- Worker prompts include local skill/tool precedence and task lifecycle instructions.
- Reviewer prompts include local skill/tool precedence and review outcome instructions.
- Non-zero Codex exit marks the active task `blocked`.
- Worker leaving the task `in_progress` marks it `blocked`.
- Reviewer leaving the task `review` marks it `blocked`.
- Existing `agent-rig watch --once` behavior remains unchanged.
- README and task docs explain the planner -> loop -> worker/reviewer workflow.

## Verification

- `npm test`
- `git diff --check`
- A focused smoke using a fake `codex` executable in tests to prove command arguments, prompt content, run records, and task transitions.

## Worker Task Breakdown

1. Archive Phase 12 and add Phase 13 docs.
2. Add `agent-rig loop` command routing, help text, options parsing, and lock handling.
3. Add deterministic task selection for review-first and worker-ready paths.
4. Add Codex headless invocation and run-record writing.
5. Add worker and reviewer prompt assembly with AgentRig-local skill/tool precedence.
6. Add failure handling for non-zero exits and unchanged task statuses.
7. Add continuous polling and `--interval`.
8. Update README/docs and add acceptance coverage.
