# ADR 0002: Agent Profiles Are Copy-Only Templates

## Status

Accepted

## Context

AgentRig needs reusable starting instructions for common agent roles such as planner, worker, and reviewer. One option is to store a profile reference in `agent.toml` and treat profiles as runtime dependencies. Another option is to copy profile Markdown into each agent's `instructions.md` at creation time.

Agent instructions are expected to be edited by humans for each project and role. AgentRig should not force a fixed hierarchy or workflow model into `agent.toml`.

## Decision

Agent profiles are plain Markdown templates. When an agent is created with a profile, AgentRig copies the full profile Markdown into that agent's `instructions.md`.

AgentRig does not store the source profile in `agent.toml`. After copy, the agent owns its `instructions.md`.

In an initialized workspace, `.agent-rig/_shared/profiles/` is the source of truth for future profile copies. Existing agent instructions are not overwritten automatically.

## Consequences

- Users can freely edit `instructions.md` without profile drift warnings.
- Shared profiles can be customized for future agents without changing existing agents.
- AgentRig avoids baking workflow hierarchy into the mechanical agent schema.
- Reapplying a profile to an existing agent is deferred because it requires overwrite, backup, and force semantics.
