# Project Context

Project: @inotives/agent-rig
Type: Node.js project

README: ./README.md
# AgentRig Coordination Contract

The `planner` profile is the planner-manager. It works with the human, owns
the approved plan, selects tasks, manages dependencies, and controls task
state. The profile token and handoff recipient remain `planner`.

Task states are exactly:

- `ready`: eligible for worker selection.
- `in_progress`: the assigned worker is implementing or repairing the task.
- `review`: the worker handoff is ready for independent review.
- `blocked`: a real blocker prevents progress.
- `done`: the planner-manager accepted an approved review.

The worker implements the assigned task, verifies it, and writes a handoff with
decision `review`. The reviewer independently checks the worker handoff and
changed files. The reviewer writes exactly one handoff decision:
`approved`, `changes_requested`, or `blocked`. The reviewer does not change
task state or dependencies.

The planner-manager records the handoff decision and changes task state. For
`changes_requested`, it returns the same task to `in_progress`, sends the
findings to the same worker, and routes the repair through independent review
again. For `approved`, it marks the task `done` and unblocks only the next
selected dependent task. The planner-manager directly performs the final
integrated review. If it finds a problem, it routes the `changes_requested`
repair through the same worker and independent reviewer cycle, then repeats the
integrated review. The planner-manager owns final phase acceptance.

Child agents do not start nested AgentRig loops. In SQLite mode, mutate tasks
and handoffs only through the project-local `agent-rig tasks ...` CLI. Migrated
task and handoff Markdown is historical reference only.
