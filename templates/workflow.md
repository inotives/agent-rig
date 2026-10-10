# AgentRig Planning And Delivery Workflow

Use this workflow for phase and feature work.

## 0. Choose Workflow Storage

- New workspaces default to Markdown:
  `agent-rig init --yes`.
- New workspaces can start directly with SQLite:
  `agent-rig init --yes --workflow-store sqlite`.
- Existing Markdown workspaces migrate with:
  `agent-rig workflow migrate --to sqlite`.
- After migration, SQLite is canonical and migrated Markdown is historical
  reference only. Agents continue to mutate tasks and handoffs through the
  `agent-rig tasks ...` CLI.

## 1. Plan With The Human

- The planner and human clarify goals, constraints, trade-offs, and acceptance
  criteria before implementation tasks are created.
- Read the project docs and relevant phase docs first.
- Ask one decision question at a time and record accepted decisions.
- Create ADRs only for meaningful, hard-to-reverse trade-offs.
- Keep the phase plan, implementation plan, ADRs, and acceptance documentation
  as canonical repository files under `docs/`.
- Do not migrate planning documents into the workflow store; SQLite is for live
  operational tasks and handoff conversations only.

For GitHub Issue planning, use this sequence:

1. `agent-rig plan github-issue` lists open issues. Discovery does not create
   workflow tasks.
2. `agent-rig plan github-issue <number>` selects one issue.
3. `agent-rig plan branch <number>` creates the issue branch and plan.
4. Review the plan with the human. AgentRig prints a GitHub compare link and
   does not create a pull request automatically.
5. `agent-rig plan approve <number>` records human approval.
6. `agent-rig plan tasks <number>` creates workflow tasks only after approval.

GitHub planning requires the GitHub CLI (`gh`) and authentication. Normal
local workflows do not require GitHub CLI access. Use
`agent-rig plan resume <number>` for an existing unapproved plan.

## 2. Create Dependency-Gated Tasks

- Break the approved plan into small, independently verifiable tasks.
- Add explicit `depends_on` edges and one final integrated-review task.
- Set only dependency-free foundation tasks to `ready`.
- Keep downstream tasks `blocked`; dependency metadata does not authorize work
  by itself.

## 3. Run The Planner-Manager Worker And Reviewer Flow

For each selected task:

1. The planner-manager unblocks and claims the task for its worker.
2. The worker reads its profile, task, project docs, relevant prior handoffs,
   and affected code; makes only scoped changes; runs focused checks; sets the
   task to `review`; and writes a worker handoff. The worker does not commit or
   push.
3. An independent reviewer reads the reviewer profile, task, worker handoff,
   project docs, and current diff; verifies the acceptance criteria without
   editing implementation files; and writes a reviewer handoff.
4. The reviewer records one handoff decision: `approved`, `changes_requested`,
   or `blocked`. The reviewer does not change task status.
5. If review is clean, the planner-manager marks the task `done` and unlocks
   only the next selected dependent task.
6. If review finds an issue, the planner-manager returns the same task to
   `in_progress`. The same worker reads both handoffs, applies the focused fix,
   verifies it, and writes a new handoff. Review again before unlocking
   downstream work.
7. Child agents do not start nested AgentRig loops.

## 4. Replan When Reality Changes The Plan

- If implementation or review exposes a limitation that changes scope,
  architecture, or acceptance criteria, pause the affected task graph.
- Return to the planner and human. Do not silently invent a workaround or
  continue downstream work from a stale plan.
- Update the canonical phase/implementation documents under `docs/` and add an
  ADR when the change is a meaningful trade-off.
- Create new tasks or revise dependencies only after the updated plan is
  accepted. Keep affected downstream tasks `blocked` until the revised
  predecessors pass review.

## 5. Finish The Phase

- After all implementation tasks pass task-level review, the planner-manager
  directly runs the final integrated review against the complete diff and phase
  acceptance checks.
- If the integrated review finds an issue, the planner-manager routes the
  `changes_requested` repair through the same worker and independent reviewer
  cycle, then repeats the integrated review. The planner-manager owns final
  phase acceptance.
- Write a planner-manager handoff with verification evidence and resolved
  findings.
- Commit, push, or open a pull request only when the human explicitly asks.
- Complete the final human end-to-end check for discovery, plan review,
  approval, task generation, and the worker-reviewer flow before marking the
  phase complete.
