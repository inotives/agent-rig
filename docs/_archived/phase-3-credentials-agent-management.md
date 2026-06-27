# Phase 3: Credentials and Agent Management

## Goal

Let users add agents and manage per-agent credential declarations without exposing secrets to the wrong agent.

## Scope

- `agent-rig add`
- `agent-rig agents`
- `agent-rig creds init`
- `agent-rig creds list`
- `agent-rig skills add`
- `agent-rig skills add-defaults`
- `agent-rig skills list`
- Per-agent credential declaration files
- Shared credential declaration support
- Shared and agent-local skills installation
- Gitignored `.env` placeholder files for local secret values
- Commit-safe `.env.example` files documenting required keys
- Env-file loading rules for later headless invocation
- Validation integration for credential files and `.gitignore`
- Validation checks skills folders only when present; missing default skills do not fail validation.
- Validation checks credential declaration TOML shape and `.env.example` key consistency without requiring real secret values.

## Out of Scope

- Calling external subscription tools
- Running headless agents
- Slack, GitHub, or MCP driver implementation

## Acceptance Criteria

- `agent-rig add <name> --role <role> --tool <tool>` creates a new valid agent folder.
- `agent-rig agents` lists configured agents and their tools.
- `agent-rig agents --json` returns stable structured agent records.
- `agent-rig creds` initializes or updates credential declarations without printing secret values.
- `agent-rig creds` creates gitignored `.env` placeholders and commit-safe `.env.example` files.
- Agent-specific credentials remain scoped to that agent.
- `_shared.env` plus agent-specific `.env` can be resolved deterministically for later use.
- Custom roles and agent folder names use lowercase slugs: `a-z`, `0-9`, and `-`; must start with a letter; max 40 characters.
- `agent-rig add` allows valid custom role slugs and warns when the role is not built in.
- `agent-rig skills add <owner/repo> --shared` installs a skill into `.agent-rig/_shared/skills/`.
- `agent-rig skills add <owner/repo> --agent <name>` installs a skill into `.agent-rig/<agent>/skills/`.
- `agent-rig skills add <owner/repo>` requires exactly one destination flag: `--shared` or `--agent <name>`.
- `agent-rig skills add-defaults` installs default shared skills into `.agent-rig/_shared/skills/`.
- `agent-rig skills list` shows shared skills and agent-local skills.
- `agent-rig skills list --agent <name>` shows shared skills and agent-local skills in separate groups. If names collide, the agent-local skill is marked as overriding shared.

## Credential Files

Planned commands:

```bash
agent-rig creds init --shared AGENTRIG_GITHUB_SHARED_APIKEY AGENTRIG_SLACK_SHARED_SECRET
agent-rig creds init --agent worker AGENTRIG_GITHUB_WORKER_APIKEY
agent-rig creds list
agent-rig creds list --agent worker
```

- Real secret values live in `.agent-rig/.creds/**/*.env` and remain gitignored.
- `.agent-rig/.creds/.gitignore` allows `.gitignore`, `*.toml`, and `*.env.example`, but ignores real `*.env` secret files.
- Credential declarations live in `.agent-rig/.creds/*.toml` and are the Phase 3 source of truth.
- Shared credentials use `.agent-rig/.creds/_shared.toml`.
- Agent credentials use `.agent-rig/.creds/<agent>.toml`.
- Matching `.env.example` files contain the same keys with empty values and may be committed.
- Empty `.env` placeholders are generated beside the declarations and remain gitignored.
- Credential env keys use the format `AGENTRIG_<SERVICE>_<SCOPE>_<KIND>`, for example `AGENTRIG_GITHUB_WORKER_APIKEY`.
- Credential env key scope is strict: `_shared.toml` keys must use `SHARED`; `<agent>.toml` keys must use the uppercased agent name with `-` converted to `_`.
- Command output never prints secret values.
- Redact any value whose key contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, or `CREDENTIAL`.
- Redact every value read from `.agent-rig/.creds/` regardless of key name.

Env-file resolution for later headless invocation:

1. Load `.agent-rig/.creds/_shared.env`.
2. Load `.agent-rig/.creds/<agent>.env`.
3. Agent-specific keys override shared keys on conflict.
4. Missing `.env` files are allowed in Phase 3 because placeholders may be empty or unfilled.

Credential declaration shape:

```toml
[keys.AGENTRIG_GITHUB_WORKER_APIKEY]
description = ""

[keys.AGENTRIG_SLACK_SHARED_SECRET]
description = ""
```

## Skills

AgentRig wraps the skills.sh install flow instead of implementing its own skill registry.

Planned commands:

```bash
agent-rig skills add <owner/repo> --shared
agent-rig skills add <owner/repo> --agent worker
agent-rig skills add-defaults
agent-rig skills list
agent-rig skills list --agent worker
```

- Use `npx skills add <owner/repo>` as the underlying install flow.
- Shared skills live in `.agent-rig/_shared/skills/`.
- Agent-local skills live in `.agent-rig/<agent>/skills/`.
- AgentRig runs `npx skills add <owner/repo>` with the target skills directory as the current working directory.
- If the upstream `skills` CLI cannot install into the selected destination this way, Phase 3 fails with an actionable message instead of implementing a custom installer.
- Skill directories are created on demand.
- Phase 3 default shared skills: `find-skills` and `skill-creator`.
- Phase 3 validates destination agent names but does not run installed skills.
- After Phase 3 lands, `agent-rig init` installs default shared skills for new workspaces.
- Existing workspaces can run `agent-rig skills add-defaults` to install the default shared skills.
- Default skills are installed into shared skills only, not copied into each agent folder.

## Implementation Decisions

- Phase 3 keeps `add`, `agents`, `creds`, and `skills` in one implementation phase.
- `agent-rig add` is non-interactive in Phase 3. The supported form is `agent-rig add <name> --role <role> --tool <tool>`.
- Unknown but valid custom role slugs are allowed with a warning. When the command is running in an interactive-capable terminal, the warning should prompt the human to add the new role to the known role listing if it should become reusable.
- Phase 3 does not add a persistent custom role registry. Custom roles live in each agent's `agent.toml`; reusable role templates can be added in a later phase.
- `agent-rig add` creates only the agent folder and agent-local files. It does not create credential declarations; users add those explicitly with `agent-rig creds init --agent <name>`.
- `agent-rig agents` prints a human-readable table with `name`, `role`, `tool`, credential declaration status, and skills folder status.
- `agent-rig agents --json` returns stable structured records for tests and future UI integration.
- Default shared skills are installed during `agent-rig init` for new workspaces after Phase 3 lands. Existing workspaces use `agent-rig skills add-defaults`.
- `agent-rig skills add-defaults` installs defaults into `.agent-rig/_shared/skills/` only.
- Tests should not depend on live `npx skills` network behavior; use dry-run/mocking or fixture-installed skill folders where possible.
- Skills installation delegates to `npx skills add <owner/repo>` from the destination skills directory. AgentRig does not implement its own skills registry or copy protocol in Phase 3.
- `agent-rig skills add` requires exactly one destination flag. It does not default to shared.
- `agent-rig skills list --agent <name>` follows skill resolution order: shared skills first, then agent-local skills, with agent-local overrides marked.
- `agent-rig validate` does not require default skills. Missing defaults are corrected by `agent-rig skills add-defaults`, not by validation failure.
- Skills support stays shallow in Phase 3: validate destinations, invoke the `npx skills add` flow, and list installed skill folders.
- `agent-rig creds` does not collect, print, or edit real secret values in Phase 3. It only initializes or updates credential declarations, commit-safe `.env.example` files, and gitignored empty `.env` placeholders.
- Credential TOML declarations are the source of truth for required env keys and optional descriptions. AgentRig generates matching `.env.example` and empty `.env` placeholders from those declarations.
- `agent-rig creds init` creates empty descriptions by default. Users can edit descriptions in TOML manually.
- `agent-rig creds init --shared KEY [KEY...]` initializes or updates shared credential declarations.
- `agent-rig creds init --agent <name> KEY [KEY...]` initializes or updates agent-scoped credential declarations.
- `agent-rig creds init` accepts full credential env names only. It does not generate names from shorthand service/kind arguments in Phase 3.
- `agent-rig init` does not create default credential declarations. Credentials are declared only when the user runs `agent-rig creds init`.
- Phase 3 updates `.agent-rig/.creds/.gitignore` to allow committing `*.toml` and `*.env.example` while continuing to ignore real `*.env` files.
- After Phase 3 lands, `agent-rig init` writes the updated `.creds/.gitignore` allowlist for new workspaces.
- `agent-rig creds init` repairs old Phase 1 `.creds/.gitignore` files when needed so declaration TOML and `.env.example` files can be committed.
- `agent-rig creds list` shows declared shared and agent-scoped credential keys without values.
- `agent-rig creds list --agent <name>` shows shared keys and agent keys in separate groups. If the same key exists in both, the agent key is marked as overriding the shared key.
- Later headless invocation resolves env files by loading `_shared.env` first and `<agent>.env` second. Agent-scoped keys override shared keys on conflict.
- `agent-rig validate` parses `.agent-rig/.creds/*.toml`, checks declared keys are valid AgentRig env names, checks matching `.env.example` files contain the same keys, and keeps rejecting tracked real `.env` files. It does not require secret values.
- AgentRig env name validation requires `AGENTRIG_<SERVICE>_<SCOPE>_<KIND>`. `_shared.toml` requires `SCOPE=SHARED`; `<agent>.toml` requires `SCOPE` to match the uppercased agent name with dashes converted to underscores.

## Open Decisions

None.

## Test Scope

Phase 3 includes focused tests for:

1. `agent-rig add` creates a valid new agent and rejects duplicate or invalid names.
2. `agent-rig agents` and `agent-rig agents --json` list Phase 1 plus added agents.
3. `agent-rig creds init --shared` and `agent-rig creds init --agent <name>` write TOML declarations, `.env.example`, and empty `.env` placeholders.
4. `agent-rig creds list` never prints env values.
5. `agent-rig skills list` reports shared and agent-local fixture folders.
6. `agent-rig skills add` validates destinations and can run in dry-run or mock mode without live network.
