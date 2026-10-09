# Phase 25: Handoff Timeline Redesign

## Objective

Make the handoff timeline in the task details easier to read and more lively.
The timeline stays read-only and uses CSS only for motion.

## Accepted decisions

- Use rich cards with subtle motion. (Chosen by the human from three options.
  The two other options were visual polish only, and expand in place.)
- Each entry shows:
  - a node in the color of the handoff status, with DaisyUI theme tokens (the
    hard-coded `bg-blue-500` goes away);
  - the sender and the recipient as small role chips with an arrow between
    them;
  - the status as a badge;
  - a preview of the handoff message, limited to 2 lines;
  - a relative time, for example "2 hours ago". The full date is in the
    `title` attribute.
- The full message stays in the existing handoff modal. Do not change the
  modal, its focus behavior, or the search.
- Motion uses CSS only. Do not add an animation library.
  - The rail draws in from top to bottom.
  - Entries fade and slide in one after another (staggered).
  - The nodes pop in.
  - A card lifts slightly on hover and on keyboard focus.
  - The newest entry has a soft pulse.
  - Entries that come from a search animate in.
- All motion stops when `prefers-reduced-motion` is set.
- The timeline must work in the narrow side panel (28rem) and in the narrow
  modal drawer. Light and dark themes must both work.

## Scope

### In scope

- Layout and style of `renderHandoffTimeline` in
  `src/ui/pages/task-board/index.ts` and the CSS it needs.
- Relative time formatting, with tests.
- Status-to-color mapping for handoff statuses, with tests.
- Motion classes and keyframes, and the reduced-motion rule.

### Out of scope

- Expand-in-place for the full message.
- Changes to the handoff modal, the API, or the data.
- Any write action from the UI.

## Acceptance criteria

- Each entry shows a status-colored node, sender and recipient chips, a status
  badge, a 2-line message preview, and a relative time with the full date in
  the `title` attribute.
- No hard-coded blue color remains in the timeline.
- Motion works as described. With `prefers-reduced-motion`, nothing moves.
- Search, the modal, keyboard use, and focus behavior still work.
- The timeline looks right in the 28rem side panel and on narrow screens, in
  light and dark themes.
- Tests, build, and human browser review pass.

## Open items

- Handoff status values may include more than the colors cover. The worker
  must list all statuses that exist in the workflow store and map each one,
  with a neutral color for an unknown status.
