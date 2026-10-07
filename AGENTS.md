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

## Technical English

Use ASD-STE100 (Simplified Technical English) principles when you write or
rewrite planning documents, tasks, handoffs, ADRs, instructions, and other
agent-facing text.

- Use short, direct sentences and one instruction per step.
- Prefer common words, active voice, and imperative instructions.
- Use one term for one concept. Do not switch between synonyms.
- Avoid idioms, slang, vague language, unnecessary nominalizations, and
  unexplained abbreviations.
- State conditions, actions, and expected results clearly.
- Keep code, paths, identifiers, command names, and required technical tokens
  exact even when they do not follow Simplified Technical English.
- Review text for ambiguity before you save a document or write a handoff.

## Task Workflow

With the default Markdown provider, shared tasks live in:

```text
.agent-rig/_shared/tasks/
```

Each default-provider task is a Markdown file with YAML frontmatter. After
migration, SQLite is the source of truth and these files are historical only.

Before starting work:

1. Read the assigned task with `agent-rig tasks show <task-id>`.
2. Check `depends_on` and `status`.
3. Only work on tasks that are ready for your role.
4. Update the task through AgentRig commands.

Useful commands:

```bash
agent-rig tasks
agent-rig tasks next --agent <agent-name>
agent-rig tasks next --agent <agent-name> --claim
agent-rig tasks show <task-id>
agent-rig tasks update-body <task-id> --body-file <path>
agent-rig tasks set-status <task-id> <status>
agent-rig tasks done <task-id> --message "<summary>"
agent-rig tasks block <task-id> --reason "<reason>"
agent-rig tasks handoff <task-id> --sender <role> --recipient <role> --status <status> --message "<summary>"
```

Confirm the active provider in `.agent-rig/_shared/agent-rig.json` before
mutating workflow state. Use the project-local `agent-rig tasks ...` command
for every task and handoff mutation. In SQLite mode, migrated task and handoff
Markdown is historical reference only and must not be edited directly.

## Handoff

With the default Markdown provider, AgentRig writes handoffs into:

```text
.agent-rig/_shared/handoff_logs/
```

In Markdown mode, use this filename format:

```text
<date-YYYY-MM-DD-hhmm>_<session_id>_<claude|codex|opencode|etc>_<role>.md
```

In Markdown mode, use YAML frontmatter for metadata such as:

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

## Project Phase And Agent Workflow

AgentRig work is organized by implementation phases under `docs/phases/`, with
completed phases archived under `docs/_archived/`.

For each new phase:

1. Prepare the planning workspace.
   - Confirm the current branch and clean working tree.
   - When starting from `main`, create and switch to a phase feature branch
     from the latest `main` before changing phase docs or creating tasks.

2. Grill the phase with the human.
   - Read the relevant phase markdown and existing project docs first.
   - Use `grill-with-docs` and ask one decision question at a time.
   - Provide a recommended answer and concrete trade-offs with each question.
   - Record accepted decisions in the phase document and meaningful trade-offs
     in ADRs.
   - Keep phase plans, implementation plans, ADRs, and acceptance documentation
     as repository files under `docs/`. These documents are canonical planning
     artifacts and are not workflow-store records.
   - Do not create implementation tasks until the human-approved plan is
     clear.

3. Break the approved plan into tasks.
   - The planner and human turn the finalized phase into small, independently
     verifiable AgentRig task files.
   - Every new task must include Context, Goal, Scope, Planner Notes, Implementation Plan, and Acceptance Criteria. Create it with `agent-rig tasks create <title> --body-file <path>`.
   - If the plan changes, update the task brief through `agent-rig tasks update-body <task-id> --body-file <path>` before continuing the loop.
   - Add explicit `depends_on` edges and one final integrated-review task.
   - Set only dependency-free foundation tasks to `ready`.
   - Keep downstream tasks `blocked`; dependency metadata alone does not
     authorize them to start.

4. Run the manager-driven worker/reviewer loop.
   - Unblock and claim one selected eligible worker task.
   - Spawn a worker sub-agent using the assigned AgentRig profile. It reads
     the task, project docs, relevant prior handoffs, and affected code; makes
     only scoped changes; runs focused checks; sets the task to `review`; and
     writes a worker handoff. It does not commit or push.
   - Spawn an independent reviewer sub-agent using the reviewer profile. It
     reads the task, worker handoff, project docs, and current diff; verifies
     the acceptance criteria; does not edit implementation files; and writes a
     reviewer handoff.
   - If review is clean, mark the task `done` and unblock only the next
     selected dependent task.
   - If review finds a problem, set the same task back to `in_progress` and
     spawn a worker to read both handoffs, implement the focused fix, add
     regression coverage where needed, verify it, and write a new handoff.
     Repeat independent review until clean; do not unlock downstream work.

   - If implementation or review exposes a limitation that changes the plan,
     pause the affected task graph. Do not silently work around a material
     scope or architecture change.
   - Return to the planner and human to discuss the finding, update the
     canonical documents under `docs/`, and add or revise ADRs when needed.
   - Create new tasks or revise task dependencies only after the updated plan
     is accepted. Keep newly affected downstream tasks `blocked` until the
     revised predecessors pass review.

5. Complete the phase.
   - After all implementation tasks pass task-level review, run the final
     integrated reviewer task against the complete diff and phase acceptance
     checks.
   - Write the planner phase handoff with verification evidence and resolved
     review findings.
   - Commit, push, or open a pull request only when the human explicitly asks.
   - After merge, archive the completed phase document under `docs/_archived/`
     before beginning the next phase.

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
