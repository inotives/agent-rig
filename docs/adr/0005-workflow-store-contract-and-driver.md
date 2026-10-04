# ADR 0005: Workflow-store contract and SQLite driver

## Status

Accepted for Phase 16 foundation work.

## Decision

AgentRig exposes a small `WorkflowStore` interface for task lookup/listing,
task creation and updates, dependency lookup, and append-only handoff records.
The interface carries the stable `projectIdentifier`, preserves Markdown bodies,
and leaves parsing, serialization, transactions, and database details to each
provider adapter.

Workspace configuration lives in `.agent-rig/_shared/agent-rig.json`:

```json
{
  "workflow_store": { "provider": "markdown" },
  "project_identifier": "project-name"
}
```

Missing `workflow_store.provider` remains backward-compatible and resolves to
`markdown`. New workspaces write the explicit default. The project identifier
is a lowercase slug of up to 40 characters, initialized from the project
directory and optionally overridden with `agent-rig init --project-identifier`.

## SQLite driver

The planned SQLite adapter will use `better-sqlite3`. It supports the declared
Node.js `>=20` floor and ships native prebuilt binaries for common Node and
platform combinations, while retaining a synchronous API that matches the
current filesystem-first command implementation. The adapter task must still
document source-build requirements for platforms without a prebuilt binary.

`node:sqlite` is not selected because it is not available across the full
Node.js 20 floor. No SQLite adapter is implemented by this foundation task.
