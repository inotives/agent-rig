<p align="center">
  <img src="logo.png" alt="agent-rig logo" width="220">
</p>

<h1 align="center">agent-rig</h1>

<p align="center">
  Filesystem-first agent workspaces for Claude, Codex, OpenCode, and custom subscription tools.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-white?style=for-the-badge&labelColor=000000"></a>
  <a href="docs/project_specs.md"><img alt="Status: planning" src="https://img.shields.io/badge/status-planning-white?style=for-the-badge&labelColor=000000"></a>
  <img alt="Runtime: Node.js 20" src="https://img.shields.io/badge/runtime-node.js%2020-white?style=for-the-badge&labelColor=000000">
  <img alt="CLI: TypeScript" src="https://img.shields.io/badge/cli-typescript-white?style=for-the-badge&labelColor=000000">
</p>

<p align="center">
  <a href="docs/project_specs.md">Spec</a>
  ·
  <a href="docs/phases/README.md">Implementation Phases</a>
  ·
  <a href="LICENSE">License</a>
</p>

---

## What It Is

AgentRig is a TypeScript CLI tool for scaffolding a filesystem-first agent workspace into any project.

It creates a `.agent-rig/` directory where agents, shared context, task queues, handoff logs, credentials, and launch instructions live as ordinary files. AgentRig does not orchestrate AI APIs; users run subscription tools such as Claude, Codex, OpenCode, or custom tools directly.

Planning is complete through the first MVP phases. Implementation has not started yet.

## Core Model

AgentRig workspaces are ordinary project files:

```text
.agent-rig/
├── _shared/        # context, task queue, decisions, session state, handoff logs
├── .creds/         # gitignored local secrets
├── <agent>/        # agent.toml, instructions.md, context, queues, logs
└── human/          # human approval, unblock, and override helpers
```

The default `agent-rig init --yes` workspace is a solo `worker` agent using `codex`. Interactive setup can scaffold solo, coder-reviewer, trinity, supervisor-worker, swarm, testing-reviewer, or custom patterns.

## Dependencies

Required:

```text
node >= 20
npm or npx
```

AgentRig will be distributed as an npm CLI package.

## Install and First Run

Planned install:

```bash
npm install -g agent-rig
# or
pnpm add -g agent-rig
```

Then run AgentRig from inside the project you want to scaffold:

```bash
cd path/to/your-project
agent-rig init
```

Non-interactive MVP default:

```bash
agent-rig init --yes
```

## Common Commands

| Command | Purpose |
|---|---|
| `agent-rig init` | Run the setup-pattern interview and scaffold `.agent-rig/`. |
| `agent-rig init --yes` | Scaffold a solo `worker` using `codex`. |
| `agent-rig add <agent-name>` | Add an agent to an existing workspace. |
| `agent-rig agents` | List configured agents and tools. |
| `agent-rig validate` | Validate workspace files without mutating them. |
| `agent-rig creds` | Create credential placeholders and `.env.example` files. |
| `agent-rig status` | Show live session state, queue counts, and recent handoffs. |
| `agent-rig start` | Print launch commands for configured agents. |
| `agent-rig watch` | Run the MVP filesystem watch loop. |

## Implementation Phases

The first MVP is split into five documented phases:

```text
1. CLI scaffold
2. Workspace model and validation
3. Credentials and agent management
4. Live state and launch
5. First MVP watch loop
```

See [docs/phases](docs/phases/).

## Development

Implementation has not started. The current repository contains planning docs only.

Before implementation, follow the phase workflow in [AGENTS.md](AGENTS.md): grill the phase docs, commit docs first, then implement from a feature branch.

## Repository Layout

```text
agent-rig/
├── docs/
│   ├── project_specs.md
│   └── phases/
├── AGENTS.md
├── README.md
└── LICENSE
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
