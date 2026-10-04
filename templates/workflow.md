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

## 2. Create Dependency-Gated Tasks

- Break the approved plan into small, independently verifiable tasks.
- Add explicit `depends_on` edges and one final integrated-review task.
- Set only dependency-free foundation tasks to `ready`.
- Keep downstream tasks `blocked`; dependency metadata does not authorize work
  by itself.

## 3. Run Worker And Reviewer Sub-Agents

For each selected task:

1. Unblock and claim the task for its worker.
2. The worker reads its profile, task, project docs, relevant prior handoffs,
   and affected code; makes only scoped changes; runs focused checks; sets the
   task to `review`; and writes a worker handoff. The worker does not commit or
   push.
3. An independent reviewer reads the reviewer profile, task, worker handoff,
   project docs, and current diff; verifies the acceptance criteria without
   editing implementation files; and writes a reviewer handoff.
4. If review is clean, mark the task `done` and unlock only the next selected
   dependent task.
5. If review finds an issue, return the same task to `in_progress`. A worker
   reads both handoffs, applies the focused fix, adds regression coverage when
   needed, verifies it, and writes a new handoff. Review again before unlocking
   downstream work.

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

- After all implementation tasks pass task-level review, run the final
  integrated reviewer task against the complete diff and phase acceptance
  checks.
- Write a planner handoff with verification evidence and resolved findings.
- Commit, push, or open a pull request only when the human explicitly asks.
