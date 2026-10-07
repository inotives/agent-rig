# Phase 20: Capability-Based Source Structure

## Objective

Refactor the AgentRig source tree into maintainable capability-based modules,
with a page-based UI structure that can grow into a multi-page application
without introducing unnecessary module granularity.

## Accepted decisions

- Organize the top-level source tree by capability: CLI, workspace, profiles,
  workflow, and UI.
- Organize the UI internally by page rather than by every individual visual
  feature or technical layer.
- Keep UI application routing, settings, configuration, API, and server code
  in `ui/core/`.
- Keep reusable UI elements and helpers in `ui/common/`.
- Keep the current task board, task detail drawer, task-flow graph, and handoff
  timeline together as the `ui/pages/task-board/` page.
- Add new UI pages as sibling folders under `ui/pages/`.
- Start each page with a small number of files and split only when actual
  maintenance pressure justifies it.
- Preserve current CLI, workflow, read-only UI, and package behavior during the
  structural refactor.
- Update internal imports directly; do not retain permanent compatibility
  re-export shims for the old source paths.
- Migrate from lower-level dependencies to higher-level consumers: workspace
  and profiles, workflow foundations, workflow behavior, CLI commands, UI, and
  finally the CLI dispatcher cleanup.
- Place code in `ui/common/` only when it has at least two real consumers or is
  clearly page-independent; common code must not depend on task-board concepts.
- Move the current UI behavior first as one `pages/task-board/` page; extract
  only the UI core and proven common code at that boundary.
- Keep the workflow capability split at the responsibility level: model,
  store interface, Markdown adapter, SQLite adapter, commands, loop,
  migration, and safety.
- Keep dependencies one-way: CLI may compose capabilities, UI core may adapt
  workflow data for read-only API responses, UI pages consume UI contracts, and
  workflow never imports UI.
- Keep UI API DTO contracts separate from workflow domain models; map workflow
  records at the UI core/API seam.
- Mirror the capability structure under `test/`, keeping cross-capability and
  packaging checks in an integration area; move tests only when ownership is
  clear.
- Split implementation into independently reviewed capability tasks and
  matching commits; each slice must preserve behavior and remain buildable.

## Scope

### In scope

- Define stable capability seams and ownership rules.
- Move existing source modules behind those seams without behavior changes.
- Separate UI core, common UI code, and page-specific code.
- Preserve existing public CLI entrypoints and workflow-store interfaces.
- Update tests and import paths to follow the new structure.

### Out of scope

- New user-facing capabilities.
- React or another frontend framework.
- A rewrite of the workflow-store contract.
- Splitting the task-board page into task-detail or handoff sub-pages.

## Open decisions

None.

## Implementation task shape

1. Establish source and test folder conventions.
2. Refactor workspace and profiles.
3. Refactor workflow store and provider adapters.
4. Refactor workflow commands, lifecycle, loop, migration, and safety.
5. Refactor CLI dispatch and command wiring.
6. Refactor UI core, DTO contracts, common code, and the task-board page.
7. Run integrated review and package verification.

Each task is behavior-preserving, independently reviewed, and committed at
its capability boundary.

## Acceptance criteria

- Source ownership is clear from the directory structure.
- Existing CLI commands and read-only UI behavior remain unchanged.
- UI page code can be extended with sibling pages without moving core code.
- Tests cover each extracted capability through its public interface.
- Build, full test suite, package dry-run, and human UI review pass.
