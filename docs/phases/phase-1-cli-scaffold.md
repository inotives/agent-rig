# Phase 1: CLI Scaffold

## Goal

Create the installable TypeScript CLI shell for AgentRig and make `agent-rig init` scaffold a minimal `.agent-rig/` workspace.

## Scope

- npm package and executable command named `agent-rig`
- Minimum runtime: Node.js 20
- TypeScript project layout for CLI commands and shared modules
- `agent-rig init` interactive wizard that interviews for the user's setup pattern
- `agent-rig init --yes` scaffolding a solo `worker` agent using `codex`
- Initial `.agent-rig/` directory tree
- Built-in setup patterns: solo, coder-reviewer, trinity, supervisor-worker, swarm, testing-reviewer, and custom
- Built-in role templates for supervisor, planner, worker, verifier, reviewer, tester, and custom
- Generated gitignore protection for `.agent-rig/.creds/`

## Out of Scope

- Headless agent execution
- Watch daemon
- Terminal launching
- Runtime status rendering beyond scaffold confirmation

## Acceptance Criteria

- `npx agent-rig init` works in an empty project.
- `agent-rig init` can scaffold a one-agent workspace.
- `agent-rig init --yes` creates a usable solo `worker` workspace using `codex`.
- Multi-agent patterns scaffold only the agents selected by the user.
- Scaffold creates `_shared/`, per-agent folders, `agent.toml`, `instructions.md`, `context.md`, queues, logs, and credential directories.
- `.agent-rig/.creds/.gitignore` blocks credential commits.
- Re-running `agent-rig init` on an existing `.agent-rig/` refuses and points users to `agent-rig add`.

## Wizard Questions

1. Detect project context and ask whether to seed shared context from README when available.
2. Ask for setup pattern: solo, coder-reviewer, trinity, supervisor-worker, swarm, testing-reviewer, or custom.
3. Pre-fill agents from the selected pattern.
4. For each agent, ask for name, role template, and subscription tool.
5. Confirm the `.agent-rig/` tree before writing files.
6. Ask whether to add `.agent-rig/` to the project `.gitignore`.

## Open Decisions

None.
