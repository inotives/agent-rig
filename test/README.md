# Test layout

Tests mirror source ownership so each capability can be verified through its
public interface. Cross-capability and packaging checks belong in
`test/integration/`.

```text
test/
├── cli/
├── workspace/
├── profiles/
├── workflow/
├── ui/
│   ├── core/
│   ├── common/
│   └── pages/task-board/
└── integration/                # cross-capability and package checks
```

Node's recursive test discovery and TypeScript's `src/**/*.ts` include cover
the capability layout. Cross-capability and package checks live in
`test/integration/`.

`test/integration/direct-execution.test.mjs` runs deterministic Codex-style
worker and reviewer subprocesses. Each test creates a separate temporary
deployment and diagnostic directory. It uses both workflow providers. It does
not open the project workflow database or start `agent-rig loop`. The fixture
checks the documented Codex arguments, prompt input through stdin, the deployed
workspace, planner-owned transitions, and read-only reviewer behavior. Failure
cases cover nonzero exits, timeouts, missing handoffs, invalid handoffs, and
prompt rejection before launch. Every child has a timeout. The hanging fixture
uses `SIGKILL` so it cannot defer termination.

Run mutation and subprocess tests through
`.agent-rig/_shared/tools/sandbox-run.sh` with a temporary `HOME` and a separate
temporary `TMPDIR`. Allow writes to that `TMPDIR` and to `dist` for builds.
Allow a cache subdirectory of the temporary `HOME` if npm needs it. Do not allow
the real home directory. The runner needs access to the macOS account database;
an outer sandbox can prevent that check. Nested sandbox and UI socket tests can
also fail under the runner. Keep their diagnostics separate from test failures.

These deterministic tests do not establish authenticated live Codex validation.
A live check needs an installed and authenticated Codex CLI with
`--approve-for-me`, an isolated deployment, and a bounded timeout. Follow
`docs/provider-execution.md` and apply the Codex workspace policy directly.
Do not nest its sandbox inside `sandbox-run.sh`. Live Claude and OpenCode
execution is outside Phase 28 coverage.
