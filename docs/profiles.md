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
- `researcher`
- `writer`
- `designer`

`verifier` and `tester` use the `reviewer` profile by default. `supervisor` uses the `planner` profile. `researcher`, `writer`, and `designer` use their matching profiles by default. Unknown custom roles use the `worker` profile unless `--profile` is provided.

## Commands

```bash
npm run profile:create -- api-specialist
agent-rig profiles
agent-rig profiles --json
agent-rig profiles show worker
agent-rig profiles update worker --agent worker
agent-rig profiles update worker --all --apply
agent-rig add api-worker --role worker --tool codex --profile worker
agent-rig add research --role researcher --tool claude
agent-rig add docs-writer --role writer --tool claude
agent-rig add ui-designer --role designer --tool codex
```

`npm run profile:create -- <name>` is a repository development command. It
creates a partial `templates/profiles/<name>.md` file for a new built-in
profile. The file contains the required frontmatter and standard instruction
headings. It also includes the standard shared skills used by AgentRig. Fill
in the summary, agent-specific skills, and instructions before building or
publishing AgentRig. The command refuses to overwrite an existing template.

Outside a workspace, `agent-rig profiles` lists packaged built-ins. Inside a workspace, it lists editable files from `.agent-rig/_shared/profiles/`.

`profiles update` refreshes a workspace profile and the instructions for one
agent or all agents that use the built-in profile. It previews the files by
default. Add `--apply` to write the update. Before writing, AgentRig copies
the existing files to `.agent-rig/_shared/profile-backups/<timestamp>/`.

The update uses the built-in profile shipped with the installed AgentRig
version. It does not install or update skills. Use `agent-rig skills add` for
skill changes.

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

## Built-In Agent Skills

Profile-declared `agent_skills` install into the created agent's local `skills/` folder.

Researcher:

```bash
npx skills add https://github.com/affaan-m/everything-claude-code --skill research-ops
```

Writer:

```bash
npx skills add https://github.com/blader/humanizer --skill humanizer
npx skills add https://github.com/getsentry/skills --skill blog-writing-guide
```

Designer:

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```
