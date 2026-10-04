# SQLite Is Canonical After Workflow Migration

## Status

Accepted

## Context

AgentRig currently stores tasks and worker-reviewer handoffs as Markdown files.
This is easy to inspect and edit, but filesystem scans and file-level mutation
become less suitable as the workflow grows.

The project may add SQLite now and another database provider later. Keeping two
live copies of task and handoff state would introduce reconciliation and
concurrency problems.

## Decision

An explicit workflow migration changes the workspace to SQLite as its sole
canonical store for tasks and handoffs. After migration, AgentRig performs no
ongoing dual writes to the original Markdown files.

The original Markdown records remain as historical reference or rollback
material. Their task content and lifecycle state are preserved, and migration
adds explicit metadata marking them as migrated. They are not read as live
workflow state after the migration.

Migration is tolerant of older manually managed workspaces whose tasks have
zero or one recorded handoff. Those records are imported without fabricated
handoffs or reply links, retain their historical lifecycle status, and receive
an explicit incomplete-handoff-trail marker and imported handoff count in
SQLite metadata. The two-handoff requirement applies to new completion
decisions; only the documented human administrative override can bypass it.

Handoffs discovered after SQLite has accepted newer records append at the next
sequence. Their original source timestamp and filename remain in metadata;
`source_order_conflict: true` marks an older source timestamp that conflicts
with the stored sequence. Existing sequences are never rewritten. Completion
requires a subsequent ordered work/review pair.

## Consequences

- Task state and handoff creation can be coordinated by one transactional
  store.
- The active storage adapter must be selected at the workspace level.
- Existing Markdown paths cannot remain the only interface exposed to agents;
  prompts and commands need backend-neutral task references.
- Migration and export tooling must make the loss of live Markdown authority
  explicit and recoverable.
- Legacy history may be incomplete, so migration diagnostics and task
  inspection must distinguish an imported incomplete trail from a valid new
  work-review completion.
- Future providers can implement the same workflow-store contract without
  changing command and loop behavior.
