# Phase 8: Task Management Improvements

## Goal

Improve AgentRig task creation, assignment, and tracking after the Phase 7 CLI/profile work is complete.

## Scope

Phase 8 adds the filesystem task model for planner-to-worker handoff.

- Canonical Markdown task files under `.agent-rig/_shared/tasks/`.
- YAML frontmatter for task metadata and state.
- Parent task and subtask relationships.
- Task dependencies.
- Task listing, filtering, and inspection commands.
- Task creation from a standard template.
- Validation warnings for task metadata and relationships.
- Built-in profile template updates for the task workflow.
- New built-in `researcher` and `writer` profile templates.

## Out of Scope

- Any fixed sub-agent or parent-agent schema.
- Any orchestration that launches Claude, Codex, OpenCode, or other tools directly.
- Any database-backed task store.
- Task mutation commands such as `tasks set-status`, `tasks assign`, or `tasks done`.
- Automated workflow transitions.
- A shared task-creation skill.

## Acceptance Criteria

- `agent-rig init` creates `.agent-rig/_shared/tasks/`.
- `agent-rig init` no longer creates `.agent-rig/_shared/docs/`.
- `agent-rig init` no longer creates `.agent-rig/_shared/task_queue.json`.
- `agent-rig tasks create "<title>"` generates a valid Markdown task file with YAML frontmatter.
- `agent-rig tasks create` supports metadata flags: `--assigned-to`, `--status`, `--priority`, `--parent`, `--depends-on`, and `--created-by`.
- `agent-rig tasks` lists task ID, status, assignee, priority, title, and dependency count.
- `agent-rig tasks --status <status>` filters listed tasks.
- `agent-rig tasks --json` emits parseable JSON for task listings.
- `agent-rig tasks show <id>` prints the canonical Markdown task file.
- `agent-rig validate` warns for invalid task metadata and relationship issues.
- Built-in planner, worker, reviewer, researcher, and writer profiles mention the Phase 8 task workflow.
- Built-in `researcher` and `writer` profiles are listed, shown, seeded, and usable through `agent-rig add --profile`.
- Tests cover scaffold changes, task creation, task listing/filtering, task show, JSON output, and validation warnings.
- `docs/project_specs.md`, `docs/tasks.md`, and `README.md` document the Phase 8 task model.

## Initial Recommendation

Keep tasks Markdown-first with YAML frontmatter. Add only the smallest structure needed for planner-to-worker handoff, and keep the body free-form so future task formats can grow without JSON schema churn.

## Documentation Deliverables

- Update `docs/project_specs.md` to replace `task_queue.json` and `_shared/docs/` task storage with `_shared/tasks/`.
- Add `docs/tasks.md` as the user-facing task format and command guide.
- Update `README.md` with a short task-management section.
- Update built-in planner, worker, reviewer, researcher, and writer profile templates with the task workflow.
- Add `researcher` and `writer` to the built-in profile list and documentation.
- Add an ADR for replacing `task_queue.json` with Markdown task files as the task source of truth.

## Accepted Decisions

### Built-In Researcher and Writer Profiles

Phase 8 adds two built-in profile templates:

- `researcher`
- `writer`

These profiles follow the same copy-only profile model as planner, worker, and reviewer. They are editable Markdown templates, seeded into `.agent-rig/_shared/profiles/`, and usable with `agent-rig add --profile`.

`researcher` and `writer` should be available in the interactive role/profile catalog. They should not be added to the default `agent-rig init --yes` scaffold.

Role-to-profile defaults:

- `researcher` role defaults to the `researcher` profile.
- `writer` role defaults to the `writer` profile.

Default profile skill installs:

```yaml
researcher:
  agent_skills:
    - repo: https://github.com/affaan-m/everything-claude-code
      skill: research-ops
writer:
  agent_skills:
    - repo: https://github.com/blader/humanizer
      skill: humanizer
    - repo: https://github.com/getsentry/skills
      skill: blog-writing-guide
```

These are agent-local skills. They should install into the created agent's local `skills/` folder, not `.agent-rig/_shared/skills/`.

### Markdown Task Files Are Canonical

Phase 8 uses Markdown task files as the source of truth for task records.

Task files live under:

```text
.agent-rig/_shared/tasks/
└── task-0001_fix-login-timeout.md
```

YAML frontmatter stores machine-readable task metadata. The Markdown body stores the detailed human/agent brief.

Task listing and status come from task Markdown frontmatter. Session files may reference an active task, but they are not the canonical task record.

### Task Statuses

Phase 8 supports this status set:

```yaml
status: todo | ready | in_progress | blocked | review | done
```

- `todo`: captured but not ready for implementation.
- `ready`: ready for an agent to work.
- `in_progress`: assigned or being worked.
- `blocked`: cannot proceed without input or a dependency.
- `review`: implementation is done and awaiting reviewer or human verification.
- `done`: accepted complete.

Do not build a workflow engine in Phase 8. Status changes are explicit task metadata updates.

### Task Relationships

Phase 8 supports optional task relationships in YAML frontmatter:

```yaml
parent: task-0001
depends_on:
  - task-0002
  - task-0003
```

- `parent` links a subtask to a larger task or goal.
- `depends_on` lists task IDs that should be completed first.
- Relationships are frontmatter-only in Phase 8.
- Validation should warn when referenced task files are missing.
- Validation should warn when a task depends on another task that is not `done`.
- AgentRig should not automatically open, block, or close related tasks in Phase 8.

### Task File Template

New task files should use this structure:

```md
---
id: task-0001
title: Fix login timeout
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-06-30
updated_on: 2026-06-30
priority: normal
parent:
depends_on: []
---

# Task

## Context

## Goal

## Scope

## Planner Notes

## Implementation Plan

## Acceptance Criteria

- [ ] First verifiable criterion.

## Notes
```

The frontmatter is for machine-readable task metadata. The Markdown body is for the detailed human/agent brief.
`Planner Notes` is the human + planner working area before the implementation plan is finalized.

Acceptance criteria should be Markdown checklist items:

```md
## Acceptance Criteria

- [ ] Login timeout is configurable through existing config.
- [ ] Existing login tests pass.
```

Validation should warn when the `## Acceptance Criteria` section is missing or has no checklist items. It should not parse criterion semantics.

### Task Creation Command

Phase 8 adds a CLI command for task creation:

```bash
agent-rig tasks create "Fix login timeout" --assigned-to worker
```

The command should:

- Create a Markdown task file from the standard template.
- Generate the next task ID.
- Derive a filename slug from the title.
- Default to `status: todo`.
- Allow `--status ready` when the task is ready for implementation.
- Set `created_by` to `human` by default unless provided.
- Accept metadata flags only: `--assigned-to`, `--status`, `--priority`, `--parent`, `--depends-on`, and `--created-by`.
- Avoid body-content flags such as `--goal`, `--scope`, or `--criteria`.
- Support repeated and comma-separated `--depends-on` values:

```bash
agent-rig tasks create "Add checkout" --depends-on task-0001 --depends-on task-0002
agent-rig tasks create "Add checkout" --depends-on task-0001,task-0002
```

Both forms should write:

```yaml
depends_on:
  - task-0001
  - task-0002
```

Do not create a shared task-creation skill in Phase 8. A later skill can use the CLI command instead of duplicating task file rules.

### Task Inspection Commands

Phase 8 adds only these task inspection commands:

```bash
agent-rig tasks
agent-rig tasks --status ready
agent-rig tasks show task-0001
```

- `agent-rig tasks` lists task ID, status, assignee, priority, title, and dependency count.
- `agent-rig tasks --status <status>` filters by status.
- `agent-rig tasks show <id>` prints the matching Markdown task file.

Do not add task update, assign, complete, or workflow-transition commands in Phase 8.

### Task IDs and Filenames

Task IDs are sequential:

```text
task-0001
task-0002
task-0003
```

Task filenames use the task ID plus a title slug:

```text
task-0001_fix-login-timeout.md
```

The next ID is generated by scanning existing task files. If a generated filename already exists, task creation should fail without overwriting so the command can be rerun safely.

### Task Validation

`agent-rig validate` should use warning-first validation for task metadata.

Warnings:

- Missing required frontmatter keys.
- Invalid `status`.
- Malformed `depends_on`.
- Missing referenced `parent` task.
- Missing referenced dependency task.
- Dependency task exists but is not `done`.
- `assigned_to` references an unknown agent.

Hard failures should be limited to unreadable task files or task files that cannot be parsed.

### Task Assignment

`assigned_to` references an AgentRig agent folder/name, not a role.

```yaml
assigned_to: backend-worker
```

This keeps assignment unambiguous when a workspace has multiple agents with the same role.

### Task Priority

Task priority is optional and limited to:

```yaml
priority: low | normal | high
```

Default to `normal`. Phase 8 should not add due dates, weighted scoring, or scheduling logic. Task lists can sort by task ID.

### JSON Output

Task list commands support JSON output:

```bash
agent-rig tasks --json
agent-rig tasks --status ready --json
```

Do not add JSON output for `agent-rig tasks show` in Phase 8. `tasks show` should print the Markdown task file because the file is the source of truth.

### Task Workflow and State Changes

Phase 8 task state is stored in task Markdown frontmatter. AgentRig creates, lists, shows, and validates tasks, but does not automate workflow transitions.

1. Capture task:
   - Human or planner runs `agent-rig tasks create "Fix login timeout"`.
   - AgentRig creates `.agent-rig/_shared/tasks/task-0001_fix-login-timeout.md`.
   - Default state is `status: todo`.
2. Plan/refine task:
   - Human and planner edit the Markdown body with context, goal, scope, implementation plan, and acceptance criteria.
   - When ready, they manually set `status: ready` and `assigned_to: <agent-name>`.
3. Worker picks task:
   - Worker or human runs `agent-rig tasks --status ready`.
   - Worker reads the task with `agent-rig tasks show task-0001`.
   - When work starts, the task frontmatter is manually changed to `status: in_progress`.
4. Worker finishes:
   - Worker completes implementation and writes a handoff.
   - Task frontmatter is manually changed to `status: review`.
5. Reviewer or human verifies:
   - If accepted, task frontmatter is manually changed to `status: done`.
   - If not accepted, task frontmatter is manually changed back to `status: ready` or to `status: blocked`.

Do not add task mutation commands such as `tasks set-status`, `tasks assign`, or `tasks done` in Phase 8. State changes are manual frontmatter edits.

### No Legacy Task Compatibility

AgentRig does not have active external users yet, so Phase 8 can simplify the task model without preserving old task storage paths.

- Use `.agent-rig/_shared/tasks/` for canonical task files.
- Do not create new task documents under `.agent-rig/_shared/docs/`.
- Do not keep `task_queue.json` as part of the Phase 8 task model.
- Update specs and scaffolding to reflect the new task layout.
- Remove `task_queue.json` from new scaffolds and specs.
- Task listing and status should come from task Markdown frontmatter.

### Scaffold Changes

`agent-rig init` should create:

```text
.agent-rig/_shared/tasks/
```

`agent-rig init` should stop creating:

```text
.agent-rig/_shared/docs/
.agent-rig/_shared/task_queue.json
```

`agent-rig add` does not need to change shared task storage.

Do not create sample task files during `agent-rig init` or `agent-rig init --yes`.
