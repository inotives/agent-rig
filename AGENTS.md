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

AgentRig work is organized by implementation phases under `docs/phases/`, with completed phases archived under `docs/_archived/`.

For each new phase:

1. Start with `grill-with-docs`.
   - Read the relevant phase markdown and existing project docs before asking questions.
   - Ask one decision question at a time.
   - Provide a recommended answer with each question.
   - Update the phase markdown and ADRs as decisions are made.
   - Create ADRs only for meaningful tradeoffs that future contributors would need to understand.

2. Finish and commit the docs first.
   - When grilling is complete, commit the updated docs on `main`.
   - Push the docs commit to `origin/main`.
   - Keep this separate from implementation commits.

3. Start implementation from a new feature branch.
   - Create the feature branch from the latest `main`.
   - Implement according to the finalized phase docs.
   - Keep changes scoped to the phase.
   - Run the relevant checks and live tests described by the phase acceptance criteria.

4. Complete the phase.
   - Commit implementation work on the feature branch.
   - Push the branch and provide PR notes.
   - After the PR lands, checkout `main` and pull.
   - Move the completed phase doc from `docs/phases/` to `docs/_archived/`.
   - Then begin grilling the next phase.

## Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes and LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---
