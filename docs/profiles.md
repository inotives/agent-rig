# Agent Profiles

Agent profiles are editable Markdown templates for new agent instructions.

`agent-rig init` copies built-in profiles into:

```text
.agent-rig/_shared/profiles/
```

Built-in profiles:

- `planner`
- `worker`
- `reviewer`

`verifier` and `tester` use the `reviewer` profile by default. `supervisor` uses the `planner` profile. Unknown custom roles use the `worker` profile unless `--profile` is provided.

## Commands

```bash
agent-rig profiles
agent-rig profiles --json
agent-rig profiles show worker
agent-rig add api-worker --role worker --tool codex --profile worker
```

Outside a workspace, `agent-rig profiles` lists packaged built-ins. Inside a workspace, it lists editable files from `.agent-rig/_shared/profiles/`.

## File Format

Profile files are Markdown files with YAML frontmatter. File names must be lowercase slugs, such as `worker.md` or `api-worker.md`.

Required frontmatter:

```yaml
name: worker
role: worker
summary: Implements assigned tasks.
created_on: 2026-06-29
updated_on: 2026-06-29
shared_skills: []
agent_skills: []
```

Recommended body structure:

```markdown
# Worker Profile

## Responsibility
## Context
## Skills And Tools
## Workflow
## Human Escalation
## Output
```

`shared_skills` install into `.agent-rig/_shared/skills/`. `agent_skills` install into `.agent-rig/<agent>/skills/`.

Skill entries use `skills.sh` sources:

```yaml
agent_skills:
  - source: https://github.com/apollographql/skills
    name: rust-best-practices
    args:
      - --skill
      - rust-best-practices
```

## Copy Behavior

Profiles are copy-only templates. When an agent is created, AgentRig copies the selected profile into `.agent-rig/<agent>/instructions.md` and replaces `<agent>` with the agent name.

AgentRig does not store the source profile in `agent.toml`, and editing a shared profile does not rewrite existing agents.
