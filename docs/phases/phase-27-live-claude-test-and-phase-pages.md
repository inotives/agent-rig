# Phase 27: Safe Operations, Live Claude Test, and Phase-Based UI Pages

Status: approved by the human on 2026-10-10, with the safety work added on the
same day (see "Workstream 0"). The planner creates the implementation tasks
from this document.

## Objective

1. Make risky operations safe. A test run in this phase deleted files outside
   the repository. Add guards that do not depend on a person or an agent
   remembering a rule.
2. Test the Phase 26 agent instructions with real Claude agents. Phase 26
   tested the Claude launcher with mocks only.
3. Split the single-page task board into pages, so the UI loads only the data
   of the phase that the user opens.

## Workstream 0: Safe operations

### Why

A worker agent wrote a test that called a cleanup function with the real home
directory as the target. Then it ran a mutation proof: it disabled the guard in
a scratch copy of the script and ran the test. In that copy the repository
check no longer covered the home directory, so the delete ran for real.
Recursive delete is irreversible. The planner had asked for both the test and
the mutation proof in one brief.

### Accepted decisions

- Add a sandbox runner, `.agent-rig/_shared/tools/sandbox-run.sh`. It runs a
  command with macOS `sandbox-exec`. The sandbox denies every file write
  except the paths that the caller allows. It fails closed: if `sandbox-exec`
  is missing, it exits with an error and does not run the command. It refuses
  to allow `/`, the home directory, or a parent of the home directory.
- Run these commands only through the sandbox runner:
  - mutation tests and fault-injection tests;
  - generated scripts and any script that deletes files;
  - real Claude child processes.
- Add safe-operations rules to the worker and reviewer profile templates, to
  the generated instructions, and to the shared context. Update the deployed
  `.agent-rig/` files with `agent-rig profiles update`. The rules:
  - Do not run a command, script, or test that deletes, moves, or overwrites
    files outside the repository and a temporary directory that you created.
  - A test or script that deletes files takes its root directory as a
    parameter. Tests pass a new temporary directory. Tests never use the home
    directory, `/`, or the current directory as the root.
  - Before you delete a path that comes from a variable, check that its real
    path is inside the directory that you created.
  - Run mutation tests with the sandbox runner and with `HOME` set to a
    temporary directory.
  - A reviewer records `changes_requested` for a test or script that deletes
    outside a temporary root that it receives as a parameter.
  - A planner names the sandbox runner in the brief of every task that deletes
    files, runs generated code, or starts a real agent.
- The live test script uses a fixed parent folder under the OS temporary
  directory. It deletes only a direct child of that parent. This is a path rule,
  not a marker file rule. It never accepts a path outside the parent.
- Push the working branch to the remote after each approved task, so that work
  does not exist only on one disk. (The planner asks the human before the first
  push of a branch.)

## Workstream 1: Live Claude loop test

### Accepted decisions

- Run the test in a scratch workspace under the fixed temporary parent folder.
  Create it with `agent-rig init`. Copy the updated profiles into it. Do not
  create test tasks in this repository's workflow store.
- Use `tool = "claude"` for the worker and the reviewer. Run the loop with
  `agent-rig loop --once`, through the sandbox runner. The sandbox allows
  writes to the scratch workspace, the temporary directory, and the folders
  that Claude needs for its own configuration and cache.
- The planner-manager role in the test is played by the planner (the human
  session). The loop shell runs only the worker and the reviewer. The planner
  claims tasks and marks them `done` with `agent-rig tasks ...` commands.
- The scenario has two parts:
  1. A happy path. One task goes from `ready` to a `review` handoff, to an
     `approved` handoff, and then the planner marks it `done`.
  2. A repair cycle. One task has a planted flaw. The harness writes the flawed
     deliverable and a worker handoff. The reviewer must record
     `changes_requested`. The same worker must repair the task. A new review
     must record `approved`.
- Keep the tasks very small, for example a change to one text file with one
  check. Live runs use the Claude usage allowance of the human.
- Infrastructure failures (startup or permission errors) stay covered by the
  mocked tests. Do not force a real authentication failure.
- First run the current launcher once and record exactly what fails. The
  launcher runs `claude -p` with no permission flags. In headless mode, Claude
  denies every tool call that needs permission. The Codex launcher passes
  `--sandbox workspace-write`.
- Fix the launcher with role-scoped permissions:
  - Use `--permission-mode dontAsk`, so a tool call that is not allowed is
    denied without a prompt.
  - Use `--allowedTools` per role. The worker can read, search, edit, and
    write inside the project. The reviewer can read and search, and cannot
    edit or write. Both can run `Bash` only for `agent-rig`, `node`, `npm`,
    and read-only `git` commands.
  - Use `--disallowedTools` for `Bash(rm:*)`, `Bash(sudo:*)`, and other
    commands that delete or change the system.
  - Use `--no-session-persistence` and `--add-dir <workspace>`.
  - Do not use `--dangerously-skip-permissions`.
- Check that Claude follows the instruction contract:
  - the worker records a `review` handoff and does not set `done`;
  - the reviewer records exactly one decision and does not edit the
    implementation;
  - no child agent starts a nested AgentRig loop;
  - handoffs use the canonical vocabulary (`review`, `changes_requested`,
    `approved`, `blocked`);
  - the planner-manager owns task state and dependencies.
- Candidate finding: `agent-rig loop` sends a `review` task whose last handoff is
  `changes_requested` back to the worker by itself, and never selects an
  `in_progress` task. The contract says the planner returns the task to
  `in_progress`. The live test must show which behavior is right. Align the
  contract text and the loop in this phase.
- If the test finds a problem in an instruction file, a template, or the
  launcher, fix it in this phase and add a regression test. If a finding needs
  a design change, pause and discuss it with the human first.
- The live runs need the `claude` command. If it is missing or not logged in,
  the worker stops and records `blocked`.

## Workstream 2: Phase-based UI pages

### Accepted decisions

- The UI has two pages. The landing page lists phases as cards. The phase view
  shows the task flow of one phase. All other behavior stays as it is today:
  the graph, search and filters, Collapse done, the task side panel, and the
  handoff timeline.
- The landing page does not load any task flow. The old "all phases" board is
  removed.
- Keep the existing URLs.
  - `#/` is the landing page.
  - `#/?phase=<phase>` is the phase view. For example `#/?phase=phase-26`.
  - `#/tasks/<id>?phase=<phase>` is the task panel inside its phase view.
  - A task link without `?phase=` loads the task first, reads its phase, and
    then loads the flow of that phase.
- A phase card shows:
  - the phase name;
  - a state badge, `active` (at least one task is not `done`) or `complete`
    (all tasks are `done`);
  - a progress bar and "N of M done";
  - status chips for the non-zero counts (`ready`, `in_progress`, `blocked`,
    `review`, `todo`);
  - the time of the latest update;
  - a Detail button that opens the phase view.
- Card order: phases with open work first, then the other phases. Inside each
  group, newest phase first. The `Unassigned` card is last. It opens at
  `#/?phase=Unassigned`.
- API:
  - New `GET /api/phases` returns one summary per phase: phase, counts by
    status, total, and latest `updated_on`. It sends no task rows.
  - `GET /api/workflow?phase=<phase>` returns the existing response shape,
    filtered to one phase, with `depends_on` for each task.
  - `GET /api/workflow` without `phase` keeps working. The UI does not call it.
  - The task detail and handoff endpoints do not change.
  - The phase filter and the counts use the same phase resolution as the UI
    uses today: the `phase` field, then the phase in the task title, then
    `Unassigned`. Both workflow providers (SQLite and Markdown) support it.
- Dependencies on tasks of other phases:
  - The graph shows only the tasks of the phase.
  - A task with dependencies in other phases shows a small "N external"
    marker.
  - The task panel lists each external dependency with its phase. A click
    opens that task in its own phase view.
- The phase view header has a breadcrumb and a back link, "All phases / Phase
  26", the state badge, and the progress. The phase dropdown is removed.
  Refresh reloads the data of the current page only. The theme toggle stays.
- Each page keeps the last good data and shows a loading skeleton and an error
  with a retry action, as the board does today. Every navigation loads fresh
  data.
- Follow ADR 0007. The landing page is a new page folder under
  `src/ui/pages/`. The existing `task-board` page becomes the phase view. Do
  not add a framework or a new dependency.

## Scope

### In scope

- Workstream 0: the sandbox runner and its tests, the safe-operations rules in
  the templates, the generated instructions, the shared context, and a short
  guide.
- Workstream 1: the scratch workspace and a repeatable test script, the live
  run, role-scoped Claude permissions in the launcher, the loop and contract
  alignment, fixes for findings, regression tests, and a short test report
  under `docs/`.
- Workstream 2: the phase summary and phase filter in the store, the API, the
  contracts, the router, the landing page, the phase view changes, the
  external dependency marker and panel list, tests, and the README screenshot.

### Out of scope

- Infrastructure failure tests with real Claude.
- A `model` setting for agents, or other launcher options.
- A sandbox runner for Linux or Windows. The runner fails closed there.
- Phase titles from the phase documents on the cards.
- Search or filters on the landing page.
- Any write action in the UI.
- Ghost nodes for external dependencies.
- Path-style URLs.

## Implementation slices

Workstream 0:

1. Add the sandbox runner and its tests. Add the safe-operations rules to the
   templates and the generated instructions, and update the deployed files.

Workstream 1:

2. Build the scratch workspace and a repeatable script with hard path rules.
   The script is not part of `npm test`, because it uses the Claude allowance.
3. Run the current launcher once, through the sandbox runner. Record the
   failure.
4. Add role-scoped permissions to the Claude launcher, with tests that check
   the command arguments with a mocked process.
5. Run the live happy path and the live repair cycle. Check the contract.
   Fix the findings, including the loop and contract alignment. Write the test
   report.

Workstream 2:

6. Add the phase summary and the phase filter to both stores, the API, and the
   contracts, with tests.
7. Change the UI core: routing for the landing page and the phase view, and
   per-page data loading.
8. Build the landing page with the phase cards.
9. Change the phase view: breadcrumb header, per-phase loading, the external
   dependency marker and panel list.
10. Update tests, the README text and screenshot, and the changelog.

All workstreams end with a final integrated review.

## Acceptance criteria

Workstream 0:

- The sandbox runner allows writes to the paths that the caller allows and
  denies writes everywhere else. A test proves both, with a decoy folder that
  stands for a home directory. The tests never use the real home directory or
  `/`.
- The runner refuses to allow `/`, the home directory, or a parent of it, and
  it fails closed when `sandbox-exec` is missing.
- The generated worker, reviewer, and planner instructions and the shared
  context contain the safe-operations rules. A test checks this.
- No test or script in the repository uses `homedir()`, `/`, or the current
  directory as a delete target.

Workstream 1:

- A scratch workspace test runs a Claude worker and a Claude reviewer with
  `agent-rig loop --once`, through the sandbox runner.
- The happy path reaches `done` after an `approved` handoff.
- The repair cycle shows `changes_requested`, a repair by the same worker, and
  then `approved`.
- Every check in the contract list passes, with evidence from the handoffs and
  the run folders.
- The Claude launcher uses role-scoped permissions. A reviewer cannot edit
  files. The unit tests check the arguments for each role.
- The contract text and the loop agree about the state after
  `changes_requested`.
- The test report records the failure of the old launcher, the fixes, and the
  results.

Workstream 2:

- The landing page shows one card per phase with the data in the decisions
  above, in the agreed order. It makes no request for tasks.
- The Detail button opens the phase view. The phase view loads only the tasks
  of that phase.
- Old links (`#/?phase=<phase>` and `#/tasks/<id>?phase=<phase>`) still work.
  A task link without a phase works.
- `GET /api/phases` and `GET /api/workflow?phase=` work for both providers.
  `GET /api/workflow` without `phase` still returns all tasks.
- A task with dependencies in other phases shows the marker, and the panel
  lists them with working links.
- The graph, search and filters, Collapse done, the side panel, and the
  timeline work as before in the phase view.
- With 100 or more tasks, the landing page request is small. Add a test that
  checks the response has no task rows.
- Light and dark themes, wide and narrow screens, tests, build, and the human
  browser check pass.

## Open items

- The exact `Bash` allowlist patterns. The worker finds them with the live
  test and records them.
- The paths that Claude needs for its own configuration and cache inside the
  sandbox. The worker finds them with the baseline run and records them.
- A live run can fail because of the usage allowance of the human. If it does,
  the worker records the result and stops. The planner decides when to retry.
