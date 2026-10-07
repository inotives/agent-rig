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

## UI Component Layer

The UI component layer provides semantic controls and surfaces for the
read-only task board. It is locally bundled with the AgentRig package so the
UI remains usable without a runtime network dependency.

## Task Flow Graph

The task flow graph is a read-only native SVG view of task dependencies. Its
layout is deterministic and separate from the UI component layer; graph
libraries are deferred until the current layout cannot represent real project
workflows.

## UI Page

A UI page is a coherent navigable read-only application surface. The current
task-board page includes its task-flow canvas, task detail drawer, previews, and
handoff timeline; future pages are sibling surfaces rather than separate
modules for every visual element.

## UI DTO

A UI DTO is the read-only data shape crossing the UI API seam into browser
code. It is adapted from workflow records and is not the workflow domain
model.

## GitHub Issue Request

A GitHub Issue Request is one GitHub Issue selected as the input for a
planning run. It is an external request, not an implementation task.

## Planning Run

A planning run is the controlled workflow that converts one GitHub Issue
Request into reviewed planning documents. It ends when the human approves or
rejects the plan.

## Planning Branch

A planning branch is the issue-specific Git branch that contains the planning
documents for one planning run. It is separate from the later implementation
branch unless the workflow explicitly joins them.

## Plan Approval

Plan approval is the explicit human decision that allows a planning run to
create implementation tasks. Without approval, the implementation loop must
not start.
