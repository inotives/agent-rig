# Phase 16: Pluggable Workflow Storage

## Goal

Allow AgentRig task and work-review handoff records to use a selectable
workflow store while preserving Markdown as the default for new workspaces.

## Current Status

This workspace has been migrated to SQLite. Its original Markdown task and
handoff records are marked historical. Integrated review was approved in
task-0026; Markdown remains the default for new workspaces.

## Planned Delivery Shape

The implementation should be split into independently reviewed slices:

1. Define the workflow-store contract, workspace provider configuration, and
   project identifier validation.
2. Implement the Markdown adapter behind the contract without changing the
   default behavior.
3. Implement the SQLite schema, adapter, transactions, metadata counter, and
   task/handoff integrity rules.
4. Route task commands, loop selection, prompts, status, and inspection through
   the active store.
5. Implement validated Markdown-to-SQLite migration, fail-closed reruns, and
   historical migration markers without switching this planning workspace
   early.
6. Add focused adapter, migration, loop, handoff, and compatibility tests;
   then perform the full end-to-end migration using this workspace's actual
   `.agent-rig/_shared/tasks/` and `.agent-rig/_shared/handoff_logs/` records.
7. Run the final integrated review against the migrated SQLite-backed
   workspace.

All implementation and task/review work remains on the Markdown provider until
the final migration acceptance task. Only the first dependency-free foundation
slice should initially be `ready`; later slices remain `blocked` until their
selected predecessor has passed an independent reviewer.

If implementation or review exposes a storage limitation, runtime constraint,
migration edge case, or other finding that changes this delivery shape, pause
the affected task graph and return to planner/human discussion. Update this
phase document and any relevant ADR before adding or revising implementation
tasks. Downstream work remains `blocked` until the revised predecessor plan is
accepted and reviewed.

## Documentation Boundary

Phase plans, implementation plans, ADRs, glossaries, and acceptance criteria
remain canonical repository documents under `docs/`. The workflow store does
not migrate or replace them. SQLite stores only live operational task state
and worker/reviewer handoff conversations that reference those documents.

## Acceptance Criteria

- New workspaces default to the Markdown workflow store and receive the shared
  planning/worker/reviewer workflow guidance.
- The active provider and stable project identifier are validated from workspace
  configuration; task IDs remain project-scoped and human-readable.
- Markdown and SQLite implement the same backend-neutral workflow-store
  contract.
- SQLite preserves task frontmatter, opaque task bodies, handoff messages,
  custom metadata JSON, dependencies, chronological handoff order, and source
  filename metadata for migrated records.
- Task lifecycle updates and corresponding handoff inserts are transactional;
  handoffs are append-only and task completion validates the configured
  work/review handoff trail.
- Legacy tasks with zero or one recorded handoff migrate without fabricated
  history, retain their historical status, and are marked as incomplete trails;
  the normal new-completion path still requires the configured work/review
  handoffs.
- Existing task, loop, status, prompt, and inspection commands work through
  either provider without exposing SQLite files or SQL to agents.
- `agent-rig workflow migrate --to sqlite` validates before import, refuses
  unsafe reruns/overwrites, switches configuration only after verification, and
  marks historical Markdown records afterward.
- Planning documents under `docs/` remain outside workflow migration.
- Focused adapter, migration, handoff-chain, compatibility, and full-suite
  tests pass, including `npm test` and `git diff --check`.
- The final acceptance task migrates this workspace's real Phase 16 tasks and
  handoffs, then verifies task listing, inspection, status, next-task selection,
  and the remaining integrated review through SQLite.

The final migration is intentionally one-way for the active workspace:
`.agent-rig/_shared/workflow.sqlite` becomes authoritative, while the source
Markdown records remain as marked historical reference. Agents continue to use
the `agent-rig tasks ...` interface; they do not edit the database directly.

## Accepted Decisions

### SQLite Becomes Canonical After Migration

An explicit migration changes the workspace's canonical workflow store from
Markdown to SQLite. SQLite then owns task and handoff state; AgentRig does not
perform ongoing dual writes to Markdown.

Existing Markdown task and handoff files remain available as historical
reference or rollback material. After a successful migration they are marked
as migrated and are no longer live records.

### Provider Is Selected In Workspace Configuration

The active workflow-store provider is configured in
`.agent-rig/_shared/agent-rig.json`:

```json
{
  "workflow_store": {
    "provider": "markdown"
  }
}
```

`markdown` is the default. SQLite uses a workspace-default database path;
provider-specific path configuration is deferred until a concrete need exists.

### Migration Is Non-Destructive And Config-Last

Migration validates the Markdown source, imports into a newly built SQLite
database, verifies the imported records, and only then switches the workspace
provider to SQLite. The original Markdown task and handoff content and
lifecycle state are preserved; migration metadata may then be added to mark
them as historical. Any failure before the provider switch leaves Markdown
configured as the live store.

Migration is exposed as:

```bash
agent-rig workflow migrate --to sqlite
```

It validates before import, refuses to overwrite an existing SQLite target,
and fails closed on reruns when the target already exists. If the workspace is
already configured for SQLite, it reports that migration is complete.

### Migrated Markdown Keeps Task State And Gains A Storage Marker

Migration does not replace the task lifecycle `status` field. It adds explicit
storage metadata such as `storage_status: migrated`, the destination provider,
and the migration timestamp. This distinguishes historical storage state from
workflow state such as `review`, `blocked`, or `done`. Both migrated tasks and
migrated handoffs receive the marker fields:

```yaml
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T00:00:00Z
```

The timestamp is recorded as ISO-8601 UTC.

Markers are added after the SQLite provider switch using safe per-file
replacement. Marker-write failures are reported and do not roll back the
SQLite provider, because the Markdown files are historical at that point.

### Preserve Rich Content And Extensible Metadata

The workflow-store contract preserves task bodies and handoff messages as
Markdown text. It also exposes indexed structured fields needed by current
commands and loop selection, plus a JSON object for custom or future metadata.

SQLite stores that metadata as serialized JSON. Future relational adapters may
map the same contract to a native JSON type such as PostgreSQL `JSONB`.

### Agent Mutations Go Through AgentRig

Agents must use the AgentRig task interface for task mutations. They must not
edit the SQLite database file directly. The storage adapter owns persistence
and transaction behavior, while the loop owns the atomic task-transition and
handoff commit.

### Existing Task Commands Remain Backend-Neutral

The existing `agent-rig tasks ...` commands remain the agent-facing mutation
interface. They route through the active workflow store and do not expose
SQLite-specific commands or SQL. The loop records handoffs automatically;
manual runs can record one through `agent-rig tasks handoff`.

### Records Carry A Stable Project Identifier

The workspace has a stable `project_identifier`, represented as a validated
slug such as `project-name-slug`. It is configured at workspace level and
copied into each task and handoff record so exported or future shared-store
records remain attributable to their originating project. It is not recomputed
from the current directory during reads.

The identifier is initialized from the project directory name by default and
may be explicitly overridden during initialization. It must pass slug
validation and is not silently changed later. Migration requires a valid
identifier before importing records.

Task IDs remain human-readable and project-scoped, such as `task-0001`.
Storage keys use `(project_identifier, task_id)` so the same task ID may exist
in different projects without collision.

### Use A Minimal Normalized SQLite Schema

SQLite normalizes only fields required by current commands and loop queries:

- `tasks` stores indexed lifecycle fields, project identifier, task body
  Markdown, and custom metadata JSON.
- `task_dependencies` stores one row per dependency.
- `handoffs` stores task/project identity, handoff sequence, sender/recipient
  metadata, status, message Markdown, and timestamps.

Indexes cover project identity, task status, assignee, dependency lookup, and
handoff recency. A separate event-sourcing or history model is deferred.

The proposed core tables are:

- `tasks`: project identifier, task identity, indexed lifecycle fields,
  timestamps, body Markdown, and custom metadata JSON.
- `task_dependencies`: one row per task dependency.
- `handoffs`: project/task identity, handoff sequence, sender/recipient
  metadata, status, message Markdown, timestamps, and custom metadata JSON.
- `store_metadata`: provider-owned key/value JSON for persistence parameters
  such as the next task ID counter and schema version.

Task lookup, status/assignee selection, dependency lookup, and handoff
recency receive indexes. Task lifecycle updates and the corresponding handoff
insert commit in one transaction.

SQLite task creation increments the task ID counter transactionally so the
existing human-readable `task-0001` format remains safe under concurrent
creators. The key/value table is not a general application configuration
store.

### Commands Depend On A Small Workflow-Store Contract

Commands, loop selection, status reporting, migration, and prompts depend on a
small `WorkflowStore` contract. Markdown and SQLite implement that contract;
provider-specific parsing, serialization, transactions, and database details
remain inside the adapters. PostgreSQL implementation and generic ORM/query
builder layers are deferred.

### Handoffs Are An Append-Only Bidirectional Task Conversation

Handoffs are immutable records in a task conversation. A worker handoff can be
followed by a reviewer handoff requesting fixes, then another worker handoff,
and so on until acceptance or blocking.

Each handoff preserves creation time, has a monotonic sequence within its
project and task, records sender and intended recipient roles, and may link to
the handoff it answers. Migration preserves the original Markdown filename in
metadata and uses its timestamp plus filename as a deterministic ordering
tie-breaker. It does not invent reply links when the Markdown source cannot
prove them.

If a handoff written before migration is discovered only after SQLite has
accepted newer handoffs, import it at the next sequence without changing
existing sequences. Preserve its source filename and source timestamp in
metadata. When that timestamp predates the preceding SQLite handoff, set
`source_order_conflict: true` on the late arrival and show the discrepancy in
handoff inspection. The sequence is the live conversation order; the source
timestamp remains audit history. Normal completion still needs a later,
ordered work-producing handoff followed by an independent review handoff.

### Completed Loop Tasks Require A Two-Way Handoff Trail

A task completed through a linear work-review loop must have an ordered pair
of handoffs from the work-producing role followed by the independent review
role. In a new conversation these are sequences 1 and 2. Later fixes and
re-reviews continue the same conversation; completion checks its latest pair.
A missing pair is an integrity failure, not a valid completed loop task.

This rule applies to new completion decisions, not to importing old Markdown
history. Migration accepts legacy tasks with zero or one handoff because older
manual worker-reviewer flows may not have recorded handoffs. Such tasks retain
their historical lifecycle status, but SQLite records an explicit incomplete
handoff-trail marker and the imported handoff count. They cannot be newly
completed through the normal path until the required work/review trail exists;
an explicit human administrative override remains available for historical or
exceptional cases.

The configured loop participants determine the concrete work and review roles.
A designer/planner loop and a worker/reviewer loop therefore use the same
storage contract without introducing a separate workflow-stage field.

A separate workflow-stage field is deferred until a real workflow requires an
agent to participate in multiple stages that cannot be represented by the
configured participants.

### Prompts Use Task Identity And The AgentRig Interface

Loop prompts identify work by project identifier and task ID, include the task
body as context, and direct agents to use `agent-rig tasks ...` commands for
mutations. A Markdown file path is not treated as the canonical task identity,
so SQLite-backed prompts remain valid without a task file.

### Preserve Task Records Without Section-Specific Normalization

Migration keeps the full task body as opaque Markdown. Known frontmatter fields
become indexed task columns; unknown or future frontmatter remains in
`metadata_json`. Sections such as `Blockers`, `Acceptance Criteria`, and
`Planner Notes` are not split into separate tables in this phase.

### Task Inspection Remains Backend-Neutral

`agent-rig tasks show <task-id>` renders the active store's task as Markdown.
The Markdown adapter returns the original representation; the SQLite adapter
reconstructs frontmatter from indexed fields and `metadata_json`, followed by
the stored task body. Commands do not require users or agents to know the
active provider.

### SQLite Listings Use Logical Record Identity

SQLite-backed task and handoff listings use task IDs, handoff IDs, sequence
numbers, timestamps, and sender/recipient roles. They do not fabricate
filesystem paths for database rows. Migrated records may expose their original
Markdown filename as historical metadata.

### Run Artifacts Are Outside Workflow Storage

Migration covers tasks and handoffs only. Run directories, prompts, last
messages, and result JSON remain filesystem diagnostics and are not recreated
as SQLite tables. Any existing run ID is optional opaque metadata, not a
workflow-store identity or foreign key.

## Open Decisions

- Select and validate the SQLite driver while preserving Node.js `>=20`.
- Define exact compatibility details for reconstructed `tasks show` output.
- Add implementation and migration acceptance tests.

Deferred:

- PostgreSQL adapter implementation.
- Separate workflow-stage fields.
- Run-artifact migration or an agent-harness database.
- Event-sourcing/history tables.
- Broad export and storage-management commands.
- Migration of planning or implementation documents from `docs/`.
