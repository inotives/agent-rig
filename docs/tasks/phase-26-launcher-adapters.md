# Task: Add profile-based Codex, OpenCode, and Claude launchers

## Context

The loop currently supports only some configured tools even though deployed
profiles can name other tools. The workflow instructions must remain
agent-agnostic.

## Goal

Select a child launcher from the profile tool and provide a tested adapter for
Codex, OpenCode, and Claude.

## Scope

- Child process launch code.
- Profile tool dispatch.
- Command construction and unsupported-tool errors.
- Mocked launcher tests.

Live Claude execution is out of scope because Claude is not installed in the
current environment.

## Planner Notes

- Do not infer the tool from the role name.
- Do not pass tool-specific assumptions into role instructions.
- Keep live Claude smoke testing deferred to the next phase.

## Implementation Plan

1. Define the smallest launcher interface needed by the loop.
2. Adapt Codex and OpenCode to that interface without changing their current
   defaults.
3. Add the Claude command adapter.
4. Return a clear error for an unsupported profile tool before task mutation.
5. Test command construction with mocked executables.

## Acceptance Criteria

- [ ] The profile tool selects the launcher.
- [ ] Codex and OpenCode existing behavior remains covered by tests.
- [ ] Claude command construction passes mocked tests.
- [ ] Unsupported tools fail clearly before changing task state.
- [ ] No live Claude test is claimed.
