# ADR 0007: Use Page-Based UI Capabilities

## Status

Accepted for Phase 20.

## Decision

Organize the UI as a small core, a common reusable area, and page folders.
The current task board remains one page containing its board, task detail
drawer, task-flow graph, and handoff timeline. Future pages are added as
sibling folders under `ui/pages/`.

## Rationale

Splitting every UI behavior into a separate capability would create excessive
module boundaries and increase maintenance cost. A page-based vertical slice
keeps related design and behavior together while still allowing the UI to grow
into a multi-page application. Core routing and infrastructure remain stable,
and common components are shared only when they have more than one real
consumer.

## Consequences

- The task-board page owns its internal feature composition.
- `ui/core/` owns routing, settings, configuration, API, and server concerns.
- `ui/common/` owns genuinely reusable UI components and helpers.
- Page extraction can happen incrementally without a framework migration.
- Some page modules may remain larger until real reuse or maintenance pressure
  justifies further decomposition.
- Internal imports will be updated directly; old source paths will not be
  preserved as permanent compatibility shims.
- UI pages consume read-only DTOs from the UI core/API seam rather than
  importing workflow domain models.
