# Phase 2: Workspace Model and Validation

## Goal

Define and enforce the filesystem contract for AgentRig workspaces.

## Scope

- Typed parser for `agent.toml`
- Workspace discovery from project root
- Agent folder identity rules
- Shared versus agent-local path resolution
- `agent-rig validate`
- Validation for referenced files, writable paths, queue files, handoff log paths, and credential gitignore safety
- Small test fixtures for valid and invalid workspaces

## Out of Scope

- Credential editing UI
- Agent launch behavior
- Watch daemon behavior

## Acceptance Criteria

- `agent-rig validate` passes on a freshly scaffolded workspace.
- Invalid `agent.toml` files fail with actionable messages.
- Unknown `agent.toml` fields warn but do not fail validation.
- Missing referenced files are reported.
- Credential directories are verified as ignored.
- Validation does not execute agent tools or mutate workspace state.
- Validation reports problems only; it does not auto-fix missing files.

## Validation Behavior

- Validation fails for fields AgentRig depends on: agent identity, role, tool, file paths, writable paths, queues, handoff logs, and credential safety.
- Unknown `agent.toml` fields are reported as warnings only.
- Validation is read-only. Scaffold and add commands own file creation.
- Use an existing npm TOML parser dependency. Do not implement a custom TOML parser.

## Open Decisions

None.
