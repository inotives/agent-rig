# Phase 4: Live State and Launch

## Goal

Expose the current workspace state and help users launch configured subscription tools with the right instruction files.

## Scope

- `agent-rig status`
- `agent-rig start`
- Session state file shape
- Queue and handoff log summaries
- Tool entry-context symlink resolution
- Printed launch commands for Claude, Codex, OpenCode, and custom tools

## Out of Scope

- Watch daemon
- Headless invocation
- Blocker notifications
- Opening terminals or tmux sessions

## Acceptance Criteria

- `agent-rig status` reads live `session.json` and lists all agents.
- Status output includes pending queue counts per agent and the last 5 handoff entries total.
- `agent-rig start --agent <name>` resolves the agent's tool entry-context path.
- Start prints the exact launch command and does not open terminals in MVP.
- Missing tool configuration fails before mutating symlinks.

## MVP Session State

`session.json` contains only live summary state:

- `version`
- `created_at`
- `updated_at`
- `agents`: map of agent name to `{ role, tool, status, last_seen_at }`
- `current_task_id`
- `blockers`: array of `{ id, agent, message, created_at }`

Queues and logs remain as files and are not duplicated into `session.json`.

## Status Output

- Show all configured agents with role, tool, and live status.
- Show pending queue counts per agent.
- Show the last 5 handoff entries across the workspace.
- Detailed log tailing belongs to `agent-rig logs`, not `agent-rig status`.

## Open Decisions

None.
