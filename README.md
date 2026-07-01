<p align="center">
  <img src="logo.png" alt="agent-rig logo" width="220">
</p>

<h1 align="center">agent-rig</h1>

<p align="center">
  Filesystem-first agent workspaces for Claude, Codex, OpenCode, and custom subscription tools.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-white?style=for-the-badge&labelColor=000000"></a>
  <a href="docs/project_specs.md"><img alt="Status: MVP" src="https://img.shields.io/badge/status-MVP-white?style=for-the-badge&labelColor=000000"></a>
  <img alt="Runtime: Node.js 20" src="https://img.shields.io/badge/runtime-node.js%2020-white?style=for-the-badge&labelColor=000000">
  <img alt="CLI: TypeScript" src="https://img.shields.io/badge/cli-typescript-white?style=for-the-badge&labelColor=000000">
</p>

<p align="center">
  <a href="docs/project_specs.md">Spec</a>
  ·
  <a href="docs/profiles.md">Profiles</a>
  ·
  <a href="docs/tasks.md">Tasks</a>
  ·
  <a href="docs/phases/README.md">Implementation Phases</a>
  ·
  <a href="LICENSE">License</a>
</p>

---

## What It Is

AgentRig is a TypeScript CLI tool for scaffolding a filesystem-first agent workspace into any project.

It creates a `.agent-rig/` directory where agents, shared context, Markdown task files, handoff logs, credentials, and launch instructions live as ordinary files. AgentRig does not orchestrate AI APIs; users run subscription tools such as Claude, Codex, OpenCode, or custom tools directly.

The first filesystem-only MVP is implemented. AgentRig can scaffold a workspace, manage agents and credentials, install profile-declared skills, create Markdown-backed tasks, run the MVP watch loop, and report live status.

## Core Model

AgentRig workspaces are ordinary project files:

```text
.agent-rig/
├── _shared/        # context, task files, session state, profiles, handoff logs
├── .creds/         # gitignored local secrets
├── <agent>/        # agent.toml, instructions.md, context, skills, tools, runs
└── human/          # human approval, unblock, and override helpers
```

The default `agent-rig init --yes` workspace is a solo `worker` agent using `codex`. Interactive setup can scaffold solo, coder-reviewer, trinity, supervisor-worker, swarm, testing-reviewer, or custom patterns.

Agent instructions start from editable profiles in `.agent-rig/_shared/profiles/`. Built-in profiles are `planner`, `worker`, `reviewer`, `researcher`, and `writer`; custom profiles are plain Markdown files with YAML frontmatter.

## Dependencies

Required:

```text
node >= 20
npm or npx
```

AgentRig is packaged as an npm CLI.

## Installation

```bash
npm install -g @inotives/agent-rig
# or
pnpm add -g @inotives/agent-rig
```

Verify the CLI is available:

```bash
agent-rig --help
```

You can also run AgentRig without a global install:

```bash
npx @inotives/agent-rig --help
```

## Setup

Run AgentRig from inside the project you want to scaffold:

```bash
cd path/to/your-project
agent-rig init
```

`agent-rig init` starts a setup interview and writes a `.agent-rig/` workspace into the current project.

For the non-interactive MVP default, scaffold a solo `worker` agent using `codex`:

```bash
agent-rig init --yes
```

Or do the same through `npx`:

```bash
npx @inotives/agent-rig init --yes
```

After setup, validate the workspace:

```bash
agent-rig validate
agent-rig doctor
agent-rig agents
agent-rig status
```

AgentRig installs default shared skills during setup. To skip network skill installs in automation or tests:

```bash
AGENT_RIG_SKIP_SKILLS=1 agent-rig init --yes
```

Filesystem-only MVP flow:

```bash
agent-rig tasks create "Implement X" --assigned-to worker --status ready --type task
agent-rig tasks
agent-rig tasks next --agent worker
agent-rig tasks next --agent worker --claim
agent-rig tasks show task-0001
agent-rig status
```

## Common Commands

| Command | Purpose |
|---|---|
| `agent-rig init` | Run the setup-pattern interview and scaffold `.agent-rig/`. |
| `agent-rig init --yes` | Scaffold a solo `worker` using `codex`. |
| `agent-rig add <agent-name>` | Add an agent to an existing workspace. |
| `agent-rig add <agent-name> --profile worker` | Add an agent from an editable profile. |
| `agent-rig profiles` | List available agent profiles. |
| `agent-rig profiles show worker` | Print a profile Markdown template. |
| `agent-rig doctor` | Check local AgentRig environment and workspace health. |
| `agent-rig agents` | List configured agents and tools. |
| `agent-rig validate` | Validate workspace files without mutating them. |
| `agent-rig creds` | Create credential placeholders and `.env.example` files. |
| `agent-rig skills` | Install and list shared or agent-local skills. |
| `agent-rig status` | Show live session state, task counts, and recent handoffs. |
| `agent-rig start --agent <agent-name>` | Print neutral launch guidance for a configured agent. |
| `agent-rig tasks create "<title>"` | Create a shared Markdown task file. |
| `agent-rig tasks` | List shared task files. |
| `agent-rig tasks show <task-id>` | Print the canonical task Markdown. |
| `agent-rig tasks next --agent <agent-name>` | Print the next dependency-ready shared task for an agent. |
| `agent-rig tasks next --agent <agent-name> --claim` | Mark the next dependency-ready shared task as `in_progress`. |
| `agent-rig tasks set-status <task-id> <status>` | Update task lifecycle status. |
| `agent-rig tasks assign <task-id> <agent-name>` | Assign a shared task to an agent. |
| `agent-rig tasks block <task-id> --reason <reason>` | Mark a task blocked and record the blocker. |
| `agent-rig tasks done <task-id>` | Mark a task done. |
| `agent-rig watch --once` | Process one ready shared task and exit. |

## Implementation Phases

The first MVP is split into five completed implementation phases, followed by a pre-release preparation phase:

```text
1. CLI scaffold
2. Workspace model and validation
3. Credentials and agent management
4. Live state and launch
5. First MVP watch loop
6. Pre-release and npm registry preparation
```

See [docs/phases](docs/phases/).

## Development

Run the local checks:

```bash
npm test
npm --cache /tmp/agent-rig-npm-cache pack --dry-run
```

For future phases, follow the phase workflow in [AGENTS.md](AGENTS.md): grill the phase docs, commit docs first, then implement from a feature branch.

## Repository Layout

```text
agent-rig/
├── docs/
│   ├── project_specs.md
│   ├── profiles.md
│   ├── _archived/
│   └── phases/
├── src/
├── templates/
├── test/
├── AGENTS.md
├── README.md
└── LICENSE
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
