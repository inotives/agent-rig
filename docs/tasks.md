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

Task state changes are manual frontmatter edits in Phase 8:

- `todo`: captured but not ready.
- `ready`: ready for an assigned agent.
- `in_progress`: work has started.
- `review`: implementation or draft is ready for review.
- `blocked`: cannot continue without input or dependency.
- `done`: accepted complete.

Run `agent-rig validate` to catch invalid status, missing metadata, missing dependency references, and unknown assignees.
