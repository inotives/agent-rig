---
id: task-0010
title: "Phase 14: add OpenCode loop runner"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-17
priority: normal
parent: ""
depends_on:
  - task-0009
message: "Accepted: added the OpenCode loop runner path with automated
  fake-OpenCode coverage for reviewer happy path, non-zero exit blocking, and
  missing-executable blocking; tests now prove the exact opencode run --dir
  --file --title command shape, no --model, no --auto, stdout-backed
  last-message.md, and OpenCode-specific failure summaries; npm test --
  --test-name-pattern='loop|opencode' passed (26) and git diff --check passed."
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

- Added `tool = "opencode"` dispatch in `runLoopAgent(...)` and kept the existing Codex runner path intact.
- Added `runOpenCodeLoop(...)` using `opencode run --dir <repo-root> --file <prompt.md> --title \"AgentRig <role> <task-id>\" \"Read the attached AgentRig loop prompt and follow it exactly.\"`.
- OpenCode runs now write captured stdout to `last-message.md` and persist stdout, stderr, spawn error, exit status, command args, and final task status to `result.json`.
- Generalized loop failure messaging so missing executables and non-zero exits report the correct tool name for Codex and OpenCode.
- Reviewer issue fixed: task 10 previously relied on manual smoke for OpenCode acceptance and had no automated proof of the actual OpenCode command shape or failure-path behavior.
- Added fake-OpenCode tests for reviewer happy path, non-zero exit blocking, and missing-executable blocking.
- Verification: `npm test -- --test-name-pattern='loop|opencode'` passed with 26 tests on July 17, 2026.
- Verification: disposable fake-OpenCode smoke confirmed args `run --dir --file --title`, no `--model`, no `--auto`, `last-message.md` content from stdout, and final task status `done`.
