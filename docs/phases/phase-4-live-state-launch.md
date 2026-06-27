# Phase 4: Live State and Launch

## Goal

Expose the current workspace state and help users launch configured subscription tools with the right instruction files.

Phase 4 assumes a terminal-per-agent launch model. The human runs one subscription CLI per terminal and points it at the matching AgentRig agent folder:

- Claude can be launched against a planner or reviewer agent folder.
- Codex can be launched against a worker agent folder.
- OpenCode can be launched against a verifier agent folder.
- Later watch-loop work can observe any running agent, including planner, worker, reviewer, verifier, and custom roles.

## Scope

- `agent-rig status`
- `agent-rig status --json`
- `agent-rig start`
- Session state file shape
- Queue and handoff log summaries
- Shared handoff skill installation
- Tool entry-context resolution
- Neutral launch instructions for known tools when exact CLI flags are not verified

## Out of Scope

- Watch daemon
- Headless invocation
- Blocker notifications
- Opening terminals or tmux sessions

## Acceptance Criteria

- `agent-rig status` reads live `session.json` and lists all agents.
- `agent-rig status --json` returns stable structured status data for tests and later watch-loop integration.
- Status output includes pending queue counts per agent and the last 5 handoff entries total.
- `agent-rig start --agent <name>` resolves the agent's tool entry-context path.
- Start uses `.agent-rig/<agent>/instructions.md` as the primary entry context and does not load the whole agent folder.
- Start prints neutral launch instructions and does not open terminals in MVP.
- Start prints credential env file paths and declared credential keys that apply to the agent, but never prints values.
- Missing or invalid tool configuration fails before printing launch instructions.

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
- `agent-rig status` is read-only. It does not update `session.json`, agent statuses, or timestamps.
- `agent-rig status --json` returns the same status model used by human-readable output.
- Show pending queue counts per agent.
- Pending queue counts are shallow JSON-array counts only.
- Count `.agent-rig/_shared/task_queue.json` and `.agent-rig/<agent>/queue.json`.
- If a queue file is missing or invalid, status shows `error` for that queue and leaves detailed diagnosis to `agent-rig validate`.
- Show the last 5 handoff entries across the workspace.
- Handoff entries are read only from `.agent-rig/_shared/handoff_logs/*.md`.
- Handoff filenames use `<date-YYYY-MM-DD-hhmm>_<session_id>_<tool>_<role>.md`, for example `2026-06-27-1430_abc123_codex_worker.md`.
- Status sorts handoff logs by filename descending and shows the latest 5 total.
- `agent-rig status` displays only handoff files that match the filename format.
- `agent-rig validate` warns on non-matching `.md` files in `_shared/handoff_logs/`.
- Detailed log tailing belongs to `agent-rig logs`, not `agent-rig status`.

## Handoff Skill

- Phase 4 adds a shared AgentRig handoff skill so all agents can write handoff logs consistently.
- The handoff skill is part of AgentRig's default shared skills for new workspaces and `agent-rig skills add-defaults`.
- Install source: `https://github.com/mattpocock/skills`
- Skill name: `handoff`
- Underlying command: `npx skills add https://github.com/mattpocock/skills --skill handoff`
- Installed location: `.agent-rig/_shared/skills/handoff`
- `agent-rig status` and `agent-rig start` do not install missing skills; they remain read-only.
- Phase 4 implementation updates AgentRig's default shared skill list so new workspaces and `agent-rig skills add-defaults` include `handoff`.

## Open Decisions

None.

## Test Scope

Phase 4 includes focused tests for:

1. `agent-rig status` on a fresh scaffold lists the worker and queue counts.
2. `agent-rig status --json` returns agents, queues, and handoff summaries.
3. Invalid queue JSON shows queue `error` in status output.
4. Handoff logs display the latest 5 matching filenames only.
5. `agent-rig start --agent worker` prints the configured tool, project cwd, instructions path, credential paths and keys, and skill precedence note.
6. `agent-rig start` rejects unknown agents or unknown tools.

## Implementation Decisions

- `agent-rig start --agent <name>` resolves the selected agent folder and role instructions as the entry context for that agent's configured subscription tool.
- Phase 4 launch behavior is designed around multiple terminals, one terminal per running agent.
- `agent-rig start --agent <name>` prints neutral launch instructions for the human to follow. It does not execute the subscription CLI in Phase 4.
- `agent-rig start --agent <name>` is read-only in Phase 4. It does not create symlinks, write tool config, launch terminals, or update session state.
- Watch-loop behavior is agent-agnostic. It is not limited to verifier or reviewer roles.
- The primary entry context is `.agent-rig/<agent>/instructions.md`. The printed command must not preload the whole agent folder, because that would waste the subscription tool's context window.
- The agent folder remains the agent home/reference location. The instructions file points the tool to shared context, agent-local context, queue files, and logs as paths to inspect when needed.
- Subscription tools may also load globally installed skills, tools, or user configuration outside AgentRig. Phase 4 launch output must make this visible rather than implying a fully isolated runtime.
- AgentRig's intended skill precedence is agent-local skills first, shared AgentRig skills second, and tool-global skills last. If duplicate skill names exist, the agent instructions should tell the running tool to prefer `.agent-rig/<agent>/skills/` over `.agent-rig/_shared/skills/`, and both over global tool skills.
- If AgentRig can detect similarly named global skills, `agent-rig start` should warn that AgentRig assumes local AgentRig skills take precedence. The human can update the AgentRig-local skill to match global behavior when desired.
- Duplicate global skill names are warnings only, not validation errors.
- Phase 4 does not implement tool-specific global skill probing. It prints a generic precedence warning based on AgentRig local/shared skills; reliable per-tool global skill detection can be added later.
- Phase 4 does not hardcode unverified Claude, Codex, or OpenCode flags. Start output prints the configured tool name, project root cwd, entry instructions path, and a neutral instruction to start that tool CLI in the terminal and load or reference the instructions file.
- Start output includes `.agent-rig/.creds/_shared.env` and `.agent-rig/.creds/<agent>.env` paths plus declared shared and agent credential keys. Phase 4 does not inject env values or run headless tools.
