# Phase 3: Credentials and Agent Management

## Goal

Let users add agents and manage per-agent credential declarations without exposing secrets to the wrong agent.

## Scope

- `agent-rig add`
- `agent-rig agents`
- `agent-rig creds`
- `agent-rig skills add`
- `agent-rig skills list`
- Per-agent credential declaration files
- Shared credential declaration support
- Shared and agent-local skills installation
- Gitignored `.env` placeholder files for local secret values
- Commit-safe `.env.example` files documenting required keys
- Env-file loading rules for later headless invocation
- Validation integration for credential files and `.gitignore`

## Out of Scope

- Calling external subscription tools
- Running headless agents
- Slack, GitHub, or MCP driver implementation

## Acceptance Criteria

- `agent-rig add` creates a new valid agent folder.
- `agent-rig agents` lists configured agents and their tools.
- `agent-rig creds` edits or initializes credential declarations without printing secret values.
- `agent-rig creds` creates gitignored `.env` placeholders and commit-safe `.env.example` files.
- Agent-specific credentials remain scoped to that agent.
- `_shared.env` plus agent-specific `.env` can be resolved deterministically for later use.
- Custom roles and agent folder names use lowercase slugs: `a-z`, `0-9`, and `-`; must start with a letter; max 40 characters.
- `agent-rig skills add <owner/repo> --shared` installs a skill into `.agent-rig/_shared/skills/`.
- `agent-rig skills add <owner/repo> --agent <name>` installs a skill into `.agent-rig/<agent>/skills/`.
- `agent-rig skills list` shows shared skills and agent-local skills.

## Credential Files

- Real secret values live in `.agent-rig/.creds/**/*.env` and remain gitignored.
- Matching `.env.example` files contain the same keys with empty values and may be committed.
- Command output never prints secret values.
- Redact any value whose key contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, or `CREDENTIAL`.
- Redact every value read from `.agent-rig/.creds/` regardless of key name.

## Skills

AgentRig wraps the skills.sh install flow instead of implementing its own skill registry.

Planned commands:

```bash
agent-rig skills add <owner/repo> --shared
agent-rig skills add <owner/repo> --agent worker
agent-rig skills list
agent-rig skills list --agent worker
```

- Use `npx skills add <owner/repo>` as the underlying install flow.
- Shared skills live in `.agent-rig/_shared/skills/`.
- Agent-local skills live in `.agent-rig/<agent>/skills/`.
- Skill directories are created on demand.
- Phase 3 default shared skills: `find-skills` and `skill-creator`.
- Phase 3 validates destination agent names but does not run installed skills.

## Open Decisions

None.
