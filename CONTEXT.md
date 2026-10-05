# AgentRig Domain Context

## Workflow Store

The workflow store is the canonical persistence boundary for AgentRig tasks
and worker-reviewer handoffs. It is selected per workspace and owns both
structured lifecycle state and rich record content.

## Canonical Store

The canonical store is the one authoritative source that AgentRig reads and
writes for live workflow state. A workspace has one canonical workflow store
at a time; historical exports are not live records.

## Historical Markdown

Historical Markdown is an earlier workflow representation retained for human
reference or rollback. After migration it is not read as live state, although
it may receive explicit migration markers.

## Custom Metadata

Custom metadata is a JSON object attached to a workflow record for fields that
are not part of the indexed core model. Its shape is portable across storage
providers; a provider may choose an appropriate native representation.

## Project Identifier

The project identifier is a stable slug that identifies the AgentRig workspace
that owns a workflow record. It remains attached to tasks and handoffs when
those records are exported or moved to another provider.

## Phase

A phase is an optional planning grouping for workflow tasks. It identifies the
implementation or delivery phase a task belongs to and is distinct from the
task's lifecycle status. Existing records may be displayed using a legacy
title or filename fallback until an explicit phase is assigned.
