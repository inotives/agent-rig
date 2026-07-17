---
id: task-0010
title: "Phase 14: add OpenCode loop runner"
type: task
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on:
  - task-0009
message: ""
---

# Task

## Context

Phase 14 plan: `docs/phases/phase-14-opencode-loop-adapter.md`.

After the runner boundary exists, add the OpenCode execution path.

## Goal

Run loop tasks for agents configured with `tool = "opencode"`.

## Scope

- Add OpenCode dispatch to the loop runner helper.
- Invoke OpenCode as:

```bash
opencode run --dir <repo-root> --file <runDir>/prompt.md --title "AgentRig <role> <task-id>" "Read the attached AgentRig loop prompt and follow it exactly."
```

- Do not pass `--model`.
- Do not pass `--auto`.
- Write `last-message.md` from captured stdout.
- Store stdout, stderr, spawn error, exit status, command args, and final task status in `result.json`.
- Block the task on missing OpenCode or non-zero OpenCode exit with an OpenCode-specific failure message.

## Planner Notes

- OpenCode owns model/provider selection; AgentRig must not pass `--model`.
- Local OpenCode help marks `--auto` dangerous; do not use it.
- OpenCode does not expose a visible Codex-style last-message flag.

## Implementation Plan

1. Add OpenCode command assembly to the loop runner helper.
2. Capture stdout into `last-message.md`.
3. Add OpenCode-specific missing-executable and non-zero-exit messages.
4. Ensure final task state handling reuses the existing loop failure/stale-status logic.
5. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] OpenCode runner uses `opencode run --dir <repo-root> --file <prompt.md> --title ... <message>`.
- [ ] OpenCode runner does not pass `--model`.
- [ ] OpenCode runner does not pass `--auto`.
- [ ] `last-message.md` contains captured stdout for OpenCode runs.
- [ ] Missing `opencode` blocks the task with a clear OpenCode-specific message.
- [ ] Non-zero OpenCode exits block the task with a clear OpenCode-specific message.

## Notes

