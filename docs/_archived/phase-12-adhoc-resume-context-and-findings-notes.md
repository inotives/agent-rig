# Phase 12: Ad Hoc Resume Context and Findings Notes

## Goal

Tighten AgentRig's real multi-agent workflow around session continuity and reusable findings without adding per-task paperwork.

This ad hoc phase captures the small workflow fixes discussed after Phase 11:

- planner should have an AgentRig-local planning skill by default,
- handoff intent should be cross-session resume only,
- worker and reviewer should have a durable place for reusable findings and abnormal events,
- `agent-rig start` should surface the latest resume artifacts directly.

## Scope

- Add an AgentRig-bundled `plan-tasks` skill to the built-in planner profile.
- Update planner instructions so `plan-tasks` is the default phase-planning path.
- Keep `handoff` installed as a shared default skill for all agents.
- Narrow planner handoff guidance to session-close, cross-session resume notes.
- Add `_shared/notes/` for reusable worker and reviewer findings.
- Update worker and reviewer profiles to write concise findings notes only for reusable patterns, repo quirks, recurring findings, or out-of-norm events.
- Extend `agent-rig start --agent <name>` to print path-only resume context pointers.
- Update README guidance to reflect the intended workflow.

## Initial Recommendation

Do not make handoffs mandatory at every role boundary.

The normal task loop already has better artifacts:

- planner -> worker: phase docs and task files,
- worker -> reviewer: code, task status, and task notes,
- reviewer -> worker retry: reviewer notes in the task.

Use handoffs only when a later session needs concise operational resume context. Use `_shared/notes/` for durable findings worth carrying across sessions.

## Acceptance Criteria

- The planner profile installs an AgentRig-local `plan-tasks` skill by default.
- Generated planner instructions explicitly tell planners to use `plan-tasks` for phase planning and task breakdown.
- Generated planner instructions treat handoffs as cross-session resume notes, not per-task paperwork.
- `handoff` remains a shared default skill for all agents.
- `agent-rig init --yes` creates `.agent-rig/_shared/notes/.gitkeep`.
- Generated worker instructions mention `.agent-rig/_shared/notes/` for reusable patterns, repo quirks, or abnormal events.
- Generated reviewer instructions mention `.agent-rig/_shared/notes/` for recurring findings, contract mismatches, or other out-of-norm events.
- `agent-rig start --agent <name>` prints a `Resume context:` section.
- `start` shows the latest planner handoff when present.
- `start` shows the latest overall handoff when it adds information beyond the planner handoff.
- `start` shows up to three most recent `_shared/notes/` files, by path only.
- `start` does not inline handoff or note file contents.
- README documents:
  - handoff logs as cross-session resume artifacts,
  - `_shared/notes/` as durable worker and reviewer findings notes,
  - `start` as launch guidance plus resume context.
- Tests cover the planner-skill installation, planner instruction wording, `_shared/notes/` scaffold, and `start` resume-context output.

## Out Of Scope

- Auto-writing handoffs from normal worker or reviewer task completion.
- Auto-writing findings notes from review or implementation actions.
- Prompt concatenation of handoffs or notes into live agent prompts.
- Token tracking or scoring of reviewer findings.
- Automatic task lifecycle transitions based on file changes.

## Accepted Decisions

### Planner Owns Normal Handoff Usage

`handoff` remains globally available as a shared skill, but planner owns the normal use case.

Worker and reviewer should not be forced to write handoffs after routine task completion. They should use handoff only exceptionally, such as when the planner is absent or a session stops in a blocked or unusual state.

### Findings Notes Live In `_shared/notes/`

Worker and reviewer observations that are worth carrying forward should not be buried only in task-local notes when they are reusable across later sessions.

Use `_shared/notes/` for:

- reusable implementation patterns,
- repo-specific quirks,
- recurring review findings,
- contract mismatches,
- out-of-norm events that future sessions should remember.

Do not use `_shared/notes/` for routine progress logging.

### `start` Surfaces Resume Pointers, Not Full Prompt Assembly

`agent-rig start` should remain a launch helper, not a prompt assembler.

The command should print relative file paths for:

- the latest planner handoff,
- the latest overall handoff when useful,
- the latest three shared findings notes.

This keeps the output short and lets the human or tool load only the files that matter.

### Planner Gets An AgentRig-Local Planning Skill

The planner profile should ship with an AgentRig-local `plan-tasks` skill so phase-planning behavior is not dependent on an external repo path.

This skill should cover:

- grounding in project docs before questions,
- one-question-at-a-time planning interviews,
- phase doc creation,
- AgentRig task breakdown generation.

## Verification

- `npm test`
- `git diff --check`

## Notes

This phase is intentionally ad hoc. It records workflow hardening discussed after Phase 11 rather than a new major product surface.
