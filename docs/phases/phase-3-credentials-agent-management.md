# Phase 3: Credentials and Agent Management

## Goal

Let users add agents and manage per-agent credential declarations without exposing secrets to the wrong agent.

## Scope

- `agent-rig add`
- `agent-rig agents`
- `agent-rig creds`
- Per-agent credential declaration files
- Shared credential declaration support
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

## Credential Files

- Real secret values live in `.agent-rig/.creds/**/*.env` and remain gitignored.
- Matching `.env.example` files contain the same keys with empty values and may be committed.
- Command output never prints secret values.
- Redact any value whose key contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, or `CREDENTIAL`.
- Redact every value read from `.agent-rig/.creds/` regardless of key name.

## Open Decisions

None.
