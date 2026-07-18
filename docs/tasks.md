# AgentRig Tasks

AgentRig tasks are Markdown files with YAML frontmatter.

Canonical task files live in:

```text
.agent-rig/_shared/tasks/
```

## Create

```bash
agent-rig tasks create "Fix login timeout" --assigned-to worker
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
agent-rig tasks create "Add checkout" --depends-on task-0001 --depends-on task-0002
```

## List And Show

```bash
agent-rig tasks
agent-rig tasks --status ready
agent-rig tasks --json
agent-rig tasks show task-0001
```

`tasks show` prints the Markdown task file because the file is the source of truth.

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

## Goal

## Scope

## Planner Notes

## Implementation Plan

## Acceptance Criteria

- [ ] First verifiable criterion.

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

Run `agent-rig validate` to catch invalid status, missing metadata, missing dependency references, and unknown assignees.
