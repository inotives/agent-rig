# CodeGraph Guidance for Worker and Reviewer Context Cost

## Purpose

Workers and reviewers start in fresh sessions. They do not retain the planner's
conversation or another agent's code understanding. Repeated repository scans
can increase context use and execution cost.

Use the available code-understanding tools to reduce repeated work. Keep source
inspection and focused checks as required verification steps.

## Current Tools

- `codegraph_explore` finds relevant symbols, call paths, and affected files.
- `codegraph_node` reads one indexed file or symbol and shows callers and
  callees.
- `context-mode` processes large files, logs, test output, and other data
  without returning all raw content to the model context.
- `git diff` shows the current implementation change. Reviewers receive the
  current diff in the generated prompt.
- `rg` performs focused text searches when the required term or file is known.
- `agent-rig tasks show <task-id>` returns the task contract and acceptance
  criteria.

The project-local executable tool currently provided to both roles is
`.agent-rig/_shared/tools/sandbox-run.sh`. It provides safety isolation. It is
not a code-understanding tool.

## Recommended Investigation Order

1. Read the task brief, acceptance criteria, and latest relevant handoff.
2. Use `codegraph_explore` for the task's main symbols or implementation flow.
3. Use `codegraph_node` for the exact files or symbols that require detail.
4. Use focused `rg` searches for names, configuration keys, or test cases that
   CodeGraph does not expose clearly.
5. Use `context-mode` for large files, logs, test output, or generated data.
6. Run the focused checks required by the task.

Do not scan the whole repository unless the task or CodeGraph results show that
the change crosses broad boundaries.

## CodeGraph Freshness

CodeGraph uses a file watcher. The watcher reparses changed files and updates
the symbol and dependency graph in `.codegraph/codegraph.db`. The index can
lag filesystem changes by about one second.

CodeGraph is not Git-aware. It observes committed and uncommitted filesystem
changes. If a tool reports that a referenced file is stale, inspect that file
from the working tree and do not rely on the old graph result. After an edit,
query CodeGraph again when the updated dependency graph matters.

## Cost Boundaries

The generated child prompt already includes role instructions, shared context,
the task brief, and relevant handoffs. It also includes the review diff for a
reviewer. These inputs are repeated because each child starts fresh.

CodeGraph can reduce additional source-reading work, but it does not remove the
need to inspect changed files and run tests. Structural indexing is not proof of
correct behavior.

There is currently no automatic task-context packet that precomputes relevant
files, symbols, callers, and tests for each task. Such a packet would be a
future optimization. It should supplement source inspection, not replace it.

## Role Guidance

Workers should use CodeGraph to locate the implementation and its callers
before making a scoped change. They should record useful file and symbol
references in the worker handoff.

Reviewers should use the supplied diff first, then use CodeGraph to inspect the
changed symbols, callers, tests, and nearby behavior independently. They should
use `context-mode` when test or build output is large.

This note is advisory. It does not change workflow ownership, handoff rules,
prompt contents, or task-state permissions.
