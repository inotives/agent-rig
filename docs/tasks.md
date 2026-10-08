# AgentRig Tasks

AgentRig tasks use a backend-neutral workflow-store interface. New workspaces
default to Markdown files with YAML frontmatter; after an explicit migration,
SQLite is canonical for live tasks and handoffs.

Canonical task files live in:

```text
.agent-rig/_shared/tasks/
```

## Create

```bash
agent-rig tasks create "Fix login timeout" --body-file docs/tasks/task-0001.md --assigned-to worker
```

Supported metadata flags:

- `--assigned-to <agent>`
- `--status <todo|ready|in_progress|blocked|review|done>`
- `--type <task|bug|story|epic|chore|research|doc>`
- `--priority <low|normal|high>`
- `--parent <task-id>`
- `--depends-on <task-id[,task-id]>`
- `--created-by <name>`

`--depends-on` can be repeated:

```bash
agent-rig tasks create "Add checkout" --body-file docs/tasks/task-0002.md --depends-on task-0001 --depends-on task-0002
```

Every new task must include a complete brief with `--body-file`. AgentRig
validates these sections before it creates the task:

- `Context`
- `Goal`
- `Scope`
- `Planner Notes`
- `Implementation Plan`
- `Acceptance Criteria` with at least one checklist item

Update a task brief through AgentRig when the plan changes:

```bash
agent-rig tasks update-body task-0001 --body-file docs/tasks/task-0001.md
```

## List And Show

```bash
agent-rig tasks
agent-rig tasks --status ready
agent-rig tasks --json
agent-rig tasks show task-0001
```

`tasks show` reconstructs the task as Markdown from the active provider. In
Markdown mode this is the source file; in SQLite mode it is a backend-neutral
view and the SQLite database is authoritative.

## Task Format

```md
---
id: task-0001
title: Fix login timeout
type: task
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

Why this task exists and what problem it solves.

## Goal

The result this task must produce.

## Scope

The files, behavior, and boundaries included in the task.

## Planner Notes

Decisions, constraints, and trade-offs from the planning discussion.

## Implementation Plan

The steps the worker should follow.

## Acceptance Criteria

- [ ] The task result is verifiable.

## Notes
```

## Workflow

`type` describes the kind of work:

- `task`: normal implementation work.
- `bug`: defect fix.
- `story`: user-facing capability or behavior.
- `epic`: larger grouping item, usually parent for stories or tasks.
- `chore`: maintenance, cleanup, release, or tooling.
- `research`: investigation or discovery work.
- `doc`: documentation work.

`status` describes lifecycle state:

- `todo`: captured but not ready.
- `ready`: ready for an assigned agent.
- `in_progress`: work has started.
- `review`: implementation or draft is ready for review.
- `blocked`: cannot continue without input or dependency.
- `done`: accepted complete.

Recommended lifecycle:

```text
todo -> ready -> in_progress -> review -> done
             \-> blocked
in_progress -> blocked
review -> ready
review -> blocked
blocked -> todo | ready | in_progress
```

AgentRig allows any valid status update so humans and agents can recover from mistakes or unusual workflows.

Phase 13 standard execution flow is:

```text
planner or human prepares tasks -> create/switch feature branch manually -> agent-rig loop
```

In this phase, `agent-rig loop` supports agents configured with `tool = "codex"` or `tool = "opencode"`. It prefers `review` work before claiming new `ready` work and keeps branch creation outside the loop.

Codex agents run through headless `codex exec` sessions. OpenCode agents run through `opencode run` using the OpenCode default model configured outside AgentRig; AgentRig does not pass OpenCode `--model` or `--auto`.

Claude loop execution is still unsupported. Live OpenCode smoke testing is still a manual verification step and is not part of CI.

`agent-rig status` is read-only. It now includes compact loop observability for the default `worker` and `reviewer`: lock state, next loop action, and latest run summaries. `agent-rig status --json` exposes the same data under a top-level `loop` object. For full details, inspect the run paths reported there under `.agent-rig/worker/runs/` or `.agent-rig/reviewer/runs/`.

Typical loop-driven lifecycle:

```text
ready -> in_progress -> review -> done
review -> ready
review -> blocked
```

## Lifecycle Commands

```bash
agent-rig tasks set-status task-0001 ready
agent-rig tasks assign task-0001 worker
agent-rig tasks set-type task-0001 bug
agent-rig tasks block task-0001 --reason "Need API key"
agent-rig tasks unblock task-0001 --status ready
agent-rig tasks done task-0001 --message "Verified locally."
```

`tasks block` stores the active blocker in frontmatter and appends history to `## Blockers`.

## Next Task

```bash
agent-rig tasks next
agent-rig tasks next --agent worker
agent-rig tasks next --agent worker --claim
agent-rig tasks next --json
```

`tasks next` only returns `ready` tasks whose dependencies are `done`. It is read-only unless `--claim` is provided.

`tasks next --claim` sets the selected task to `in_progress`. It does not add separate claim metadata; `assigned_to` remains the ownership field.

## GitHub Issue Planning

Issue planning and GitHub issue import are different workflows.

Use issue planning when one GitHub Issue needs a reviewed implementation plan:

```bash
agent-rig plan github-issue
agent-rig plan github-issue 123
agent-rig plan branch 123
agent-rig plan resume 123
agent-rig plan approve 123
agent-rig plan tasks 123
```

Issue discovery only lists eligible open issues. It does not create workflow
tasks. The planner and human keep the reviewed plan under `docs/plans/`.
AgentRig creates workflow tasks only after the human runs `plan approve`.
The planning commands that read GitHub require the GitHub CLI (`gh`) and an
authenticated session. Normal local task workflows do not require GitHub CLI
access. After the issue branch is pushed, AgentRig prints a GitHub compare
link and stops for human review. It does not create a pull request
automatically.

The final human end-to-end check must cover issue discovery, plan review,
approval, task generation, and the worker-reviewer flow.

## GitHub Issue Import

GitHub issue import is optional. It requires the GitHub CLI only when sync is invoked:

```bash
gh auth login
agent-rig tasks sync github
agent-rig tasks sync github --label agent-rig
agent-rig tasks sync github --limit 20
agent-rig tasks sync github --dry-run
agent-rig tasks sync github --json
```

Imported GitHub issues become unassigned `todo` tasks. They are backlog seeds, not ready implementation briefs:

```yaml
type: task
status: todo
assigned_to:
source:
  provider: github
  repo: owner/repo
  issue: 123
  url: https://github.com/owner/repo/issues/123
  state_at_import: open
  imported_at: 2026-07-01
  labels:
    - bug
```

Issue body content is stored under `## Source Issue`. `## Context` should contain a short import note and can be rewritten by a planner later.

Repeat sync skips issues that already exist locally by matching `source.provider`, `source.repo`, and `source.issue`. Local task files are not overwritten after import.

If a complex imported issue is split into multiple local tasks, keep the GitHub `source` metadata only on the imported parent task. Child implementation tasks should reference it with `parent`:

```yaml
parent: task-0001
depends_on: []
```

## Watch

```bash
agent-rig watch --once
```

`watch --once` processes canonical shared tasks from `.agent-rig/_shared/tasks/`. It skips ready tasks without `assigned_to` because watch needs a target agent.

`watch --once` remains the older filesystem-only single-task adapter. It does not launch headless Codex sessions and is unchanged by the Phase 13 worker-reviewer loop.

## Workflow Storage And Migration

The provider is selected in `.agent-rig/_shared/agent-rig.json`:

```json
{"workflow_store": {"provider": "markdown"}, "project_identifier": "my-project"}
```

Markdown is the default. To switch a completed Markdown-backed workspace to
SQLite, run:

```bash
agent-rig workflow migrate --to sqlite
```

The storage safety commands are incremental import, read-only backup, and
guarded rebuild:

```bash
agent-rig workflow import --from markdown --json
agent-rig workflow backup --output /tmp/workflow.sqlite
agent-rig workflow rebuild --replace --confirm "REPLACE SQLITE"
```

Import requires the exclusive workflow lock and marks source Markdown only
after its SQLite transaction commits. Rebuild is dry-run by default, creates a
timestamped backup before replacement, and preserves SQLite records on
same-ID conflicts.

Migration imports only tasks and handoff conversations. Planning documents in
`docs/`, run artifacts, and AgentRig harness state are not imported. It
validates first, refuses an existing database or marked source, verifies the
temporary database, then switches configuration and marks the old Markdown
records with `storage_status: migrated`. A marker-write error is reported
after the provider switch because SQLite is already canonical.

The normal worker-reviewer completion path requires a worker handoff followed
by a reviewer handoff. Legacy tasks with zero or one imported handoff retain
their historical status but are marked with `incomplete_handoff_trail` and
cannot be newly completed without the configured trail. A human may use the
explicit administrative override for an exceptional historical decision.
In SQLite mode, both `tasks done` and `tasks set-status <id> done` enforce this
trail; use `--admin-override` only for an explicit human exception. Manual
work can append handoffs with `tasks handoff <id> --sender worker --recipient
reviewer --status review --message "Summary"`. For a handoff file written
after the one-way migration, use `tasks handoff <id> --source-file <path>` to
import it once and mark the source file historical. The import appends at the
next live sequence and preserves the source timestamp in `source_created_at`.
If that time predates the preceding handoff, `status --json` exposes
`source_order_conflict: true`; a new worker/reviewer pair is required for normal
completion.
Inside a running worker-reviewer loop, a reviewer's `done` request is held
until AgentRig can append the reviewer handoff and commit completion together.

The manager replanning process remains in the generated
`.agent-rig/_shared/workflow.md`: planning and ADR documents stay in `docs/`,
and implementation tasks are created only after human approval.

Run `agent-rig validate` to catch invalid status, missing metadata, missing dependency references, and unknown assignees.
