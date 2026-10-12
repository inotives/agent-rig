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
4. Return worker or reviewer handoff content to the planner. Only the planner
   updates task and handoff state through AgentRig commands.

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

The planner must confirm the active provider in `.agent-rig/_shared/agent-rig.json` before
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
- If blocked, return a `blocked` handoff to the planner. The planner records it.

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

   For a GitHub Issue planning run, use the project-local planning commands:

   - `agent-rig plan github-issue` lists open issues. It does not create tasks.
   - `agent-rig plan github-issue <number>` selects one issue.
   - `agent-rig plan branch <number>` creates the issue branch and plan.
   - `agent-rig plan resume <number>` resumes an unapproved plan.
   - `agent-rig plan approve <number>` records explicit human approval.
   - `agent-rig plan tasks <number>` creates workflow tasks only after approval.

   GitHub planning requires `gh` and authentication. Normal local workflows do
   not require GitHub CLI access. AgentRig prints a compare link after it pushes
   the issue branch. It does not create a pull request automatically.

3. Break the approved plan into tasks.
   - The planner and human turn the finalized phase into small, independently
     verifiable AgentRig task files.
   - Every new task must include Context, Goal, Scope, Planner Notes, Implementation Plan, and Acceptance Criteria. Create it with `agent-rig tasks create <title> --body-file <path>`.
   - If the plan changes, update the task brief through `agent-rig tasks update-body <task-id> --body-file <path>` before continuing the workflow.
   - Add explicit `depends_on` edges and one final integrated-review task.
   - Set only dependency-free foundation tasks to `ready`.
   - Keep downstream tasks `blocked`; dependency metadata alone does not
     authorize them to start.

4. Run the planner-mediated worker/reviewer flow.

   The profile token and handoff recipient remain `planner`. The planner-manager
   is the only task and handoff state writer for both Markdown and SQLite.
   Workers and reviewers return handoff content to the planner. They do not write
   task status, dependencies, canonical handoffs, or workflow-store files. They
   do not commit, push, or start nested AgentRig loops.

   For each selected task:

   1. The planner checks task status and dependencies, selects one eligible task,
      and sets it to `in_progress` before launching one worker.
   2. The worker reads the supplied instructions and task, makes scoped changes,
      runs focused checks, and returns `review` to `reviewer`, or `blocked` to
      `planner`. The planner records the handoff and sets `review` or `blocked`.
   3. The planner launches one independent reviewer in the same project workspace.
      The reviewer inspects the task, worker handoff, docs, and current diff. It
      does not edit implementation files or repository notes. It runs focused
      checks and returns exactly one decision: `approved` to `planner`,
      `changes_requested` to `worker`, or `blocked` to `planner`.
   4. The planner records the reviewer handoff. For `approved`, it marks the task
      `done` with completion evidence. The next task stays `blocked` until the
      commit gate passes.
      For `changes_requested`, it sets `review -> in_progress` before sending
      the same worker the focused findings. The worker reads both handoffs,
      repairs the task, and returns a new `review` handoff. The planner records
      it, sets `review`, and launches independent review again. For `blocked`,
      the planner sets `blocked` and resolves the blocker with the human.
   5. Human findings use `human -> planner: changes_requested`. The planner
      records the findings and sends a focused
      `planner -> worker: changes_requested` handoff. Repairs pass independent review before acceptance.

   After independent review and task completion, the planner must pass the commit
   gate before selecting, unblocking, or starting the next task:

   - Stage only the completed task's changes with explicit paths. Check the staged
     diff and commit with a task-specific message that includes the task ID.
   - Verify the commit with `git log -1 --oneline` and `git show --stat HEAD`.
     Confirm that it contains the completed task's changes. Run
     `git status --porcelain` and require a clean working tree before proceeding.
   - If commit or verification fails, keep the next task `blocked`. Treat the
     failure as a planner blocker and resolve it before proceeding. Do not include
     unrelated changes or discard them to make the working tree clean.
   - Only after the gate passes, select and unblock the next eligible task.
     Do not push automatically. Workers and reviewers must not commit or push.

   Child prompt inputs must include the project repository root, complete role
   instructions, shared context, the task brief and acceptance criteria, and only
   the latest relevant handoffs. Preserve local role precedence. Include the
   worker handoff and current diff for the reviewer. Include both worker and
   reviewer handoffs for a repair. State the scope, forbidden mutations, required
   checks, and output format. Use the same project workspace for both children.
   Do not add provider-specific launch flags to this contract.

   Return the proposed handoff as Markdown with these six fields:

   - **Decision:** `review`, `approved`, `changes_requested`, or `blocked`.
   - **Recipient:** `reviewer`, `worker`, or `planner`, as defined above.
   - **Summary:** State what changed or what the review concluded.
   - **Findings:** List actionable findings with file and line references, or `None`.
   - **Evidence:** Give exact check commands, results, and any check that could not run.
   - **Requested action:** State the next action for the recipient.

   The recipient identifies the next role; the planner receives and records every
   child result before routing it. Child failure does not trigger automatic retry.
   The planner saves diagnostic output and decides whether to retry or ask the
   human. Use `blocked` only for a real task or environment blocker.

   - If implementation or review exposes a limitation that changes the plan,
     pause the affected task graph. Do not silently work around a material
     scope or architecture change.
   - Return to the planner and human to discuss the finding, update the
     canonical documents under `docs/`, and add or revise ADRs when needed.
   - Create new tasks or revise task dependencies only after the updated plan
     is accepted. Keep newly affected downstream tasks `blocked` until the
     revised predecessors pass review.

5. Complete the phase.
    - After all implementation tasks pass task-level review, the planner-manager
      directly runs the final integrated review against the complete diff and
      phase acceptance checks.
    - If the integrated review finds a problem, the planner-manager routes the
      `changes_requested` repair through the same worker and independent
      reviewer cycle, then repeats the integrated review. The planner-manager
      owns final phase acceptance.
   - Record planner completion evidence and resolved review findings. Do not
     create a `planner -> planner` self-handoff.
   - The planner commits completed tasks through the commit gate above.
     Push or open a pull request only when the human explicitly asks.
   - After merge, archive the completed phase document under `docs/_archived/`
     before beginning the next phase.
   - Keep planner integrated review and human final review as separate gates.
     Complete the human end-to-end check and record acceptance before marking
     the phase complete. Route human findings through the planner to the worker.

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
