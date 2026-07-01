# Phase 10: Task Lifecycle and Shared Queue Flow

## Goal

Improve AgentRig task management after Phase 8 by adding explicit lifecycle commands and making canonical shared Markdown tasks usable as the practical queue for agents.

## Scope

Phase 10 starts from the existing `.agent-rig/_shared/tasks/*.md` task model.

- Add task lifecycle mutation commands.
- Add a task `type` metadata field separate from task `status`.
- Add dependency-aware task selection.
- Add commands that help humans and agents identify the next actionable task.
- Migrate the watch-loop path to canonical shared tasks.
- Remove the legacy per-agent task queue path.
- Update validation, docs, README, and profile instructions for the lifecycle workflow.

## Out of Scope

- Database-backed task storage.
- Real Claude, Codex, OpenCode, or shell command orchestration.
- Background daemon behavior.
- Continuous watch mode. Phase 10 only changes `agent-rig watch --once`.
- Multi-user locking or conflict resolution.
- Backward compatibility for the old `agent-rig task add` per-agent queue.
- Web dashboard or TUI task board.
- Full project-management concepts such as sprints, estimates, labels, milestones, or assignees beyond current agent assignment.
- GitHub Issues sync or any remote backlog ingestion. This is deferred to Phase 11.

## Initial Recommendation

Treat `status` as lifecycle state and `type` as work category.

Recommended task types:

```yaml
type: task | bug | story | epic | chore | research | doc
```

Recommended task statuses:

```yaml
status: todo | ready | in_progress | blocked | review | done
```

Recommended lifecycle:

```text
todo -> ready -> in_progress -> review -> done
             \-> blocked
in_progress -> blocked
review -> ready
review -> blocked
blocked -> todo | ready | in_progress
```

`todo` is the backlog state: captured, but not ready for work. `story` and `epic` are task types, not statuses.

## Proposed Commands

```bash
agent-rig tasks set-status <task-id> <status>
agent-rig tasks assign <task-id> <agent-name>
agent-rig tasks set-type <task-id> <type>
agent-rig tasks block <task-id> --reason <reason>
agent-rig tasks unblock <task-id> --status <todo|ready|in_progress>
agent-rig tasks done <task-id> [--message <message>]
agent-rig tasks next [--agent <agent-name>] [--json] [--claim]
```

Phase 10 should use separate lifecycle subcommands instead of a generic metadata update command.

## Acceptance Criteria

- `agent-rig tasks create` writes `type: task` by default.
- `agent-rig tasks create` supports `--type <type>`.
- `agent-rig validate` warns for invalid task `type`.
- `agent-rig tasks set-status <id> <status>` updates task frontmatter and `updated_on`.
- `agent-rig tasks assign <id> <agent>` updates `assigned_to` and `updated_on`.
- `agent-rig tasks block <id> --reason <reason>` sets status to `blocked` and records the blocker reason in the task file.
- `agent-rig tasks unblock <id> --status <status>` clears the active blocker and moves the task to an allowed status.
- `agent-rig tasks done <id>` sets status to `done`.
- `agent-rig tasks done <id> --message <message>` stores a short latest completion message.
- `agent-rig tasks next` returns the first actionable task whose dependencies are complete.
- `agent-rig tasks next --agent <agent>` filters by assignment.
- `agent-rig tasks next --claim` updates the selected task to `in_progress`.
- `agent-rig tasks --json` includes task type and dependency readiness information.
- `agent-rig status` reports task lifecycle counts from shared task files.
- `agent-rig watch --once` skips ready shared tasks with no `assigned_to` and reports a warning.
- `agent-rig watch --once` is the only watch behavior changed; continuous watch remains out of scope.
- `agent-rig validate` warns when a ready shared task has no `assigned_to`.
- `agent-rig --help` documents `tasks` and `watch` behavior after the legacy queue removal.
- `agent-rig tasks --help` documents lifecycle subcommands and important flags.
- Docs explain the backlog-to-done lifecycle and type/status split.
- Tests cover lifecycle mutations, dependency-aware next selection, type validation, and docs-visible command behavior.

## Open Questions

1. Should lifecycle commands enforce allowed state transitions, or allow any valid status update? Accepted: allow any valid status update for now, but document the recommended lifecycle.
2. Should `blocked` store only one active reason or an append-only blocker history? Accepted: store the active blocker in frontmatter and append blocker history to the Markdown body.
3. Should `tasks next` include `todo` items, or only `ready` items? Accepted: only `ready` items are actionable.
4. Should `epic` and `story` tasks be allowed to move to `in_progress`, or should they primarily group child tasks? Accepted: task types are descriptive and should not block lifecycle transitions.
5. How much should Phase 10 change `agent-rig watch`, given `watch` currently uses the legacy per-agent task queue? Accepted: migrate `watch` to shared tasks and remove the legacy queue path.
6. Should Phase 10 keep the old `agent-rig task add` command as legacy, or deprecate it in docs? Accepted: remove the old legacy command/path because there are no active external users yet.

## Accepted Decisions

### Lifecycle Commands Allow Any Valid Status

Phase 10 lifecycle commands should accept any status in the supported status set:

```yaml
status: todo | ready | in_progress | blocked | review | done
```

AgentRig should document the recommended lifecycle, but it should not reject valid manual recovery moves such as `done -> ready`, `blocked -> todo`, or `review -> in_progress`.

This keeps the filesystem-first workflow flexible while the project still relies on humans and agents editing local Markdown task files directly.

### Blocked Tasks Store Active Reason and History

When a task is blocked, Phase 10 should store the current blocker in frontmatter:

```yaml
status: blocked
blocked_reason: Need npm token with publish rights.
blocked_on: 2026-07-01
```

The task body should also maintain an append-only Markdown section:

```md
## Blockers

- 2026-07-01: Need npm token with publish rights.
```

`blocked_reason` gives agents one obvious current blocker to read. The `## Blockers` section gives humans and agents history without introducing a separate blocker log file.

### Next Task Selection Uses Ready Tasks Only

`agent-rig tasks next` should only return tasks with:

```yaml
status: ready
```

`todo` is the backlog state. It means the task is captured but not yet prepared for agent work. A human or planner must move a task from `todo` to `ready` after the task has enough context, scope, and acceptance criteria.

Dependency checks still apply: a `ready` task is actionable only when every `depends_on` task is `done`.

### GitHub Issues Sync Deferred

GitHub Issues sync should not be included in Phase 10. Phase 10 stays focused on local filesystem task lifecycle behavior.

GitHub Issues backlog ingestion is deferred to Phase 11.

### Task Types Are Descriptive

Phase 10 adds this task type set:

```yaml
type: task | bug | story | epic | chore | research | doc
```

Types describe the kind of work. They do not restrict lifecycle transitions.

Expected usage:

- `task`: normal implementation work.
- `bug`: defect fix.
- `story`: user-facing capability or behavior.
- `epic`: larger grouping item, usually parent for stories or tasks.
- `chore`: maintenance, cleanup, release, or tooling.
- `research`: investigation or discovery work.
- `doc`: documentation work.

`epic` and `story` are usually planning/grouping concepts, but AgentRig should not prevent them from moving to `in_progress`, `review`, or `done` when that matches the user's workflow.

### Watch Uses Shared Tasks Only

Phase 10 should migrate `agent-rig watch --once` to use canonical task files under:

```text
.agent-rig/_shared/tasks/
```

The old per-agent task queue path created by `agent-rig task add` should be removed instead of kept as a fallback. AgentRig is still early and has no active external users, so backward compatibility is not required for this migration.

Watch selection should:

1. Find shared tasks with `status: ready`.
2. Exclude tasks whose `depends_on` references are not `done`.
3. Use `assigned_to` as the target agent when present.
4. Skip tasks with no `assigned_to` unless a future explicit default-agent behavior is added.
5. Move the selected task through the watch-loop status updates in the shared task file.

Ready tasks without `assigned_to` should be skipped by `watch --once` and reported clearly:

```text
task-0001 ready but has no assigned_to; skipped by watch
```

`agent-rig validate` should warn for ready shared tasks with no assignee because they are not executable by watch.

Watch status updates should use only canonical shared task statuses:

```text
ready -> in_progress -> done
ready -> in_progress -> blocked
```

The old watch-loop `running` status should be removed. `in_progress` is the canonical active-work state.

Watch should keep the existing task, run, and handoff split:

- Task file: current state, task brief, lifecycle metadata, and short latest message.
- Agent `runs/`: agent-local execution record and future raw adapter artifacts.
- Shared `handoff_logs/`: concise cross-agent summary for the next human or agent.

Detailed run output should not be appended directly into the task file.

### Separate Lifecycle Subcommands

Phase 10 should use separate lifecycle subcommands:

```bash
agent-rig tasks set-status task-0001 ready
agent-rig tasks assign task-0001 worker
agent-rig tasks set-type task-0001 bug
agent-rig tasks block task-0001 --reason "Need API key"
agent-rig tasks unblock task-0001 --status ready
agent-rig tasks done task-0001
```

Do not add a generic `agent-rig tasks update` command in Phase 10. Specific commands are clearer for humans and agents, and commands such as `block` have behavior beyond simple frontmatter mutation.

The CLI help output must document these commands:

```bash
agent-rig --help
agent-rig tasks --help
```

### Next Is Read-Only Unless Claimed

`agent-rig tasks next` should be read-only by default.

```bash
agent-rig tasks next --agent worker
```

To mutate the selected task, the caller must pass `--claim`:

```bash
agent-rig tasks next --agent worker --claim
```

Claiming a task sets:

```yaml
status: in_progress
updated_on: <today>
```

Claiming does not add separate `claimed_by` or `claimed_on` fields. `assigned_to` remains the ownership field to keep task metadata small.

This keeps inspection safe for humans and scripts while still giving agents an explicit way to claim work.

### Done Allows Flexible Completion

`agent-rig tasks done <task-id>` should allow marking any valid task as done. It should not require the task to already be in `review`.

An optional message can update the task's latest message:

```bash
agent-rig tasks done task-0001 --message "Verified npm publish works."
```

```yaml
status: done
updated_on: 2026-07-01
message: Verified npm publish works.
```

### Lifecycle Commands Preserve Task Body

Task mutation commands should preserve the Markdown body exactly unless the command explicitly manages a body section.

Default mutation scope:

- Update YAML frontmatter fields such as `status`, `type`, `assigned_to`, `updated_on`, `message`, and `blocked_reason`.
- Preserve the Markdown body as-is.
- Let `tasks block` append to `## Blockers` because blocker history is a managed body section.

Planner and human-authored task details should not be reformatted by lifecycle commands.

### Frontmatter Uses Stable Field Order

Lifecycle commands should rewrite YAML frontmatter in a stable order:

```yaml
id:
title:
type:
status:
assigned_to:
created_by:
created_on:
updated_on:
priority:
parent:
depends_on:
blocked_reason:
blocked_on:
message:
run_id:
started_at:
finished_at:
source:
```

Frontmatter is machine-managed metadata. Stable ordering keeps diffs predictable and helps agents scan task files.

Fields with empty values may be omitted except the core task fields needed for listing and validation.

## Documentation Deliverables

- Update `docs/tasks.md` with lifecycle commands, task types, and next-task selection.
- Update `docs/project_specs.md` to reflect the shared task lifecycle.
- Update `README.md` command examples.
- Update profile templates so planner, worker, reviewer, researcher, and writer understand the lifecycle states.
- Add an ADR only if Phase 10 makes a hard-to-reverse decision about replacing the legacy per-agent queue path.
