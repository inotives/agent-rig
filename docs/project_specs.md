# AgentRig — Project Specification

> A TypeScript CLI tool (distributed via npm/npx) that scaffolds an eve-inspired, filesystem-first multi-agent workspace into any project. Agents — their roles, quantities, and which AI subscription tool runs each one — are fully defined by the user at init time and freely reconfigurable at any time.

---

## 1. Vision

AgentRig bootstraps a structured `.agent-rig/` directory into any new or existing project. The layout is inspired by Vercel's eve framework — every concern has a predictable home on the filesystem.

The intended user flow is: install AgentRig globally with npm or pnpm, `cd` into the user's own project repository, then run `agent-rig init` to scaffold `.agent-rig/` into that repository.

The key design principle is **user-defined agent composition**. AgentRig does not prescribe how many agents a project needs, which roles exist, or which AI tool runs each role. A project might have a single research agent running Claude. Another might have the full planner-worker-verifier trinity, all running Codex. Another might use Claude for both planner and verifier, with OpenCode as the worker. All of these are first-class configurations.

Agents share context through structured files in `.agent-rig/_shared/` — not ad-hoc prompts — making every workflow auditable, version-controlled, and reproducible regardless of how many agents are involved.

---

## 2. Core Concepts

### 2.1 Filesystem-First Agent Definition

Each agent is a self-contained folder inside `.agent-rig/`. Its folder name is its identity; its `agent.toml` declares its role and which tool runs it; its `instructions.md` defines its behaviour. There is no central registry — adding a folder and running `agent-rig validate` is all it takes to register a new agent.

### 2.2 Flexible Agent Composition

AgentRig ships with built-in setup patterns and role templates, but none are mandatory. The user decides during `agent-rig init` (or at any time via `agent-rig add`) whether the project needs one agent, a small review loop, or a larger multi-agent workflow.

Built-in setup patterns:

| Pattern | Default Shape | When to Use |
|---|---|---|
| `solo` | one custom or worker-like agent | One subscription tool handles the whole task loop |
| `coder-reviewer` | worker + reviewer | Implementation with a separate review gate |
| `trinity` | planner + worker + verifier | Higher-reliability work with planning and verification gates |
| `supervisor-worker` | supervisor + one or more workers | One coordinator routes work to specialist agents |
| `swarm` | peer agents sharing context | Open-ended research or exploration where strict ordering is not needed |
| `testing-reviewer` | worker + tester/verifier | Functional quality gate driven by tests |

Built-in role templates and their default responsibilities:

| Role | Default Responsibility |
|---|---|
| `supervisor` | Routes work, summarizes outputs, decides which worker acts next |
| `planner` | Breaks goals into tasks, authors task docs, maintains shared context |
| `worker` | Reads task docs, implements steps, writes code |
| `verifier` | Checks acceptance criteria, runs tests, issues pass/fail verdicts |
| `reviewer` | Reviews implementation quality without owning decomposition |
| `researcher` | Investigates questions, gathers evidence, and prepares research notes |
| `writer` | Turns plans, research, and implementation notes into written artifacts |
| `tester` | Runs or writes tests and reports objective pass/fail signals |
| `custom` | User-defined — any behaviour described in `instructions.md` |

AgentRig also ships editable agent profiles. Profiles are Markdown templates with YAML frontmatter, copied into each new agent's `instructions.md` at creation time. Built-in profiles are `planner`, `worker`, `reviewer`, `researcher`, and `writer`; `verifier` and `tester` use `reviewer` by default. Workspace copies live in `.agent-rig/_shared/profiles/`, and humans can add custom profile Markdown files there without registering them anywhere else.

Profile frontmatter can declare `shared_skills` and `agent_skills`. Shared skills install into `.agent-rig/_shared/skills/`; agent skills install into `.agent-rig/<agent>/skills/`. AgentRig uses `skills.sh` sources for these installs and does not maintain its own skill library.

Any AI subscription tool can be assigned to any role. The same tool can run multiple roles simultaneously (each in its own terminal with a different `instructions.md`):

| Example setup | Agents | Tools |
|---|---|---|
| Solo research | 1 agent: `researcher` | Claude |
| Minimal dev | 1 agent: `worker` | Codex |
| Code review loop | 2 agents: `worker` + `reviewer` | Codex + Claude |
| Full trinity | 3 agents: `planner` + `worker` + `verifier` | Claude + Codex + OpenCode |
| All-Claude | 3 agents: `planner` + `worker` + `verifier` | Claude + Claude + Claude |
| Mixed | 3 agents: `planner` + `worker` + `verifier` | Claude + Codex + Claude |

The **human** is always implicitly present — the fourth terminal in a multi-agent setup — using scripts in `.agent-rig/human/` to approve, unblock, and override.

### 2.3 Shared Context Bus

Agents communicate via structured files in `.agent-rig/_shared/`. This is a lightweight, filesystem-based message bus — no network sockets, no external broker. Each agent watches and writes to its designated slots.

### 2.4 Subscription Tool Model

AgentRig is **not an AI orchestrator**. It does not call any AI API, pass prompts, or manage tokens. Claude, Codex, and OpenCode are subscription tools that the developer runs directly — each in its own terminal, under its own account and billing. AgentRig's job is purely:

1. **Scaffold** the `.agent-rig/` filesystem so every tool has a consistent structure to read from and write to.
2. **Author** the `instructions.md` entry context each tool loads on startup.
3. **Observe** shared state files to power `agent-rig status`, `agent-rig logs`, and hook triggers.
4. **Assist launch** by symlinking instructions to tool-expected paths and opening terminals via `agent-rig start`.

The AI tools themselves decide how to read context, which files to edit, and when to write state — guided entirely by their `instructions.md` and the files they find in `.agent-rig/_shared/`.

| Concern | Managed by |
|---|---|
| Model selection, temperature, context window | The subscription tool (Claude / Codex / OpenCode) |
| Subscription billing and rate limits | The user's own subscription account |
| Filesystem structure and shared state | AgentRig |
| Entry instructions / system prompt content | AgentRig (`instructions.md`) |
| When and what to write to shared files | The AI tool, guided by `instructions.md` |
| Agent credentials (GitHub tokens, email passwords, API keys) | `.agent-rig/.creds/` — injected by AgentRig at invocation, never committed |
| Global vs agent-scoped capabilities | `_shared/skills/`, `_shared/tools/`, `_shared/channels/` (drivers) vs per-agent `skills/`, `tools/`, `channels/` (configs) |
| Channel implementation (how to talk to Discord, Slack, etc.) | `_shared/channels/` — one driver per platform, shared by all agents |
| Channel identity (which bot, which account, which target channel) | Per-agent `channels/` config — each agent has its own credentials and routing |

---

## 3. Generated Directory Structure

```
<project-root>/
└── .agent-rig/
    ├── _shared/                        # Cross-agent context bus + global capabilities
    │   ├── context.md                  # Living project context (goals, stack, constraints)
    │   ├── decisions.md                # Architectural decisions log (ADR-style)
    │   ├── session.json                # Current session state (active task, blockers, status)
    │   ├── tasks/                      # Canonical Markdown task files
    │   │   └── task-0001_<slug>.md     # One task — frontmatter state + Markdown brief
    │   ├── handoff_logs/               # Timestamped per-agent handoff records
    │   │   └── <YYYY-MM-DD-hhmm>_<sessionID>_agent-<name>.md
    │   ├── skills/                     # Global skills available to ALL agents
    │   │   ├── write_handoff.md        # How to write a handoff log (universal)
    │   │   ├── write_blocker.md        # How to write a blocker signal (universal)
    │   │   ├── read_context.md         # How to read and interpret context.md
    │   │   └── git_conventions.md      # Project git workflow (branch naming, commits)
    │   ├── tools/                      # Global tools available to ALL agents
    │   │   ├── read_file.ts            # Tool: read any project file
    │   │   ├── write_handoff.ts        # Tool: write handoff log to _shared/handoff_logs/
    │   │   ├── flag_blocker.ts         # Tool: write a blocker to session.json
    │   │   └── notify.ts               # Tool: send notification via a configured channel
    │   ├── channels/                   # Channel driver scripts — shared code, used by all agents
    │   │   ├── discord.ts              # Driver: send message to Discord (accepts config + creds)
    │   │   ├── slack.ts                # Driver: send message to Slack
    │   │   ├── telegram.ts             # Driver: send message to Telegram
    │   │   ├── email.ts                # Driver: send email via SMTP
    │   │   ├── github.ts               # Driver: GitHub operations (PR, comment, read diff)
    │   │   └── webhook.ts              # Driver: generic HTTP webhook
    │   ├── memory/                     # Persistent cross-session memory — one file per agent per session
    │   │   └── YYYY-MM-DD-hhmm__<session-id>__<agent-name>__<tool>.md
    │   └── profiles/                   # Editable instruction templates for future agents
    │       ├── planner.md
    │       ├── worker.md
    │       ├── reviewer.md
    │       ├── researcher.md
    │       └── writer.md
    │
    ├── planner/                        # Built-in role: Planner (tool assigned at init)
    │   ├── agent.toml                  # Agent descriptor (role, tool, execution, permissions, creds)
    │   ├── instructions.md             # Complete self-contained brief (see Section 8)
    │   ├── skills/                     # Planner-specific skills (supplements _shared/skills/)
    │   │   ├── decompose_task.md       # How to break epics into atomic steps
    │   │   ├── write_adr.md            # How to write architectural decision records
    │   │   ├── update_context.md       # How to maintain shared context.md
    │   │   ├── grill-me.md             # Interactive Q&A to surface requirements with human
    │   │   └── write_task_doc.md       # How to author a task doc with acceptance criteria
    │   ├── tools/                      # Planner-specific tools (supplements _shared/tools/)
    │   │   ├── read_codebase.ts        # Tool: scan project files for context
    │   │   ├── write_plan.ts           # Tool: write structured plan to .agent-rig/_shared/tasks/
    │   │   └── write_task_doc.ts       # Tool: create/update a task doc in _shared/tasks/
    │   ├── channels/                   # Planner's channel configs — credentials + routing only, no code
    │   │   ├── slack.toml              # Which Slack channel + which cred key (PLANNER_SLACK_BOT_TOKEN)
    │   │   └── github.toml             # Which GitHub account + which cred key (PLANNER_GITHUB_TOKEN)
    │   ├── hooks/
    │   │   ├── on_task_start.ts        # Hook: fires when planner picks up a new task
    │   │   └── on_plan_complete.ts     # Hook: fires when plan is ready for worker
    │   └── scripts/
    │       └── start.sh                # Helper: symlinks instructions.md + prints launch cmd
    │
    ├── worker/                         # Built-in role: Worker (tool assigned at init)
    │   ├── agent.toml
    │   ├── instructions.md
    │   ├── skills/                     # Worker-specific skills
    │   │   ├── read_plan.md            # How to parse .agent-rig/_shared/tasks/ and task docs
    │   │   ├── write_code.md           # Project coding conventions
    │   │   └── use_tools.md            # How to invoke available tools
    │   ├── tools/                      # Worker-specific tools
    │   │   ├── run_shell.ts            # Tool: execute shell commands
    │   │   ├── edit_file.ts            # Tool: apply diffs / write files
    │   │   └── mark_done.ts            # Tool: mark a task step done in .agent-rig/_shared/tasks/
    │   ├── channels/                   # Worker's channel configs — credentials + routing only, no code
    │   │   ├── github.toml             # Worker's GitHub bot account + cred key (WORKER_GITHUB_TOKEN)
    │   │   ├── slack.toml              # Worker's Slack bot + channel (WORKER_SLACK_BOT_TOKEN)
    │   │   └── discord.toml            # Worker's Discord bot + channel (WORKER_DISCORD_BOT_TOKEN)
    │   ├── hooks/
    │   │   ├── on_plan_ready.ts        # Hook: fires when planner marks plan complete
    │   │   └── on_step_complete.ts     # Hook: fires after each implementation step
    │   └── scripts/
    │       └── start.sh
    │
    ├── verifier/                       # Built-in role: Verifier (tool assigned at init)
    │   ├── agent.toml
    │   ├── instructions.md
    │   ├── skills/                     # Verifier-specific skills
    │   │   ├── review_diff.md          # How to review code diffs
    │   │   ├── run_tests.md            # How to interpret test output
    │   │   └── check_decisions.md      # How to validate against decisions.md
    │   ├── tools/                      # Verifier-specific tools
    │   │   ├── run_tests.ts            # Tool: run project test suite
    │   │   ├── read_diff.ts            # Tool: read git diff of worker's changes
    │   │   ├── read_task_doc.ts        # Tool: load task doc and parse acceptance criteria
    │   │   ├── lint.ts                 # Tool: run linter / type-checker
    │   │   └── approve_or_reject.ts    # Tool: write verdict to session.json
    │   ├── channels/
    │   │   ├── cli.toml
    │   │   └── email.toml              # Verifier emails rejection reports — overrides shared
    │   ├── hooks/
    │   │   ├── on_step_complete.ts     # Hook: fires when worker marks a step done
    │   │   └── on_rejection.ts         # Hook: fires when verifier rejects — notifies planner
    │   └── scripts/
    │       └── start.sh
    │
    ├── .creds/                         # Credential references — ALWAYS gitignored
    │   ├── .gitignore                  # Contains: * (ignore everything in this folder)
    │   ├── _shared.env                 # Credentials available to all agents
    │   ├── planner.env                 # Credentials scoped to planner only
    │   ├── worker.env                  # Credentials scoped to worker only
    │   └── verifier.env                # Credentials scoped to verifier only
    │
    └── human/                          # Human operator config
        ├── instructions.md             # Human's role and available commands
        ├── scripts/
        │   ├── approve.sh              # Approve current session task
        │   ├── unblock.sh              # Resolve a blocker in session.json
        │   └── override.sh             # Inject a directive into context.md
        └── dashboard.md                # Auto-regenerated: current state of all agents
```

---

## 4. Key Files Explained

### `_shared/context.md`
The living document every agent reads before acting. Contains: project goal, tech stack, coding conventions, active constraints, and a brief history of recent decisions. The Planner is the primary writer; others read only.

### `_shared/skills/`
Global skill documents available to every agent. A skill is a Markdown file that teaches the agent *how* to do something — a repeatable procedure, a convention, or a pattern. Skills are not executable; they are read by the agent as part of its instructions context.

Skills follow a resolution order: `_shared/skills/` defines the baseline; an agent's own `<name>/skills/` folder supplements or overrides it. If the same filename exists in both, the agent-local version takes precedence.

| File | Purpose |
|---|---|
| `write_handoff.md` | Universal template and rules for writing handoff logs |
| `write_blocker.md` | Universal procedure for writing blocker signals |
| `read_context.md` | How to read, parse, and act on context.md |
| `git_conventions.md` | Branch naming, commit message format, PR conventions |

### `_shared/tools/`
Global executable tools available to every agent. A tool is a TypeScript module that performs a concrete action — reading a file, writing state, sending a notification. Tools are invoked by the agent's subscription CLI via its native tool/function-calling mechanism.

Like skills, tools follow a resolution order: `_shared/tools/` is the baseline; agent-local `<name>/tools/` supplements or overrides. Agent-local tools with the same name shadow the global version.

| File | Purpose |
|---|---|
| `read_file.ts` | Read any project file by path |
| `write_handoff.ts` | Write a handoff log to `_shared/handoff_logs/` |
| `flag_blocker.ts` | Write a blocker entry to `session.json` |
| `notify.ts` | Send a notification — resolves the right channel driver and agent config automatically |

`notify.ts` is the primary way agents send messages. It accepts a message and an optional channel type, then resolves the correct driver from `_shared/channels/` and the correct config from the calling agent's `channels/` folder:

```typescript
// Agent calls:
await notify({ message: "Task-001 ready for review", channel: "slack" })

// notify.ts resolves:
// driver   → _shared/channels/slack.ts
// config   → .agent-rig/worker/channels/slack.toml
// creds    → WORKER_SLACK_BOT_TOKEN (injected by AgentRig daemon)
```

### `_shared/channels/` — Channel Driver Scripts
Channel drivers are **shared code** that lives in `_shared/channels/`. Each driver is a TypeScript module that knows how to connect to and communicate with one platform. The driver contains zero credentials and zero agent-specific config — it accepts all of that as arguments at call time.

This means sending a message to Discord is implemented once. Every agent that wants to post to Discord calls the same `discord.ts` driver, passing their own config file path. The driver reads the config, resolves the credential env vars that AgentRig injected, and sends the message.

| Driver | Responsibility |
|---|---|
| `discord.ts` | Send messages, embeds, and notifications to Discord |
| `slack.ts` | Post messages and alerts to Slack channels |
| `telegram.ts` | Send messages via Telegram bot API |
| `email.ts` | Send email via SMTP with plain text or HTML body |
| `github.ts` | Open PRs, post review comments, read diffs, fetch file content |
| `webhook.ts` | Generic HTTP POST to any webhook URL |

Example driver interface (`discord.ts`):
```typescript
// _shared/channels/discord.ts
export async function sendMessage(options: {
  configPath: string   // path to the calling agent's discord.toml
  message: string
  embedTitle?: string
  embedColor?: number
}): Promise<void> {
  const config = await loadToml(options.configPath)
  const token = requireEnv(config.auth.token_env)  // reads from injected env var
  const channelId = config.channel.channel_id
  // ... Discord API call
}
```

### `<agent-name>/channels/` — Per-Agent Channel Config
Each agent's `channels/` folder contains **config files only** — no code. A config file declares which platform account/bot this agent uses, which channel or recipient to target, and which credential env var to read the token from. No secrets are ever written here.

The split is: **driver in `_shared/channels/`** (how to talk to the platform) + **config in `<agent>/channels/`** (who is talking and where).

Example `.agent-rig/worker/channels/discord.toml`:
```toml
[channel]
type = "discord"
channel_id = "1234567890123456789"  # #dev-updates channel
mention_on_completion = "@dev-team"

[auth]
# AgentRig injects WORKER_DISCORD_BOT_TOKEN from .creds/worker.env at invocation
token_env = "WORKER_DISCORD_BOT_TOKEN"
```

Example `.agent-rig/verifier/channels/discord.toml`:
```toml
[channel]
type = "discord"
channel_id = "9876543210987654321"  # #qa-reports channel — different channel from worker
mention_on_fail = "@qa-lead"

[auth]
# Verifier's own Discord bot — different bot from worker's
token_env = "VERIFIER_DISCORD_BOT_TOKEN"
```

Example `.agent-rig/verifier/channels/email.toml`:
```toml
[channel]
type = "email"
smtp_host = "smtp.gmail.com"
smtp_port = 587
from_address = "verifier-bot@mycompany.com"
default_recipients = ["team@mycompany.com"]

[auth]
password_env = "VERIFIER_EMAIL_PASSWORD"
```

The same driver (`_shared/channels/discord.ts`) handles both agents — what differs is only the config file passed in. This pattern applies to every platform: one driver, many agent configs.

### `.creds/`
Credential storage for all agents. **This folder is always gitignored** — AgentRig writes a `*` rule into `.creds/.gitignore` at scaffold time and `agent-rig validate` will error if this gitignore is missing or modified.

Credentials are stored as `.env` files, one per scope:

| File | Scope |
|---|---|
| `_shared.env` | Credentials available to all agents |
| `<agent-name>.env` | Credentials scoped to that agent only |

At invocation time, `agent-rig watch` injects the relevant env files into the headless tool's environment — `_shared.env` always, plus the agent-specific `.env` for that agent. An agent never sees another agent's credentials.

Credential keys are declared by name in `agent.toml` under `[credentials]` — AgentRig validates that every declared key is present in the appropriate `.env` file before invoking the agent. A missing credential is a hard stop with a clear error, not a silent runtime failure.

Example `.creds/worker.env`:
```env
# Worker's own GitHub bot account — different from planner's or verifier's
WORKER_GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
WORKER_GITHUB_USERNAME=worker-bot

# Worker's own Slack bot token
WORKER_SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxxxxxxxxx

# NPM publish token (worker only)
NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxx
```

Example `.creds/_shared.env`:
```env
# Credentials that apply to all agents equally — use sparingly.
# Channels should NOT go here — each agent has its own channel identity.
# Good candidates: shared read-only API keys, project-level tokens.

# Shared read-only project API key (no agent writes with this)
PROJECT_API_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx
```

### `_shared/session.json`
The real-time heartbeat of the current session: which task is active, which agent is busy, any blockers awaiting human input, and the last action taken by each agent.

### `_shared/tasks/`
One Markdown file per task, named `<task-id>_<slug>.md` (e.g. `task-0001_jwt-auth.md`). Created by the human or Planner — often interactively with the human using `grill-with-docs` to surface requirements before work starts. Once created, the doc is the single source of truth for that task: frontmatter stores task state, while the Markdown body stores implementation context, constraints, plan, and acceptance criteria.

Every task doc follows this template:

```markdown
---
id: task-0001
title: Add JWT auth middleware
status: ready
assigned_to: worker
created_by: planner
created_on: 2026-06-30
updated_on: 2026-06-30
priority: normal
parent:
depends_on: []
---

# Task

## Context
Why this task exists and what problem it solves.

## Goal
The outcome this task should produce.

## Scope
What is explicitly in and out of scope for this task.

## Planner Notes
Human + planner working notes before the plan is finalized.

## Implementation Plan
1. Install the `jsonwebtoken` crate and add to `Cargo.toml`.
2. Create `middleware/jwt.rs` with a `validate_token()` function.
3. Wire the middleware into the router in `main.rs`.
4. Write unit tests in `middleware/jwt_test.rs`.

## Acceptance Criteria
These are the conditions the Verifier checks before issuing a PASS verdict.

- [ ] `cargo test` passes with no failures.
- [ ] `validate_token()` returns `Err` for expired tokens.
- [ ] `validate_token()` returns `Err` for tampered signatures.
- [ ] `validate_token()` returns `Ok(Claims)` for a valid token.
- [ ] Middleware rejects unauthenticated requests with HTTP 401.
- [ ] No new `clippy` warnings introduced.
- [ ] No changes outside the `middleware/` folder and `main.rs`.

## Open Questions
Questions the Planner or human must resolve before or during implementation.
- [ ] Should token expiry be configurable via env var or hardcoded to 1h?
```

The Verifier treats the **Acceptance Criteria** checklist as its test spec — it ticks off each item with evidence (test output, diff inspection, lint results) and will not issue a PASS until all items are resolved.

### `_shared/handoff_logs/`
An append-only directory of structured Markdown logs written by each agent at the end of its turn. Every file is named:

```
<YYYY-MM-DD-hhmm>_<sessionID>_agent-<name>.md
```
Where `<name>` is the agent's folder name — not a fixed set of values. A project with a `researcher` agent produces `..._agent-researcher.md`.

For example:
```
2025-06-25-1430_sess-a3f9_agent-planner.md
2025-06-25-1431_sess-a3f9_agent-worker.md
2025-06-25-1435_sess-a3f9_agent-verifier.md
```

The filename encodes enough to reconstruct the timeline without opening any file. The `sessionID` ties all three agents' logs for a single work session together.

Each log follows a fixed template:

```markdown
# Handoff Log
- **Agent:** planner
- **Session:** sess-a3f9
- **Timestamp:** 2025-06-25 14:30
- **Task:** task-001 — Add JWT auth middleware

## What I Did
Brief summary of actions taken this turn.

## Decisions Made
- Chose HS256 over RS256 for simplicity given single-service scope.
- Deferred refresh token logic to task-002.

## State I'm Leaving
- .agent-rig/_shared/tasks/ updated: step-001-a marked ready for worker.
- decisions.md updated with algorithm choice.

## What the Next Agent Needs to Know
- The existing `middleware/` folder is empty — safe to create files there.
- Do not modify `auth/session.rs`; it is owned by a parallel task.

## Open Questions / Blockers
- None. Proceed.
```

Handoff logs are **write-once** — no agent may edit another agent's log. They serve as an audit trail and as priming context: when an agent starts a new turn it reads the most recent log from the preceding agent rather than re-scanning all shared state from scratch.

### `_shared/memory/`
Persistent memory files that accumulate across sessions. Each file covers one agent's work in one session. Agents use these to carry forward learned patterns, codebase quirks, past mistakes, and unresolved questions into future sessions — even when there is no direct handoff chain connecting them.

**Filename convention:**
```
YYYY-MM-DD-hhmm__<session-id>__<agent-name>__<tool>.md
```

Examples:
```
2025-06-25-1430__sess-a3f9__planner__claude.md
2025-06-25-1431__sess-a3f9__worker__codex.md
2025-06-25-1435__sess-a3f9__verifier__opencode.md
2025-06-26-0900__sess-b7c2__researcher__claude.md
```

The filename encodes enough to identify agent, tool, and session without opening the file.

---

**YAML Frontmatter — the metadata index**

Every memory file opens with a YAML frontmatter block. Agents read *only* the frontmatter of all memory files first, decide which are relevant to the current task, and load the full body of matched files only. This keeps startup context lean regardless of how many memory files accumulate over time.

```yaml
---
agent: planner
tool: claude
session: sess-a3f9
timestamp: "2025-06-25T14:30:00"
role: planner
tasks_worked: [task-001, task-002]
tasks_completed: [task-001]
tasks_blocked: []
outcome: completed          # completed | partial | blocked
relevance_tags: [jwt, auth, middleware, cargo-toml]
superseded_by: null         # set to a later session-id if this memory has been corrected/updated
readable_by: [planner, worker, verifier]  # which agents should consider this memory
---
```

**Frontmatter fields:**

| Field | Type | Purpose |
|---|---|---|
| `agent` | string | Which agent wrote this — agents always load all their own memory |
| `tool` | string | Which subscription tool ran (claude, codex, opencode, etc.) |
| `session` | string | Groups all agents from the same session for cross-agent context |
| `timestamp` | ISO 8601 | When the session ended — used for recency weighting |
| `role` | string | Agent's role at time of writing |
| `tasks_worked` | string[] | Task IDs touched this session — match against current task for relevance |
| `tasks_completed` | string[] | Tasks fully completed — helps other agents know what's safe to depend on |
| `tasks_blocked` | string[] | Tasks that were blocked — flag for attention if re-encountered |
| `outcome` | enum | Overall session outcome — agents may skip `blocked` memories from other agents |
| `relevance_tags` | string[] | Topic/technology tags — agent matches these against current task context |
| `superseded_by` | string\|null | If a later session corrects this one, set to that session-id. Agents skip superseded memories unless doing a deep review |
| `readable_by` | string[] | Which agent roles should actively load this memory. Use `["*"]` for all |

---

**Startup memory loading algorithm (in each agent's instructions):**

```
1. List all files in .agent-rig/_shared/memory/
2. Read YAML frontmatter only from each file (stop before ---)
3. Score each file for relevance:
     +3  agent matches own name
     +2  tasks_worked intersects with current task ID
     +2  relevance_tags intersects with current task's tags
     +1  session matches current session (peer agent memories)
     +1  readable_by includes this agent's role or "*"
      0  outcome = "blocked" from another agent (load with caution)
     -∞  superseded_by is set (skip unless explicitly reviewing history)
4. Load full body of files scoring ≥ 2, most recent first, up to 5 files
5. If current task was previously blocked (tasks_blocked in any memory), 
   always load that memory regardless of score
```

This rule is mechanical — agents don't guess at relevance, they follow the algorithm.

---

**Memory file body template:**

```markdown
---
agent: planner
tool: claude
session: sess-a3f9
timestamp: "2025-06-25T14:30:00"
role: planner
tasks_worked: [task-001, task-002]
tasks_completed: [task-001]
tasks_blocked: []
outcome: completed
relevance_tags: [jwt, auth, middleware]
superseded_by: null
readable_by: [planner, worker, verifier]
---

# Session Memory — planner / sess-a3f9

## What I Learned
Facts, patterns, and observations worth carrying into future sessions.

- The `middleware/` folder follows a strict pattern: each file exports a single
  named function only, never a default export. Enforce this in task docs.
- `cargo test` takes ~45s — build time is slow. Batch test runs where possible.
- The team prefers explicit error types over generic `Error` — document this in
  acceptance criteria for any task touching error handling.

## Mistakes I Made
Things that went wrong — avoid repeating these.

- Wrote acceptance criteria that said "tests pass" without specifying which tests.
  Verifier couldn't verify it. Always name the specific test functions or modules.

## Unresolved Questions
Things I couldn't answer that may resurface.

- Unknown whether the `legacy/` folder is still active. Human said they'd confirm.
  Do not include it in any task scope until resolved.

## What the Next Session Should Know
The single most important context for whoever picks this up next.

- task-002 depends on task-001's middleware being merged to `main` first.
  Check git log before starting task-002.
```

---

**Write rules:**
- Each agent writes exactly one memory file per session, at the end of its run — after the handoff log, before exit.
- Agents may read any memory file whose `readable_by` includes their role.
- Agents never modify another agent's memory file.
- The `superseded_by` field is the only exception — an agent may set `superseded_by` on its *own* past memory file if the current session corrects it.
- AgentRig daemon writes nothing to memory — memory is entirely agent-authored.

### `agent.toml`
Per-agent descriptor file. Declares the agent's role, which subscription tool runs it, and which filesystem paths it owns. This is **not** a runtime config — it never controls model parameters (temperature, max_tokens, etc.) since the subscription tool manages those internally. AgentRig reads this only for scaffolding, validation, and the `agent-rig start` launch helper.

```toml
[agent]
# Unique name for this agent — matches its folder name under .agent-rig/
name = "planner"

# Role template this agent follows.
# Built-in: "planner" | "worker" | "verifier"
# Custom: any string — behaviour is fully defined by instructions.md
role = "planner"

# The subscription tool that runs this agent in its terminal.
# Supported: "claude" | "codex" | "opencode" | "custom"
# Any tool can be assigned to any role. The same tool can appear in multiple agents.
tool = "claude"

# Path AgentRig symlinks to the tool's expected entry-context location on `agent-rig start`.
# AgentRig resolves the correct target path per tool automatically:
#   claude    → CLAUDE.md at project root
#   codex     → AGENTS.md at project root
#   opencode  → .opencode/instructions.md
# When the same tool runs multiple agents, each gets a unique symlink target
# (e.g. CLAUDE.md for the first, .claude/planner.md for the second).
instructions = ".agent-rig/planner/instructions.md"

[permissions]
# Filesystem paths this agent may read from and write to.
# Enforced by convention and verified by `agent-rig validate` — not runtime-intercepted.
read  = ["_shared/context.md", "_shared/tasks/", "_shared/decisions.md", "_shared/handoff_logs/", "_shared/tasks/"]
write = ["_shared/tasks/", "_shared/decisions.md", "_shared/context.md", "_shared/handoff_logs/", "_shared/tasks/"]
```

**Same tool, multiple roles** — when a user assigns the same tool (e.g. Claude) to more than one agent, AgentRig generates a unique entry-context symlink per agent and prints the exact command to run in each terminal, including the flag or env var needed to point the tool to the right instructions file:

```bash
# Terminal 1 — Planner (Claude)
CLAUDE_CONTEXT=.agent-rig/planner/instructions.md claude

# Terminal 2 — Verifier (Claude)  
CLAUDE_CONTEXT=.agent-rig/verifier/instructions.md claude
```

### `instructions.md`
The complete self-contained brief for the agent. Because agents run headlessly (`claude -p`, `opencode run`), this file is the **only** context they receive at startup — there is no prior conversation, no human to ask, and no implicit memory. It must be entirely self-sufficient.

AgentRig constructs the final prompt by prepending `instructions.md` content and appending the relevant task doc and most recent handoff log at invocation time. The agent reads all three together and acts without further input.

Every `instructions.md` covers seven mandatory sections (detailed in Section 8):
1. Identity — who this agent is and what it is responsible for
2. Filesystem map — exact paths to every file it reads and writes
3. Trigger — what condition caused it to run and what to look for on startup
4. Workflow — numbered steps in strict order, no ambiguity
5. Prohibitions — explicit list of what it must never do
6. Completion signal — exactly what to write and where to declare it is done
7. Blocker signal — exactly what to write and where when it cannot proceed

---

## 5. AgentRig CLI

### 5.1 Commands

```
agent-rig init [--yes]
    Interactive scaffold wizard. Runs in the current directory.
    Asks: project type detection (auto or manual), setup pattern, each agent's
    name, role template, and which subscription tool runs it.
    --yes skips prompts and scaffolds a solo worker agent using codex.

agent-rig add <agent-name> [--role supervisor|planner|worker|verifier|reviewer|tester|custom] [--tool claude|codex|opencode|custom]
    Add a new agent folder to an existing .agent-rig/ workspace.
    Prompts for role and tool if flags are not provided.
    Safe to run at any time — never touches existing agent folders.

agent-rig start [--agent <name>]
    Resolves the correct entry-context symlink for each agent's assigned tool,
    then prints the exact terminal command(s) to run. Optionally opens them
    automatically via tmux panes or OS terminal tabs.
    With --agent <name>, sets up and prints the command for one specific agent only.
    Does NOT pass prompts or control any tool.

agent-rig status
    Print a human-readable summary of all configured agents, session.json, and
    .agent-rig/_shared/tasks/. Shows which agents are active and any open blockers.

agent-rig agents
    List all agents configured in the current .agent-rig/ workspace — name,
    role, assigned tool, and current status.

agent-rig approve [--task <id>]
    Shorthand for human approval of the current or specified task.

agent-rig validate
    Parse and lint the entire .agent-rig/ directory — check all agent.toml files,
    verify tool references exist, flag unknown role values, report missing files.
    Also checks that .creds/.gitignore exists and contains *, and warns if any
    .env file is tracked by git.

agent-rig creds [--agent <name>]
    Interactive credential manager. Lists declared credentials for an agent (from
    agent.toml [credentials] block), shows which are present/missing in .creds/,
    and prompts to add missing values. Never prints credential values — only key names
    and present/missing status. With no --agent flag, shows all agents.

agent-rig logs [--session <id>] [--agent <name>] [--tail <n>]
    List or print handoff logs. Defaults to the last 10 logs across all agents.
    Filter by session ID or agent name. --tail streams the most recent log live.

agent-rig watch
    Start the coordination daemon. Watches _shared/ for state changes and invokes
    agents headlessly when their trigger condition fires. Assembles the prompt from
    instructions.md + task doc + latest handoff log for each invocation.
    Runs until killed. Logs all invocations and outcomes to stderr.
    Use this for fully automated multi-agent workflows.
```

### 5.2 Init Behaviour — Interactive Wizard

`agent-rig init` always runs as an interactive wizard. It never assumes the number of agents, their roles, or their tools. Every decision is the user's.

**Step 1 — Detect project context**
```
Detected: Node.js project (package.json found)
Project name: my-api
Seed context.md from README.md? (Y/n)
```

**Step 2 — Choose setup pattern**
```
What setup pattern does this project need? (default: solo)
  1. Solo agent
  2. Coder + reviewer
  3. Planner + worker + verifier
  4. Supervisor + workers
  5. Peer swarm
  6. Testing reviewer
  7. Custom
> solo

Agent 1
  Name (e.g. worker, researcher, reviewer): worker
  Role template: worker
  Subscription tool: codex
```

**Step 3 — Confirm and scaffold**
```
Ready to scaffold:

  .agent-rig/
  ├── _shared/
  ├── worker/        role: worker     tool: codex
  └── human/

Add .agent-rig/ to .gitignore? (Y/n)
Scaffold? (Y/n)
```

**Step 4 — Post-scaffold summary**
After scaffolding, AgentRig prints the exact command for each agent's terminal:

```
✓ Scaffolded .agent-rig/ with 1 agent.

To start your agents, open a terminal for each and run:

  worker   (codex)   →  codex    # loads .agent-rig/worker/instructions.md via AGENTS.md symlink

Human terminal: run `agent-rig status` to monitor session state.
```

**Non-interactive mode**
```bash
# Scaffold a single default worker agent using codex, no prompts
agent-rig init --yes

# Scaffold with flags (skips wizard for that pattern)
agent-rig init --pattern trinity --agents planner:claude,worker:codex,verifier:opencode
```

**Re-running init** on an existing `.agent-rig/` workspace exits with a clear message and points the user to `agent-rig add`. It never overwrites `instructions.md`, `agent.toml`, or any `_shared/` files that already have content.

---

## 6. Workflow Lifecycle

The lifecycle adapts to however many agents the project has. Below are the two most common configurations.

### 6.1 Single Agent (e.g. solo researcher)

```
Human writes intent into _shared/context.md
        │
        ▼
┌──────────────────────────────┐
│  researcher                  │  ← reads context.md
│  tool: claude                │  → writes findings to _shared/tasks/
│  .agent-rig/researcher/    │  → writes handoff log
└──────────────┬───────────────┘
               │
        Human reviews output,
        updates context.md,
        agent continues
```

### 6.2 Three-Agent Trinity (planner · worker · verifier)

The tool assigned to each role is irrelevant to the flow — only the role matters.

```
Human writes intent
        │
        ▼
┌──────────────────────────────┐
│  planner                     │  ← reads context.md + codebase
│  tool: <any>                 │  → writes task doc to _shared/tasks/
│  .agent-rig/planner/       │  → writes .agent-rig/_shared/tasks/
└────────────┬─────────────────┘  → writes handoff log
             │ on_plan_complete hook fires
             ▼
┌──────────────────────────────┐
│  worker                      │  ← reads .agent-rig/_shared/tasks/ + task doc
│  tool: <any>                 │  → edits source files
│  .agent-rig/worker/        │  → marks steps done
└────────────┬─────────────────┘  → writes handoff log
             │ on_step_complete hook fires
             ▼
┌──────────────────────────────┐
│  verifier                    │  ← reads task doc (acceptance criteria)
│  tool: <any>                 │  ← reads git diff + runs tests
│  .agent-rig/verifier/      │  → writes verdict to session.json
└────────────┬─────────────────┘  → writes handoff log
             │
        ┌────┴────┐
        │         │
      PASS      FAIL
        │         │
        ▼         ▼
    Next task   on_rejection hook
                → planner revises
                → or Human unblocks
```

### 6.3 Two-Agent Setup (planner · worker, no verifier)

The planner writes task docs; the worker implements. Human performs verification manually. All shared state files work identically — the verifier folder simply doesn't exist.

---

## 7. TypeScript Implementation Plan

### 7.1 Distribution

AgentRig is published to npm as a CLI package. No installation required to scaffold a project:

```bash
# One-shot scaffold into any project
npx @inotives/agent-rig init

# Or install globally
npm install -g @inotives/agent-rig
agent-rig init
```

### 7.2 Package Structure

```
agent-rig/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                # CLI entry point (commander)
│   ├── commands/
│   │   ├── init.ts             # `agent-rig init` — scaffold .agent-rig/ into project
│   │   ├── add.ts              # `agent-rig add` — add a new agent folder
│   │   ├── start.ts            # `agent-rig start` — symlink instructions + open terminals
│   │   ├── status.ts           # `agent-rig status` — print live session + queue state
│   │   ├── validate.ts         # `agent-rig validate` — lint agent.toml + file refs
│   │   └── logs.ts             # `agent-rig logs` — list / tail handoff logs
│   ├── scaffold/
│   │   ├── index.ts            # Scaffold orchestrator
│   │   ├── detector.ts         # Project type detector (reads package.json / Cargo.toml / etc.)
│   │   ├── renderer.ts         # Template variable substitution (handlebars)
│   │   └── writer.ts           # Safe fs writer — skips existing files, never overwrites
│   ├── schema/
│   │   ├── agentConfig.ts      # Zod schema for agent.toml
│   │   ├── taskFiles.ts        # Zod schema + types for .agent-rig/_shared/tasks/
│   │   └── session.ts          # Zod schema + types for session.json
│   ├── watcher/
│   │   ├── index.ts            # chokidar-based file watcher
│   │   └── hookRunner.ts       # Trigger hook scripts on file change events
│   └── terminal/
│       ├── launcher.ts         # Open tmux panes or OS terminal tabs per agent
│       └── symlinker.ts        # Symlink instructions.md to tool-expected entry paths
├── templates/                  # Scaffold templates (bundled into npm package)
│   ├── _shared/
│   │   ├── context.md
│   │   ├── tasks/
│   │   ├── decisions.md
│   │   └── session.json
│   ├── planner/
│   │   ├── agent.toml
│   │   ├── instructions.md
│   │   └── scripts/start.sh
│   ├── worker/
│   │   ├── agent.toml
│   │   ├── instructions.md
│   │   └── scripts/start.sh
│   └── verifier/
│       ├── agent.toml
│       ├── instructions.md
│       └── scripts/start.sh
└── tests/
    ├── scaffold.test.ts
    ├── validator.test.ts
    └── fixtures/               # Sample projects for integration tests
```

### 7.3 Key Dependencies

| Package | Purpose |
|---|---|
| `commander` | CLI argument and subcommand parsing |
| `zod` | Runtime schema validation for agent.toml, .agent-rig/_shared/tasks/, session.json |
| `handlebars` | Template rendering for scaffolded files |
| `chokidar` | Cross-platform filesystem watcher for hooks |
| `toml` | Parse agent.toml descriptor files |
| `chalk` | Terminal colour output |
| `ora` | Spinner / progress indicators |
| `execa` | Spawn shell processes for hook scripts and terminal launcher |
| `fs-extra` | Enhanced fs utilities (copy, ensureDir, pathExists) |
| `@types/node` | Node.js type definitions |

All runtime dependencies are intentionally minimal — no frameworks, no build pipeline required to run the output. Dev dependencies include `tsx` for running TypeScript directly during development and `vitest` for tests.

### 7.4 Templates as Bundled Assets

Templates live in the `templates/` directory and are included in the npm package via the `files` field in `package.json`. At runtime, AgentRig resolves the template path relative to the installed package root using `import.meta.url` (ESM) or `__dirname` (CJS). Variable substitution (project name, detected stack, tool names, instructions paths) is handled by Handlebars before writing to disk. No API keys or model parameters are ever written — the subscription tools manage their own credentials and inference settings.

### 7.5 Schema Validation with Zod

All shared state files are validated at read time using Zod schemas, giving clear error messages when a file is malformed:

```typescript
// schema/taskFiles.ts
import { z } from 'zod'

const StepSchema = z.object({
  id: z.string(),
  description: z.string(),
  done: z.boolean(),
})

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']),
  doc_path: z.string(),
  steps: z.array(StepSchema),
  assigned_to: z.enum(['planner', 'worker', 'verifier']),
  created_by: z.string(),
  verified_by: z.string().nullable(),
})

export const TaskQueueSchema = z.array(TaskSchema)
export type Task = z.infer<typeof TaskSchema>
```

---

## 8. Agent Instructions Design

Each `instructions.md` is a complete, self-contained operational brief. Agents run headlessly — one shot, no conversation history, no human to ask. The file must tell the agent everything it needs to act correctly and finish cleanly every time.

### 8.1 Mandatory Sections

Every `instructions.md` — regardless of role — must contain all seven sections below. AgentRig's scaffold generates a filled template; the user refines it.

| # | Section | Purpose |
|---|---|---|
| 1 | **Identity** | Who this agent is, what role it plays, what it owns |
| 2 | **Filesystem Map** | Exact paths to every file it reads and writes — no ambiguity |
| 3 | **Trigger** | What condition caused it to run; what to look for on startup |
| 4 | **Workflow** | Numbered steps in strict order; each step is a concrete action |
| 5 | **Prohibitions** | Explicit list of what it must never do |
| 6 | **Completion Signal** | Exactly what to write, to which file, in which format, to declare done |
| 7 | **Blocker Signal** | Exactly what to write and where when it cannot proceed |

### 8.2 How AgentRig Assembles the Prompt

When `agent-rig watch` triggers a headless invocation, it assembles the full prompt from three sources in order:

```
[1] .agent-rig/<name>/instructions.md   ← role brief, filesystem map, workflow rules
[2] _shared/tasks/<task-id>_<slug>.md      ← the specific task doc for this invocation
[3] _shared/handoff_logs/<latest>.md      ← the most recent handoff from the preceding agent
```

The agent receives all three concatenated as its prompt. `instructions.md` is the standing brief — it never changes between invocations. The task doc and handoff log are the per-invocation context.

### 8.3 Planner `instructions.md` Template

```markdown
# Agent Identity
You are the **planner** agent for this project.
Your job is to translate human intent into clear, structured task documents
that the worker agent can execute without ambiguity.
You do not write code. You write plans.

---

# Filesystem Map

## Your Skills (read these to understand how to perform your tasks):
Global (available to all agents):
- `.agent-rig/_shared/skills/write_handoff.md`    — how to write your handoff log
- `.agent-rig/_shared/skills/write_blocker.md`    — how to write a blocker signal
- `.agent-rig/_shared/skills/read_context.md`     — how to interpret context.md
- `.agent-rig/_shared/skills/git_conventions.md`  — project git workflow

Your own (planner-specific):
- `.agent-rig/planner/skills/decompose_task.md`   — how to break epics into steps
- `.agent-rig/planner/skills/write_adr.md`        — how to write architectural decisions
- `.agent-rig/planner/skills/grill-me.md`         — how to surface requirements with human
- `.agent-rig/planner/skills/write_task_doc.md`   — how to author a complete task doc

## Your Tools (invoke these to take actions):
Global (available to all agents):
- `read_file`       — read any project or .agent-rig file by path
- `write_handoff`   — write your handoff log to `_shared/handoff_logs/`
- `flag_blocker`    — write a blocker entry to `session.json`
- `notify`          — send a notification via a configured channel

Your own (planner-specific):
- `read_codebase`   — scan project files to build context
- `write_plan`      — write a structured plan into a task Markdown file
- `write_task_doc`  — create or update a task doc in `_shared/tasks/`

## Your Channels:
Channel code lives in `_shared/channels/` — you never write channel logic yourself.
Use the `notify` tool to send messages; it resolves your config and credentials automatically.
Your channel configs (your bot identities and target channels) are in `.agent-rig/planner/channels/`:
- `slack.toml`   — your Slack bot posts to #planning (cred injected: PLANNER_SLACK_BOT_TOKEN)
- `github.toml`  — your GitHub account for reading repo context (cred injected: PLANNER_GITHUB_TOKEN)

## You READ these files on every startup (in this order):
1. `.agent-rig/_shared/context.md`       — project goal, stack, constraints, conventions
2. `.agent-rig/_shared/tasks/`        — current task files and statuses
3. `.agent-rig/_shared/decisions.md`     — past architectural decisions (never contradict these)
4. `.agent-rig/_shared/memory/`          — scan frontmatter of all files, load relevant bodies (see algorithm below)
5. The task doc provided in this prompt    — if you are revising an existing task
6. The handoff log provided in this prompt — what the previous agent left for you

## Memory Loading Algorithm
On startup, before acting:
1. List all `.md` files in `.agent-rig/_shared/memory/`
2. Read YAML frontmatter only from each file — do not read the body yet
3. Score each file: +3 if `agent` matches your name; +2 if `tasks_worked` includes
   the current task ID; +2 if `relevance_tags` overlaps current task context;
   +1 if `session` matches current session; skip any where `superseded_by` is set
4. Load full body of files scoring ≥ 2, most recent first, cap at 5 files
5. If current task appears in any file's `tasks_blocked`, always load that file

## You WRITE to these files only:
- `.agent-rig/_shared/tasks/<task-id>_<slug>.md`  — create or revise task documents and update task status
- `.agent-rig/_shared/decisions.md`               — append new architectural decisions
- `.agent-rig/_shared/context.md`                 — update project context if scope changes
- `.agent-rig/_shared/handoff_logs/<timestamp>_<sessionID>_agent-planner.md` — your handoff log
- `.agent-rig/_shared/memory/YYYY-MM-DD-hhmm__<session-id>__planner__<tool>.md` — your session memory

## You must NEVER write to:
- Any source code file in the project
- `.agent-rig/_shared/session.json`  (daemon-managed)
- Another agent's memory file (you may set superseded_by only on your own past memory files)
- Another agent's folder
- `.agent-rig/.creds/`  (credentials are injected by AgentRig — never read or write them directly)

---

# Trigger
You have been invoked because one of the following is true:
- A new task has been requested by the human (session.json → status: "needs_planning")
- The verifier rejected a task and it has been returned for revision (task status: "revision_needed")
- A blocker has been resolved and the task was waiting on you

Check `.agent-rig/_shared/tasks/` on startup. Find the first task with status `needs_planning`
or `revision_needed`. That is your active task.

---

# Workflow
Follow these steps in order. Do not skip steps.

1. Read `.agent-rig/_shared/context.md` fully.
2. Read `.agent-rig/_shared/decisions.md` fully.
3. Read `.agent-rig/_shared/tasks/` and identify your active task.
4. If the task has a `doc_path`, read that task doc. If this is a revision, read the
   handoff log provided — it contains the verifier's rejection reason.
5. If the task is ambiguous or contradicts a past decision, go to **Blocker Signal**.
6. Write the task document to `_shared/tasks/<task-id>_<slug>.md` using the task doc
   template (Identity, Background, Scope, Implementation Steps, Acceptance Criteria,
   Open Questions). Every acceptance criterion must be binary and verifiable.
7. Update `.agent-rig/_shared/tasks/`: set `doc_path` to the new doc, set `status` to `"ready_for_work"`.
8. If a new architectural decision was made, append it to `decisions.md`.
9. Write your handoff log to `_shared/handoff_logs/`.
10. Go to **Completion Signal**.

---

# Prohibitions
- Do NOT write any source code, configuration files, or scripts.
- Do NOT modify any file outside `.agent-rig/_shared/`.
- Do NOT change a task status to anything other than `"ready_for_work"` or `"blocked"`.
- Do NOT invent acceptance criteria that cannot be mechanically verified.
- Do NOT proceed if context.md or decisions.md is missing — write a blocker.
- Do NOT modify another agent's handoff log.

---

# Completion Signal
When your work is done, update `.agent-rig/_shared/tasks/`:
```json
{ "status": "ready_for_work", "doc_path": "_shared/tasks/<task-id>_<slug>.md" }
```
The daemon watches for this status change and will invoke the worker automatically.
Your final action is always writing the handoff log. Do not exit before writing it.

---

# Blocker Signal
If you cannot proceed (ambiguous requirements, contradicts a decision, missing context):

1. Set the task status in `.agent-rig/_shared/tasks/` to `"blocked"`.
2. Update `session.json`:
```json
{
  "blocked_by": "planner",
  "task_id": "<task-id>",
  "reason": "<specific reason — what information is needed to unblock>",
  "timestamp": "<ISO 8601>"
}
```
3. Write your handoff log explaining the blocker in detail.
4. Stop. Do not attempt to proceed past a blocker.
The daemon will notify the human. Do not guess — always block rather than assume.
```

### 8.4 Worker `instructions.md` Template

```markdown
# Agent Identity
You are the **worker** agent for this project.
Your job is to implement exactly what the task document specifies — nothing more,
nothing less. You write code. You run commands. You do not plan or verify.

---

# Filesystem Map

## Your Skills (read these to understand how to perform your tasks):
Global (available to all agents):
- `.agent-rig/_shared/skills/write_handoff.md`    — how to write your handoff log
- `.agent-rig/_shared/skills/write_blocker.md`    — how to write a blocker signal
- `.agent-rig/_shared/skills/read_context.md`     — how to interpret context.md
- `.agent-rig/_shared/skills/git_conventions.md`  — branch naming, commit format, PR conventions

Your own (worker-specific):
- `.agent-rig/worker/skills/read_plan.md`         — how to parse task docs and .agent-rig/_shared/tasks/
- `.agent-rig/worker/skills/write_code.md`        — project coding conventions
- `.agent-rig/worker/skills/use_tools.md`         — how to invoke your available tools

## Your Tools (invoke these to take actions):
Global (available to all agents):
- `read_file`       — read any project or .agent-rig file by path
- `write_handoff`   — write your handoff log to `_shared/handoff_logs/`
- `flag_blocker`    — write a blocker entry to `session.json`
- `notify`          — send a notification via a configured channel

Your own (worker-specific):
- `run_shell`       — execute shell commands (build, install, run scripts)
- `edit_file`       — apply diffs or write files in the project
- `mark_done`       — mark a task step as done in `.agent-rig/_shared/tasks/`

## Your Channels:
Channel code lives in `_shared/channels/` — you never write channel logic yourself.
Use the `notify` tool to send messages; it resolves your config and credentials automatically.
Your channel configs (your bot identities and target channels) are in `.agent-rig/worker/channels/`:
- `github.toml`  — your GitHub bot account for pushing code and opening PRs (cred injected: WORKER_GITHUB_TOKEN)
- `slack.toml`   — your Slack bot posts to #dev-updates (cred injected: WORKER_SLACK_BOT_TOKEN)
- `discord.toml` — your Discord bot posts to #dev-updates (cred injected: WORKER_DISCORD_BOT_TOKEN)

## You READ these files on every startup (in this order):
1. `.agent-rig/_shared/context.md`      — project conventions, stack, constraints
2. `.agent-rig/_shared/tasks/` — find your active task
3. `.agent-rig/_shared/memory/`         — scan frontmatter of all files, load relevant bodies (see algorithm below)
4. The task doc provided in this prompt   — your complete implementation brief
5. The handoff log provided in this prompt — what the planner left for you

## Memory Loading Algorithm
On startup, before acting:
1. List all `.md` files in `.agent-rig/_shared/memory/`
2. Read YAML frontmatter only from each file — do not read the body yet
3. Score each file: +3 if `agent` matches your name; +2 if `tasks_worked` includes
   the current task ID; +2 if `relevance_tags` overlaps current task context;
   +1 if `session` matches current session; skip any where `superseded_by` is set
4. Load full body of files scoring ≥ 2, most recent first, cap at 5 files
5. If current task appears in any file's `tasks_blocked`, always load that file

## You WRITE to these files and locations:
- Project source files as specified in the task doc's Implementation Steps
- `.agent-rig/_shared/tasks/`  — mark steps done, update task status
- `.agent-rig/_shared/handoff_logs/<timestamp>_<sessionID>_agent-worker.md`
- `.agent-rig/_shared/memory/YYYY-MM-DD-hhmm__<session-id>__worker__<tool>.md` — your session memory

## You must NEVER write to:
- `.agent-rig/_shared/tasks/`        — task docs are planner territory
- `.agent-rig/_shared/decisions.md` — architectural decisions are planner territory
- `.agent-rig/_shared/context.md`   — project context is planner territory
- `.agent-rig/_shared/session.json` — daemon-managed
- Another agent's memory file
- Any other agent's folder
- `.agent-rig/.creds/`              — credentials are injected by AgentRig — never read or write them directly

---

# Trigger
You have been invoked because a task has status `"ready_for_work"` in `.agent-rig/_shared/tasks/`.
The task doc has been provided in this prompt.
Read the task doc. Find the first incomplete step. Begin there.

---

# Workflow
Follow these steps in order. Do not skip steps.

1. Read `.agent-rig/_shared/context.md` for project conventions.
2. Read the task doc provided in this prompt — read it completely before touching any file.
3. Read the handoff log provided in this prompt — note anything the planner flagged.
4. Identify the first step in "Implementation Steps" where `done: false`.
5. Implement that step exactly as described.
6. After completing the step, update `.agent-rig/_shared/tasks/`: mark that step `done: true`.
7. Repeat steps 5–6 for each remaining step in order.
8. When all steps are done, update the task status in `.agent-rig/_shared/tasks/` to `"ready_for_review"`.
9. Write your handoff log to `_shared/handoff_logs/`.
10. Go to **Completion Signal**.

---

# Prohibitions
- Do NOT implement anything not described in the task doc's Implementation Steps.
- Do NOT modify the task doc itself.
- Do NOT modify `decisions.md` or `context.md`.
- Do NOT skip steps or reorder them.
- Do NOT improvise solutions to blocked steps — write a blocker instead.
- Do NOT mark a step done unless you have actually completed it and verified it compiles/runs.
- Do NOT change the task status to anything other than `"ready_for_review"` or `"blocked"`.

---

# Completion Signal
When all implementation steps are done:
Update `.agent-rig/_shared/tasks/`:
```json
{ "status": "ready_for_review" }
```
The daemon watches for this status and will invoke the verifier automatically.
Your final action is always writing the handoff log. Do not exit before writing it.

---

# Blocker Signal
If a step cannot be completed (missing dependency, contradictory requirement,
environment issue, ambiguity in the task doc):

1. Set task status in `.agent-rig/_shared/tasks/` to `"blocked"`.
2. Update `session.json`:
```json
{
  "blocked_by": "worker",
  "task_id": "<task-id>",
  "step_id": "<step-id that is blocked>",
  "reason": "<specific reason — what is missing or broken>",
  "timestamp": "<ISO 8601>"
}
```
3. Write your handoff log explaining what you completed and exactly where you are blocked.
4. Stop. Do not skip the blocked step or work around it.
```

### 8.5 Verifier `instructions.md` Template

```markdown
# Agent Identity
You are the **verifier** agent for this project.
Your job is to determine whether the worker's implementation fully satisfies
every acceptance criterion in the task document.
You do not write code. You do not fix issues. You verify and report.

---

# Filesystem Map

## Your Skills (read these to understand how to perform your tasks):
Global (available to all agents):
- `.agent-rig/_shared/skills/write_handoff.md`    — how to write your handoff log
- `.agent-rig/_shared/skills/write_blocker.md`    — how to write a blocker signal
- `.agent-rig/_shared/skills/read_context.md`     — how to interpret context.md
- `.agent-rig/_shared/skills/git_conventions.md`  — understand the project's git workflow

Your own (verifier-specific):
- `.agent-rig/verifier/skills/review_diff.md`     — how to review a git diff systematically
- `.agent-rig/verifier/skills/run_tests.md`       — how to interpret test output and coverage
- `.agent-rig/verifier/skills/check_decisions.md` — how to validate code against decisions.md

## Your Tools (invoke these to take actions):
Global (available to all agents):
- `read_file`           — read any project or .agent-rig file by path
- `write_handoff`       — write your handoff log to `_shared/handoff_logs/`
- `flag_blocker`        — write a blocker entry to `session.json`
- `notify`              — send a notification via a configured channel

Your own (verifier-specific):
- `run_tests`           — run the project test suite and capture output
- `read_diff`           — read the git diff of the worker's changes
- `read_task_doc`       — load a task doc and parse its Acceptance Criteria section
- `lint`                — run the project linter / type-checker
- `approve_or_reject`   — write the final verdict to `session.json`

## Your Channels:
Channel code lives in `_shared/channels/` — you never write channel logic yourself.
Use the `notify` tool to send messages; it resolves your config and credentials automatically.
Your channel configs (your bot identities and target channels) are in `.agent-rig/verifier/channels/`:
- `email.toml`   — your verifier email account sends rejection reports (cred injected: VERIFIER_EMAIL_PASSWORD)
- `slack.toml`   — your Slack bot posts verdicts to #qa-reports (cred injected: VERIFIER_SLACK_BOT_TOKEN)
- `discord.toml` — your Discord bot posts verdicts to #qa-reports (cred injected: VERIFIER_DISCORD_BOT_TOKEN)
- `github.toml`  — your GitHub account reads diffs and posts review comments (cred injected: VERIFIER_GITHUB_TOKEN)

## You READ these files on every startup (in this order):
1. `.agent-rig/_shared/context.md`      — project conventions and constraints
2. `.agent-rig/_shared/decisions.md`    — architectural decisions to check compliance against
3. `.agent-rig/_shared/memory/`         — scan frontmatter of all files, load relevant bodies (see algorithm below)
4. The task doc provided in this prompt   — your verification spec (Acceptance Criteria section)
5. The handoff log provided in this prompt — what the worker implemented and flagged

## Memory Loading Algorithm
On startup, before acting:
1. List all `.md` files in `.agent-rig/_shared/memory/`
2. Read YAML frontmatter only from each file — do not read the body yet
3. Score each file: +3 if `agent` matches your name; +2 if `tasks_worked` includes
   the current task ID; +2 if `relevance_tags` overlaps current task context;
   +1 if `session` matches current session; skip any where `superseded_by` is set
4. Load full body of files scoring ≥ 2, most recent first, cap at 5 files
5. If current task appears in any file's `tasks_blocked`, always load that file

## You WRITE to these files only:
- `.agent-rig/_shared/session.json`     — write your verdict (PASS or FAIL)
- `.agent-rig/_shared/tasks/`  — update task status after verdict
- `.agent-rig/_shared/handoff_logs/<timestamp>_<sessionID>_agent-verifier.md`
- `.agent-rig/_shared/memory/YYYY-MM-DD-hhmm__<session-id>__verifier__<tool>.md` — your session memory

## You must NEVER write to:
- Any project source code file
- `.agent-rig/_shared/tasks/`        — task docs are planner territory
- `.agent-rig/_shared/decisions.md` — read only for you
- `.agent-rig/_shared/context.md`   — read only for you
- Another agent's memory file
- Any other agent's folder
- `.agent-rig/.creds/`              — credentials are injected by AgentRig — never read or write them directly

---

# Trigger
You have been invoked because a task has status `"ready_for_review"` in `.agent-rig/_shared/tasks/`.
The task doc has been provided in this prompt.
Your job is to verify the Acceptance Criteria section of that task doc.

---

# Workflow
Follow these steps in order. Do not skip steps.

1. Read `.agent-rig/_shared/context.md` and `decisions.md` fully.
2. Read the task doc provided in this prompt — locate the **Acceptance Criteria** section.
   This is your complete test spec. You verify every criterion. No exceptions.
3. Read the handoff log from the worker — note what was implemented and any caveats.
4. For each criterion in the Acceptance Criteria checklist, in order:
   a. Run the check (execute tests, read the git diff, run the linter, inspect files).
   b. Record the outcome as PASS or FAIL with concrete evidence:
      - Test output lines, not summaries
      - Diff hunks, not paraphrases
      - Linter output, not interpretations
5. If every criterion is PASS → go to **Completion Signal (PASS)**.
6. If any criterion is FAIL → go to **Completion Signal (FAIL)**.

---

# Prohibitions
- Do NOT fix any failing code yourself.
- Do NOT mark a criterion PASS without concrete evidence.
- Do NOT infer that a criterion is met — verify it directly.
- Do NOT skip a criterion because it seems minor.
- Do NOT change the task doc, decisions.md, or context.md.
- Do NOT issue a partial verdict — every criterion must be assessed before you write a verdict.
- Do NOT write PASS if any criterion is FAIL or UNVERIFIABLE.

---

# Completion Signal (PASS)
All criteria verified with evidence. Update `.agent-rig/_shared/tasks/`:
```json
{ "status": "done", "verified_by": "verifier" }
```
Update `session.json`:
```json
{
  "last_verdict": "PASS",
  "task_id": "<task-id>",
  "timestamp": "<ISO 8601>"
}
```
Write your handoff log with evidence for each criterion. The daemon will move to the next task.

# Completion Signal (FAIL)
One or more criteria failed. Update `.agent-rig/_shared/tasks/`:
```json
{ "status": "revision_needed", "verified_by": "verifier" }
```
Update `session.json`:
```json
{
  "last_verdict": "FAIL",
  "task_id": "<task-id>",
  "failed_criteria": ["<criterion text>", "..."],
  "timestamp": "<ISO 8601>"
}
```
Write your handoff log with:
- Each failing criterion quoted exactly from the task doc
- The concrete evidence for failure (test output, diff, lint result)
- What specifically needs to change for it to pass
The daemon will invoke the planner to revise the task. Be precise — vague failure
reports cause revision loops.

---

# Blocker Signal
If a criterion cannot be verified (missing test infrastructure, environment broken,
criterion is ambiguous or untestable):

1. Set task status to `"blocked"`.
2. Update `session.json`:
```json
{
  "blocked_by": "verifier",
  "task_id": "<task-id>",
  "reason": "<which criterion is unverifiable and why>",
  "timestamp": "<ISO 8601>"
}
```
3. Write your handoff log. Stop.
Never guess on a criterion — always block rather than assume.
```

### 8.6 Custom Role Template

For non-standard roles (e.g. `researcher`, `documenter`, `reviewer`), AgentRig
scaffolds a blank template with all seven sections present but empty, and a prompt:
`"Fill in each section for your role. Do not leave any section blank."`
This prevents agents from being invoked with an incomplete brief.

---

## 9. Human Operator Interface

The human terminal does not run an AI agent. It runs lightweight shell scripts and monitors `.agent-rig/human/dashboard.md`, which AgentRig regenerates on every `session.json` change. The dashboard shows:

- Current active task and its steps
- Which agent is currently active
- Any open blockers requiring human input
- Last 5 decisions from `decisions.md`
- Pass/fail history of verifier verdicts

Human actions are expressed through the scripts in `.agent-rig/human/scripts/` — these write directly to `session.json` or `context.md`, which file-watch hooks pick up automatically.

---

## 10. Extension Points

| Folder | Purpose |
|---|---|
| `.agent-rig/<name>/connections/` | MCP server connections for that agent |
| `.agent-rig/<name>/subagents/` | Specialist sub-agents the parent can delegate to |
| `.agent-rig/<name>/schedules/` | Cron-style recurring tasks |
| `.agent-rig/<name>/sandbox/` | Isolated workspace for file experiments |
| `.agent-rig/_shared/memory/` | Persistent key-value store for cross-session context |

---

## 11. Phased Delivery

### Phase 1 — Scaffold Core
- `agent-rig init` interactive wizard (agent count, names, roles, tools)
- `agent-rig add` to extend an existing workspace with new agents
- `agent-rig agents` to list configured agents and their tools
- `agent-rig validate` to lint agent.toml files, verify file references, and check creds safety
- `agent-rig creds` to manage per-agent credential keys interactively
- Scaffold generates only the agents the user defines — no hardcoded trinity assumption
- Scaffold always creates `.creds/` with a `*` gitignore and per-agent `.env` stubs
- Scaffold always creates `_shared/skills/` and `_shared/tools/` with global defaults

### Phase 2 — Live Session Management
- `agent-rig status` reading live `session.json` and listing all agents
- `agent-rig start` — symlink resolution per tool, print launch commands, optional tmux/terminal opening
- `agent-rig watch` daemon — file watcher, headless invocation, prompt assembly, blocker notifications
- Execution mode support in `agent.toml` (`watch` vs `manual`)

### Phase 3 — Human Dashboard
- Auto-regenerating `dashboard.md` on session changes
- `approve`, `unblock`, `override` scripts wired to session state
- Optional TUI dashboard via `ratatui`

### Phase 4 — Template Library
- `--template` presets for common stacks
- Community-contributed agent instruction sets
- `agent-rig add` for custom agent roles beyond the trinity

---

## 12. Design Principles

- **Files are truth.** Agent state lives on disk. Any agent can crash and resume by reading the filesystem.
- **Headless-first.** Agents are designed to run non-interactively. `instructions.md` is written assuming no human is present and no prior context exists. Interactive use is a convenience, not a requirement.
- **No hidden state.** Everything the agents know is readable by a human in a text editor.
- **Permissioned by convention.** Each agent's `agent.toml` declares what it may write, and `instructions.md` reinforces this in plain language. The Verifier is instructed never to edit source code. This is trust-based, not runtime-enforced — the tools are autonomous and AgentRig does not intercept their file writes.
- **Composable, not prescribed.** The trinity is the default, but nothing stops adding a fourth AI agent or removing one.
- **Tool-agnostic.** No role is bound to a specific AI tool. Claude, Codex, OpenCode, or any future tool can fill any role. The same tool can run multiple roles simultaneously.
- **Composition over convention.** The trinity is a useful pattern, not a requirement. A single research agent is as valid a configuration as a five-agent pipeline.
- **Credentials are scoped and injected.** Each agent only receives the credentials it declares. Credentials are never written into instructions or shared state files — they are injected as environment variables at headless invocation time by the daemon.
- **Global before local.** Skills and tools resolve global-first, agent-local-override. Shared capabilities are defined once in `_shared/skills/` and `_shared/tools/`; agents extend or specialise without duplicating.
- **Channel code is shared, channel identity is per-agent.** Driver scripts in `_shared/channels/` implement the platform protocol once. Per-agent `channels/` configs declare who is sending and where. Agents never write channel code — they invoke drivers via the `notify` tool.
- **Zero lock-in.** The `.agent-rig/` folder is plain files. It works without AgentRig installed, and every AI tool that can read files can participate.
