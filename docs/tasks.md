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

## Watch

```bash
agent-rig watch --once
```

`watch --once` processes canonical shared tasks from `.agent-rig/_shared/tasks/`. It skips ready tasks without `assigned_to` because watch needs a target agent.

Continuous watch mode is not part of Phase 10.

Run `agent-rig validate` to catch invalid status, missing metadata, missing dependency references, and unknown assignees.
