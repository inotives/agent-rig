---
id: task-0004
title: "Phase 13: assemble Codex worker and reviewer prompts"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-07-15
updated_on: 2026-07-15
priority: normal
parent: ""
depends_on:
  - task-0003
message: "Accepted: role-aware loop prompts verified for worker and reviewer;
  required paths, lifecycle states, phase-doc inference, local skill/tool
  precedence, and no-native-tool-mounting wording present; npm test and git diff
  --check clean."
---


# Task

## Context

Phase 13 plan: `docs/phases/phase-13-worker-reviewer-loop.md`.

The loop must give headless Codex a self-contained role prompt because it will not inherit the current planner conversation. It must also prompt-enforce AgentRig-local skill and tool precedence.

## Goal

Build worker and reviewer prompt assembly for headless Codex loop runs.

## Scope

- Assemble prompts for worker and reviewer loop actions.
- Include:
  - agent name, role, and task id,
  - task file path and task Markdown body,
  - `.agent-rig/_shared/context.md`,
  - `.agent-rig/<agent>/instructions.md`,
  - `.agent-rig/<agent>/context.md`,
  - phase doc path when inferable from task content,
  - role-specific lifecycle instructions.
- Worker prompt must instruct the agent to set the task to `review` when ready or `blocked` when unable to continue.
- Reviewer prompt must instruct the agent to set the task to `done`, `ready`, or `blocked`.
- Every prompt must include AgentRig-local precedence:
  - `.agent-rig/<agent>/skills/`
  - `.agent-rig/_shared/skills/`
  - global Codex skills only if no local skill applies
  - `.agent-rig/<agent>/tools/`
  - `.agent-rig/_shared/tools/`
- Do not mount AgentRig tools as native Codex tools in this task.
- Do not run Codex in this task.

## Planner Notes

- This is prompt-enforced, not a native Codex registry integration.
- Keep the prompt path-oriented where possible; do not inline entire skill directories.
- The prompt should be deterministic enough to test with string assertions.

## Implementation Plan

1. Add prompt assembly helpers for worker and reviewer.
2. Include shared context, agent instructions, agent context, task body, and lifecycle instructions.
3. Include explicit skill/tool precedence wording.
4. Add tests that assert worker and reviewer prompts contain the required paths and lifecycle instructions.
5. Run `npm test`.

## Acceptance Criteria

- [ ] Worker prompt includes task path, task body, shared context, worker instructions, and worker context.
- [ ] Reviewer prompt includes task path, task body, shared context, reviewer instructions, and reviewer context.
- [ ] Worker prompt instructs `review` or `blocked` as terminal task states for the run.
- [ ] Reviewer prompt instructs `done`, `ready`, or `blocked` as terminal task states for the run.
- [ ] Prompts explicitly prioritize agent-local skills before shared skills before global Codex skills.
- [ ] Prompts explicitly tell Codex to check agent-local tools before shared tools and not assume tools exist.
- [ ] Tests do not depend on installed global Codex skills.
- [ ] `npm test` passes.

## Notes

- Replaced the generic run prompt in `src/tasks.ts` with a role-aware AgentRig loop prompt assembler.
- Added `buildLoopPrompt(cwd, agentName, taskId)` for deterministic prompt assertions in tests.
- Worker and reviewer prompts now include task id, task path, task Markdown body, shared context path/content, agent instructions path/content, agent context path/content, inferred phase doc path when present, and explicit role-specific terminal task states.
- Prompts now explicitly enforce AgentRig-local skill precedence, AgentRig-local tool precedence, and the no-native-tool-mounting rule.
- Left actual Codex execution and run-record command wiring for later Phase 13 tasks.
- Ran `npm test` successfully: 46 passed, 0 failed.
