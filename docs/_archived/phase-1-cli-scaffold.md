# Phase 1: CLI Scaffold

## Goal

Create the installable TypeScript CLI shell for AgentRig and make `agent-rig init` scaffold a minimal `.agent-rig/` workspace.

## Scope

- npm package and executable command named `agent-rig`
- Minimum runtime: Node.js 20
- Global install flow via npm or pnpm, then run from inside the user's project repo
- TypeScript project layout for CLI commands and shared modules
- `agent-rig init` interactive wizard that interviews for the user's setup pattern
- `agent-rig init --yes` scaffolding a solo `worker` agent using `codex`
- Phase 1 does not implement `--pattern` or `--agents` flags
- Minimum MVP `.agent-rig/` directory tree
- Built-in setup patterns: solo, coder-reviewer, trinity, supervisor-worker, swarm, testing-reviewer, and custom
- Built-in role templates for supervisor, planner, worker, verifier, reviewer, tester, and custom
- Short role-specific starter `instructions.md` files
- Generated gitignore protection for `.agent-rig/.creds/`

## Out of Scope

- Headless agent execution
- Watch daemon
- Terminal launching
- Runtime status rendering beyond scaffold confirmation

## Acceptance Criteria

- `npx agent-rig init` works in an empty project.
- `agent-rig init` scaffolds into the current working directory.
- `agent-rig init` can scaffold a one-agent workspace.
- Interactive `agent-rig init` can scaffold every built-in setup pattern.
- `agent-rig init --yes` creates a usable solo `worker` workspace using `codex`.
- `--pattern` and `--agents` are rejected with a clear "not implemented in Phase 1" message.
- Multi-agent patterns scaffold only the agents selected by the user.
- Scaffold creates `_shared/`, `.creds/`, selected agent folders, and `human/`.
- Scaffold does not create placeholder channel drivers, tool scripts, or unused capability folders in Phase 1.
- Generated `instructions.md` files identify the agent, role, tool, key paths, and shared context location.
- Phase 1 does not generate the full seven-section runtime instruction contract.
- Scaffold creates an empty `_shared/task_queue.json` for later validation and watch phases.
- Scaffold creates a minimal `_shared/session.json` using the Phase 4 MVP session shape.
- Scaffold creates `_shared/agent-rig.json` with workspace format metadata and scaffold version `0.0.1`.
- `_shared/context.md` is a short generated file with project name, detected type, and a README reference when available.
- Phase 1 does not copy full README content into `_shared/context.md`.
- Phase 1 `agent.toml` includes only `role`, `tool`, and minimal path refs needed by scaffolded files.
- Credential declarations and path-heavy config are deferred to Phase 2 and Phase 3.
- Interactive `init` asks before adding `.agent-rig/` to the project `.gitignore`.
- `init --yes` adds `.agent-rig/` to the project `.gitignore` automatically.
- `.agent-rig/.creds/.gitignore` is always created.
- Phase 1 includes three small tests: `init --yes` solo scaffold, existing `.agent-rig/` refusal, and one mocked interactive multi-agent scaffold.
- Phase 1 does not include a broad fixture suite.
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
