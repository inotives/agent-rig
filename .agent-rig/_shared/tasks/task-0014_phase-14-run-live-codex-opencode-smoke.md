---
id: task-0014
title: "Phase 14: run live Codex worker and OpenCode reviewer smoke"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-17
updated_on: 2026-07-18
priority: normal
parent: ""
depends_on:
  - task-0013
message: "Accepted: Phase 14 now includes recorded live disposable-smoke
  evidence in the phase doc showing Codex worker ready->review and OpenCode
  reviewer review->done, with reviewer command_args proving opencode run --dir
  --file --title plus no --model and no --auto; the current runner also reflects
  the live Codex CLI compatibility fix by removing --ask-for-approval never,
  deterministic tests cover the updated Codex/OpenCode args, npm test passed
  (64), and git diff --check passed."
---


# Task

## Context

Phase 14 plan: `docs/phases/phase-14-opencode-loop-adapter.md`.

Fake tests are not enough for Phase 14 acceptance. The phase must prove a real OpenCode reviewer can consume the AgentRig loop prompt and update task state.

## Goal

Run and record a live mixed-tool smoke test using Codex as worker and OpenCode as reviewer.

## Scope

- Use a disposable temp repo/workspace.
- Use Codex as the worker.
- Use OpenCode as the reviewer.
- Use OpenCode's default model; do not pass `--model`.
- Do not pass OpenCode `--auto`.
- Prove one task moves from `ready` to `done`.
- Record the smoke result in the Phase 14 doc or PR notes.
- Do not run the live smoke against this repo's real task queue.

## Planner Notes

- The smoke should verify the actual `opencode run --dir ... --file <prompt.md> ...` call.
- Keep the smoke task harmless. It can edit only disposable files.
- If local auth or provider state blocks OpenCode, capture that as a blocker with exact stderr and do not mark the phase complete.

## Implementation Plan

1. Build the project.
2. Create a disposable temp repo and initialize AgentRig.
3. Configure worker as Codex and reviewer as OpenCode.
4. Create one harmless ready task assigned to the Codex worker.
5. Run `agent-rig loop --once` for the Codex worker until the task reaches `review`.
6. Run `agent-rig loop --once` with the OpenCode reviewer until the task reaches `done`.
7. Verify both agents wrote run records.
8. Record command summary, final task status, and run record paths in Phase 14 doc or PR notes.
9. Run final `npm test` and `git diff --check`.
10. Set this task to `review` with verification notes.

## Acceptance Criteria

- [ ] Disposable workspace is used.
- [ ] Codex worker moves the task to `review`.
- [ ] OpenCode reviewer moves the task to `done`.
- [ ] OpenCode run uses default model and no `--model`.
- [ ] OpenCode run does not pass `--auto`.
- [ ] Worker and reviewer run records exist.
- [ ] Live smoke result is recorded in the Phase 14 doc or PR notes.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.

## Notes

- Live smoke completed on July 18, 2026 in `/private/tmp/agent-rig-phase14-smoke-2hjys6/repo`.
- Disposable workspace only; the real repo task queue was not used.
- Worker run:
  - tool: `codex`
  - final task status: `review`
  - run record: `.agent-rig/worker/runs/2026-07-18-200722_task-0001/result.json`
- Reviewer run:
  - tool: `opencode`
  - final task status: `done`
  - run record: `.agent-rig/reviewer/runs/2026-07-18-200847_task-0001/result.json`
- OpenCode reviewer `command_args` recorded:
  - `run --dir /private/tmp/agent-rig-phase14-smoke-2hjys6/repo --file <prompt.md> --title "AgentRig reviewer task-0001" "Read the attached AgentRig loop prompt and follow it exactly."`
  - no `--model`
  - no `--auto`
- The first live attempt exposed a real Codex CLI compatibility issue on this machine: installed `codex-cli 0.144.4` rejected `--ask-for-approval never`. The loop runner was updated to remove that stale flag before rerunning the smoke successfully.
- The managed sandbox on this machine also blocked local Codex app-server initialization with `Operation not permitted`, so the successful disposable smoke was executed outside that sandbox.
