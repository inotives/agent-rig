---
name: plan-tasks
description: Plan a project phase end to end and turn it into implementation-ready AgentRig worker tasks. Use when the user asks to plan a next phase, phase docs, grill requirements, create phase planning docs under docs/, or break a planned phase into tasks under .agent-rig/_shared/tasks/.
---

# Plan Tasks

## Workflow

Use this skill to repeat the phase-planning workflow:

1. Understand the phase goal.
2. Grill the user one question at a time with recommendations.
3. Write a phase planning doc in `docs/`.
4. Break the phase into AgentRig worker tasks in `.agent-rig/_shared/tasks/`.

Planning documents under `docs/` are the canonical implementation plan, ADR,
and acceptance record. They remain repository artifacts and are not migrated
into the workflow store; the workflow store contains live operational tasks and
handoff conversations only.

Keep the plan decision-complete. A worker should not need to invent product behavior, CLI shape, test scope, or task order.

## Ground First

Before asking questions:

- Read `AGENTS.md` if present.
- Read the current project spec or roadmap docs.
- Read the latest phase docs in `docs/`.
- Inspect existing `.agent-rig/_shared/tasks/` task numbering and structure.
- Inspect the current implementation surface only as needed to avoid planning against stale docs.

Do not ask questions that the repo can answer.

## Grill Phase

Use `grill-with-docs` when available. If it is not available, follow the same pattern manually.

Ask one question at a time. Each question must:

- materially change the phase scope or behavior,
- confirm an important assumption, or
- choose between meaningful tradeoffs.

For each question:

- give 2-3 concrete options when possible,
- mark one as recommended,
- explain the tradeoff briefly,
- wait for the user's answer before asking the next question.

Start by asking what overall issue, product gap, or task this phase should solve. Then drill into:

- goal and success criteria,
- user-facing CLI/API/docs changes,
- config or schema shape,
- data flow and persistence,
- failure modes and operator recovery,
- tests and acceptance checks,
- out-of-scope boundaries.

Stop grilling once the phase is decision-complete.

## Phase Doc

Create one phase doc under `docs/` named like:

```text
docs/phase-<n>-<short-kebab-title>.md
```

Match the repo's existing phase-doc style. Prefer these sections:

- `Goal`
- `Decisions`
- feature-specific sections such as `CLI Shape`, `Config Shape`, `Run Behavior`, or `Output`
- `Tests`
- `AgentRig Breakdown`
- `Out Of Scope`

Keep docs concrete enough for implementation. Include exact command names, config examples, output shapes, validation rules, and required checks when those decisions matter.

## AgentRig Tasks

Create task files under:

```text
.agent-rig/_shared/tasks/
```

Follow existing task numbering, names, and frontmatter. Continue from the highest existing task ID.

Use filenames like:

```text
task-00NN_phase-<n>-<short-task-title>.md
```

Each task should include:

- frontmatter with `id`, `title`, `type: task`, `status: ready`, `assigned_to: worker`, `created_by: human`, dates, priority, parent, dependencies, and message,
- `# Task`,
- `## Context`,
- `## Goal`,
- `## Scope`,
- `## Planner Notes`,
- `## Implementation Plan`,
- `## Acceptance Criteria`,
- `## Notes`.

Task design rules:

- Make tasks sequential unless independent parallel work is genuinely safe.
- First task usually establishes shared config/schema/parsing.
- Middle tasks add vertical behavior slices.
- Later tasks add acceptance/docs.
- Final task is verification and task cleanup.
- Keep each task small enough for a worker to complete and a reviewer to review.
- Include concrete acceptance criteria and required checks.
- Reference the phase doc as the source of truth.

Task execution is manager-gated: set only dependency-free foundation tasks to
`ready`, keep downstream tasks `blocked`, run each selected task through a
worker sub-agent and independent reviewer sub-agent, return review findings to
the same task for worker fixes and re-review, and unlock only the next selected
dependent task after clean review. Add one final integrated-review task for the
phase.

If implementation or review reveals a limitation that changes the plan, pause
the affected task graph, return to the planner and human, update the canonical
documents under `docs/`, and create or revise tasks only after the revised plan
is accepted. Do not let downstream tasks proceed from a stale plan.

## Verification

After writing docs and tasks:

- Run `git diff --check`.
- Check `git status --short --branch`.
- Skim task IDs, statuses, and dependency chain.
- Report created file paths and any checks run.

Do not commit unless the user asks.
