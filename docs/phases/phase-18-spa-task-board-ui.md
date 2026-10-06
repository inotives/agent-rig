# Phase 18: SPA Task Board UI

## Goal

Revamp the Phase 17 read-only task board into a single-page application that
shows task dependencies as a visual flow and keeps the selected task details
in the same page layout.

## Reference Layout

The visual baseline is:

- Header with title, subtitle, phase selector, manual refresh button, and theme
  toggle.
- Top task-flow canvas with task cards connected by dependency arrows.
- Task hover or selection popover with a compact task summary.
- Task details section below the canvas.
- Bottom split view with rendered task Markdown on the left and a searchable
  handoff table on the right.
- Handoff details open in a popup modal from each table row's detail button.

Reference image:

`docs/_images/Screenshot 2026-10-06 at 7.28.59 AM.png`

## Initial Decisions

- The UI remains read-only; task and handoff mutations stay in the CLI.
- The task-flow canvas uses a native SVG graph unless grilling establishes a
  stronger need for a graph dependency.
- The graph uses a deterministic left-to-right layered layout. Disconnected
  groups render in separate rows; cyclic tasks render in a fallback row with a
  visible warning.
- Task status is represented by a colored left rail and a visible status label:
  `todo` slate, `ready` blue, `in_progress` amber, `blocked` red, `review`
  violet, and `done` green.
- Hover shows a compact task preview popover; click selects the task and
  updates the detail panels. On touch devices, tap selects the task.
- The canvas provides Fit to view, zoom in, and zoom out controls. Small
  screens use horizontal scrolling; users cannot drag task cards to alter the
  deterministic layout.
- Manual `Refresh` remains the only refresh action; automatic polling is not
  used because it disrupts users reading task or handoff details.
- Handoff details open in a modal containing sequence, timestamp, sender,
  recipient, status, rendered content, and metadata where available.
- Handoff modals close with a close button, `Escape`, or backdrop click, and
  return focus to the triggering Detail button.
- The board route is `#/`; selected tasks use `#/tasks/<task-id>`. Browser
  back/forward navigates between task selections, while handoff details remain
  modal state inside the task route.
- Before a task is selected, the detail area shows “Select a task to view
  details” and does not display unrelated task data.
- Status rails do not require icons initially; visible status text remains the
  accessible non-color indicator.
- The SPA continues to use the active provider-neutral read-only API.

## Acceptance Checks

- Native SVG dependency graph renders real SQLite task data.
- Status colors, labels, arrows, hover preview, click selection, and detail
  panels work.
- Hash navigation supports browser back and forward.
- Fit-to-view, zoom controls, deterministic fallback layout, and responsive
  horizontal scrolling work.
- Handoff modal supports close button, backdrop click, `Escape`, and focus
  return.
- Manual refresh preserves the selected task and scroll position.
- Light and dark themes remain readable.
- `npm run build`, focused tests, package dry-run, and human browser review
  pass.
- The existing `agent-rig ui` command and packaging model remain unchanged.

## Implementation Notes

Implementation tasks may now be created from this approved plan.
