# Phase 21: GitHub Issue Planning Workflow

## Goal

Let the planner convert one GitHub Issue into a reviewed implementation plan
before AgentRig creates implementation tasks and starts the worker-reviewer
loop.

## Initial Workflow

1. Discover eligible GitHub Issues.
2. Select one issue.
3. Create one issue branch for the issue.
4. Create and refine planning documents with the human.
5. Push the issue branch.
6. Stop and prompt the human to review the plan.
7. Resume only after the human approves the plan.
8. Create dependency-gated implementation tasks.
9. Start the normal worker-reviewer loop.

## Accepted Decisions

### One Issue Per Planning Run

One GitHub Issue maps to one issue branch and one planning run. Batch
planning is out of scope for this phase.

### AgentRig Owns Issue Discovery

AgentRig owns issue discovery and selection. The planner may use an explicit
issue number when the human already selected an issue:

```bash
agent-rig plan github-issue 123
```

Without an issue number, AgentRig lists eligible issues. The planner must not
select the first issue silently when more than one issue is available.

### Discovery Lists All Open Issues

Discovery lists all open issues in the current GitHub repository. It excludes
pull requests. The first version does not require a planning label. The
planner and human decide whether the selected issue is suitable during the
planning discussion.

### AgentRig Creates and Pushes the Issue Branch

The planning command requires a clean worktree. It fast-forwards local
`main`, creates a branch named `issue/<number>-<short-slug>`, commits planning
documents, and pushes the branch. If the branch already exists, the command
stops without changing it.

### Plan Approval Is Explicit and Persistent

The planning run stops after it pushes the issue branch. The human reviews the
branch and approves it with:

```bash
agent-rig plan approve 123
```

AgentRig records the approval and allows task creation only after this
command succeeds. Approval can happen in a later session.

The planner must not create implementation task files before Plan Approval.
Task creation starts only after the human approves the plan.

### Plan Review Uses a Branch and Compare Link

AgentRig pushes the issue branch and prints a GitHub compare link. It does not
create a pull request automatically. The human may review the branch directly
or create a draft pull request when useful.

### Planning Runs Are Guarded and Resumable

The command does not overwrite an existing plan. It resumes an unapproved
plan only through an explicit resume path. It refuses to create a second plan
for an issue that already has an approved plan and directs the user to the
existing implementation tasks. After approval, the worker-reviewer loop uses
the same issue branch.

### Comments Provide Planner Context

The planner reads the issue title, body, labels, URL, number, and current
comments. Comments are context only. The planner copies a comment into the
canonical plan only after the planner and human accept it as a requirement.

### Issue Plans Use `docs/plans/`

Issue plans use this path:

```text
docs/plans/issue-<number>-<short-slug>.md
```

The `docs/phases/` directory remains for larger implementation phases. An
issue plan may include an optional phase reference.

### Plan State Uses Frontmatter

The issue plan stores its planning state in YAML frontmatter. The state
includes the issue number, source URL, branch, plan status, creation time, and
approval time. The plan is the canonical planning record. It does not use the
workflow store.

### Task Generation Reuses Matching Imported Tasks

After approval, task generation checks for an existing task with matching
GitHub source metadata. It reuses that task when one exists. Otherwise, it
creates a new task. It never creates two live tasks for the same repository
and issue.

### Task Generation Does Not Start Agents

`agent-rig plan tasks <issue-number>` creates and commits the implementation
tasks, then prints the manager loop command. It does not spawn worker or
reviewer agents.

### Issue Planning Bypasses Sync Until Approval

The planning command reads the selected issue directly. It does not create a
temporary task or call `tasks sync github`. The issue enters the live task
store only after plan approval and task generation.

### Branch Creation Uses Scoped Cleanliness

Branch creation rejects tracked modifications and unexpected untracked files.
It allows known AgentRig runtime paths, including SQLite WAL/SHM files and
profile backups, and reports the allowed paths before it proceeds.

## Resolved Workflow

1. `agent-rig plan github-issue` lists all open issues in the current
   repository, excluding pull requests. The planner must not select the first
   issue silently when more than one issue is available.
2. `agent-rig plan github-issue <number>` selects one issue directly.
3. `agent-rig plan branch <number>` creates `issue/<number>-<short-slug>` from fast-forwarded `main`,
   writes the issue plan, commits it, pushes it, and prints a compare link.
4. AgentRig stops. It does not create a pull request and does not create
   implementation tasks before human approval.
5. The human approves with `agent-rig plan approve <number>`.
6. `agent-rig plan tasks <number>` creates complete dependency-gated tasks.
7. The existing manager-driven worker-reviewer loop runs separately on the
   same issue branch.
8. An existing unapproved plan resumes only through an explicit resume path.
   An approved plan cannot create a second plan for the same issue.

The final implementation task must be a human-in-the-loop end-to-end check.
It verifies the complete workflow with a real or disposable GitHub Issue and
requires human review before it is marked done.

## Acceptance Criteria

- A planner can discover all eligible open GitHub Issues through AgentRig.
- A planner can select exactly one issue for a planning run.
- AgentRig creates one issue-specific planning branch.
- AgentRig writes the canonical issue plan under `docs/plans/`.
- AgentRig pushes the issue branch and prints a compare link.
- AgentRig pauses for human review without opening a pull request.
- AgentRig does not create implementation tasks before plan approval.
- An approved plan can resume into complete, dependency-gated implementation
  tasks.
- Matching imported tasks are reused instead of duplicated.
- The existing worker-reviewer loop remains unchanged after task creation.
- The final task verifies the complete workflow with human approval.
