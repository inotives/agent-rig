# Phase 14: OpenCode Loop Adapter

## Goal

Let `agent-rig loop` run worker and reviewer agents configured with `tool = "opencode"`.

Phase 13 proved the worker-reviewer loop using Codex headless mode. Phase 14 extends that loop to OpenCode while keeping task selection, locking, prompts, task lifecycle, and run records unchanged.

## Scope

- Support `tool = "opencode"` in `agent-rig loop`.
- Keep existing Codex loop behavior working.
- Reuse the same AgentRig task lifecycle:
  - worker claims `ready` tasks,
  - worker sends completed implementation to `review`,
  - reviewer marks accepted work `done`,
  - reviewer returns rejected work to `ready` with notes,
  - blocked work becomes `blocked`.
- Reuse the existing loop prompt assembly and local skill/tool precedence instructions.
- Write the same run record files under `.agent-rig/<agent>/runs/<run-id>/`.
- Add tests with a fake `opencode` executable.
- Run and record a live mixed-tool smoke test with Codex as worker and OpenCode as reviewer.
- Update docs for Codex and OpenCode loop execution.

## Out Of Scope

- Init/profile defaults for OpenCode ergonomics.
- Claude execution.
- A broad plugin system for arbitrary tools.
- Native mounting of `.agent-rig/<agent>/tools/` into OpenCode.
- Automatic git branch creation, commits, pushes, or PRs.
- Parallel worker/reviewer execution.
- Making live OpenCode execution part of automated CI.

## Accepted Decisions

### Phase 14 Is Loop-Only

Phase 14 only adds OpenCode support to `agent-rig loop`.

`agent-rig add ... --tool opencode` is already allowed by the workspace model. The missing user-facing behavior is execution. Init defaults and profile ergonomics can wait until the OpenCode runner works end to end.

### Use OpenCode Defaults

AgentRig should not pass `--model` to OpenCode.

OpenCode owns provider and model selection. Users who want a specific model should configure OpenCode outside AgentRig. Phase 14 relies on the OpenCode default model for live smoke testing.

### OpenCode CLI Contract

AgentRig should run OpenCode with an attached prompt file:

```bash
opencode run --dir <repo-root> --file <runDir>/prompt.md --title "AgentRig <role> <task-id>" "Read the attached AgentRig loop prompt and follow it exactly."
```

Do not pass `--auto`. Local OpenCode help marks it dangerous. If OpenCode cannot proceed because of permissions, the task should become `blocked` with a clear OpenCode failure summary.

OpenCode does not expose a visible `--output-last-message` equivalent. AgentRig should write `last-message.md` from captured stdout and keep stdout, stderr, and spawn errors in `result.json`.

### Runner Boundary

Use a small runner helper instead of leaving all command assembly inline in the loop.

Codex already has fallback behavior for `--output-last-message`, while OpenCode has a different command shape. The helper should stay minimal and support only `codex` and `opencode` in Phase 14.

### Live Smoke Is Required

Fake tests are necessary for deterministic coverage, but they are not enough to complete Phase 14.

Before the phase is accepted, run a real live smoke in a disposable temp repo:

- worker: Codex
- reviewer: OpenCode
- model: OpenCode default, no `--model`
- flow: `ready -> in_progress -> review` by Codex worker, then `review -> done` by OpenCode reviewer

The live smoke result must be recorded in the phase doc or PR notes before the phase is considered complete.

## Acceptance Criteria

- `agent-rig loop --once` runs a worker configured with `tool = "opencode"` when a ready task is available.
- `agent-rig loop --once` runs a reviewer configured with `tool = "opencode"` when a review task is available.
- Codex worker/reviewer loop tests still pass.
- OpenCode failures block the task with a clear OpenCode-specific failure message.
- Run records include `tool: "opencode"`, command args, exit status, stdout, stderr, error, failure summary, timestamps, and final task status.
- Fake OpenCode tests assert command args, attached prompt file usage, stdout capture, and run record files without requiring real OpenCode auth.
- A live disposable-workspace smoke proves Codex worker plus OpenCode reviewer can move one task from `ready` to `done`.
- The live smoke uses OpenCode's default model and does not pass `--model`.
