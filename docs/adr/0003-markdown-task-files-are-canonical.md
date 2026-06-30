# ADR 0003: Markdown Task Files Are Canonical

## Status

Accepted

## Context

AgentRig needs task records that are readable by humans, editable by agents, and large enough to hold planner-created implementation briefs. Earlier scaffold drafts included `task_queue.json` plus `_shared/docs/`, which creates a split between machine state and task detail.

Task instructions are expected to grow over time with context, scope, implementation notes, and acceptance criteria. Storing those details directly in JSON would make hand editing harder and create schema churn as the task format evolves.

## Decision

Task Markdown files under `.agent-rig/_shared/tasks/` are the canonical task records.

YAML frontmatter stores machine-readable metadata such as task ID, status, assignee, priority, parent, dependencies, and timestamps. The Markdown body stores the detailed human/agent task brief.

AgentRig will not keep `task_queue.json` as part of the Phase 8 task model. Task listing and validation read task Markdown frontmatter directly.

## Consequences

- Humans and agents can edit rich task briefs without escaping large text into JSON.
- Task state has one source of truth: task Markdown frontmatter.
- `agent-rig tasks` can derive listings from files instead of maintaining a separate queue index.
- Concurrent task creation remains simple: if a generated task file already exists, creation fails without overwriting and can be rerun.
- Future workflow automation can build on the file model without changing the canonical task storage format.
