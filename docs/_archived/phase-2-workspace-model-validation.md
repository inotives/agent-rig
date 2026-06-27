# Phase 2: Workspace Model and Validation

## Goal

Define and enforce the filesystem contract for AgentRig workspaces.

## Scope

- Typed parser for `agent.toml`
- Support for Phase 1 flat `agent.toml` and future nested `[agent]` / `[permissions]` TOML shapes
- Workspace discovery from project root
- Agent folder identity rules
- Shared versus agent-local path resolution
- `agent-rig validate`
- `agent-rig validate --json`
- Validation for referenced files, writable paths, queue files, handoff log paths, and credential gitignore safety
- Minimal JSON shape validation for Phase 1 scaffolded JSON files
- Validation of the Phase 1 MVP tree without requiring future capability folders
- Small test fixtures for valid and invalid workspaces

## Out of Scope

- Credential editing UI
- Agent launch behavior
- Watch daemon behavior

## Acceptance Criteria

- `agent-rig validate` passes on a freshly scaffolded workspace.
- `agent-rig validate` requires `.agent-rig/` directly under the current working directory.
- Validation accepts the Phase 1 flat `agent.toml` shape.
- Validation accepts the future nested `[agent]` / `[permissions]` shape.
- If an agent name is present in `agent.toml`, it must match the folder name.
- If no agent name is present, validation infers the name from the folder.
- Invalid `agent.toml` files fail with actionable messages.
- Unknown tools fail validation.
- Unknown roles warn when they are valid lowercase slugs and fail when they are invalid slugs.
- Unknown `agent.toml` fields warn but do not fail validation.
- Missing referenced files are reported.
- Referenced paths may not escape their allowed workspace area.
- Referenced Markdown files must exist and be non-empty.
- Missing future folders like `skills/`, `tools/`, `channels/`, or credential declaration blocks are not errors in Phase 2.
- Scaffolded JSON files are parsed and checked for required top-level shape.
- Credential directories are verified as ignored.
- In git repos, tracked files under `.agent-rig/.creds/` fail validation.
- Validation does not execute agent tools or mutate workspace state.
- Validation reports problems only; it does not auto-fix missing files.
- `agent-rig validate` exits `0` when there are warnings only and exits `1` when there are errors.
- Human-readable output is the default; `--json` prints structured `{ errors: [], warnings: [] }` output.

## Validation Behavior

- Validation fails for fields AgentRig depends on: agent identity, role, tool, file paths, writable paths, queues, handoff logs, and credential safety.
- Flat and nested `agent.toml` shapes are normalized into one internal model before validation.
- Agent identity is folder-first. An explicit TOML name is optional, but must match the folder when present.
- Built-in roles are `supervisor`, `planner`, `worker`, `verifier`, `reviewer`, `tester`, and `custom`.
- Custom role slugs may use `a-z`, `0-9`, and `-`; must start with a letter; max 40 characters.
- Valid tools are `claude`, `codex`, `opencode`, and `custom`.
- `_shared/agent-rig.json` must contain `workspace_version`, `scaffold_version`, `created_by.name`, and `created_by.version`.
- `_shared/session.json` must contain the Phase 4 MVP top-level fields.
- `_shared/task_queue.json` and per-agent `queue.json` must be valid JSON arrays.
- Phase 2 does not validate deep task object schemas.
- If the project is inside a git repo, validation checks `git ls-files` and errors on tracked `.agent-rig/.creds/**` files.
- If the project is not inside a git repo, validation only checks `.agent-rig/.creds/.gitignore`.
- Agent-local refs such as `instructions`, `context`, and `queue` must resolve inside that agent folder.
- Shared refs must resolve inside `.agent-rig/_shared/`.
- `../` path escape is not allowed in Phase 2 validation.
- Phase 2 does not validate the full content contract of `instructions.md` or `context.md`.
- Workspace discovery is CWD-only in Phase 2. It does not walk parent directories.
- Unknown `agent.toml` fields are reported as warnings only.
- Warnings are printed but do not make the command fail.
- JSON output uses the same validation result model as human-readable output.
- Phase 2 validates the Phase 1 MVP tree. Future capability folders are validated only if present.
- Validation is read-only. Scaffold and add commands own file creation.
- Use an existing npm TOML parser dependency. Do not implement a custom TOML parser.

## Test Scope

Phase 2 includes focused tests for:

1. Fresh Phase 1 scaffold validates clean.
2. Invalid TOML fails.
3. Unknown TOML field warns but exits `0`.
4. Missing referenced file fails.
5. Tracked `.agent-rig/.creds/` file fails in a git repo.
6. `--json` returns structured errors and warnings.

## Open Decisions

None.
