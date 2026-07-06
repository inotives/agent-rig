# AGENT Guidelines

This project uses AgentRig. When Claude, Codex, OpenCode, or another terminal agent starts in this repository, use this file as the first routing guide.

## AgentRig Startup

1. Find your agent name.
   - Prefer the human-provided agent name from the launch command or terminal note.
   - If no name is provided, ask the human which `.agent-rig/<agent>/` folder to use.

2. Read your local role files first.
   - `.agent-rig/<agent>/instructions.md`
   - `.agent-rig/<agent>/context.md`
   - `.agent-rig/<agent>/agent.toml`

3. Read shared project context next.
   - `.agent-rig/_shared/context.md`
   - `.agent-rig/_shared/agent-rig.json`
   - `.agent-rig/_shared/session.json`

4. Use local role assets before global ones.
   - Agent skills: `.agent-rig/<agent>/skills/`
   - Agent tools: `.agent-rig/<agent>/tools/`
   - Shared skills: `.agent-rig/_shared/skills/`
   - Shared tools: `.agent-rig/_shared/tools/`

AgentRig assumes local project skills and tools take precedence over similar global skills and tools. If a global skill differs from the project-local copy, follow the local copy unless the human says otherwise.

## Task Workflow

Shared tasks live in:

```text
.agent-rig/_shared/tasks/
```

Each task is a Markdown file with YAML frontmatter. Treat the task file as the source of truth.

Before starting work:

1. Read the assigned task file.
2. Check `depends_on` and `status`.
3. Only work on tasks that are ready for your role.
4. Update the task through AgentRig commands when possible.

Useful commands:

```bash
agent-rig tasks
agent-rig tasks next --agent <agent-name>
agent-rig tasks next --agent <agent-name> --claim
agent-rig tasks show <task-id>
agent-rig tasks set-status <task-id> <status>
agent-rig tasks done <task-id> --message "<summary>"
agent-rig tasks block <task-id> --reason "<reason>"
```

## Handoff

Write handoffs into:

```text
.agent-rig/_shared/handoff_logs/
```

Use this filename format:

```text
<date-YYYY-MM-DD-hhmm>_<session_id>_<claude|codex|opencode|etc>_<role>.md
```

Use YAML frontmatter for metadata such as:

```yaml
---
agent: <agent-name>
role: <role>
tool: <claude|codex|opencode|etc>
task: <task-id>
task_title: <task title>
status: <done|blocked|handoff>
---
```

## Working Rules

- Follow `.agent-rig/<agent>/instructions.md` over this general scaffold.
- Keep edits scoped to the assigned task.
- Do not overwrite another agent's work unless the task explicitly requires it.
- Prefer project-local commands and docs over global memory.
- If blocked, record the blocker in the task and write a handoff.

## Project Phase Workflow

If this repository uses phase-based AgentRig planning:

1. Start planning phases with `grill-with-docs`.
2. Commit finalized docs before implementation.
3. Implement from a feature branch.
4. Run the phase acceptance checks.
5. Push the branch and open a draft PR.
6. After merge, archive the phase doc under `docs/_archived/`.

## Coding Guidelines

### Think Before Coding

- State assumptions when they matter.
- If multiple interpretations exist, ask or choose the smallest reversible path.
- If something is unclear enough to risk wrong work, stop and ask.

### Simplicity First

- No features beyond the task.
- No abstractions for one use.
- No speculative configuration.
- Prefer the smallest code that solves the actual problem.

### Surgical Changes

- Touch only files required by the task.
- Match the existing style.
- Do not refactor unrelated code.
- Remove only dead code created by your own change.

### Verify

Run the smallest relevant check before handing off. If you cannot run it, say why in the handoff.
