# ADR 0008: Use better-sqlite3 13 and require Node.js 22 or newer

## Status

Accepted for Phase 24.

## Decision

Change the `better-sqlite3` dependency from `^11.10.0` to `^13.0.3`. Change the
`engines.node` field from `>=20` to `>=22`. Update the Node.js version in
`README.md`.

## Cause

`better-sqlite3` 11.10.0 has no prebuilt binary for Node.js 24. The install
step compiles the addon with `node-gyp`. On Node.js v24.20.0, the compiled
addon aborts the process when V8 garbage collection frees a `Statement`:

```text
Assertion failed: (env) != nullptr
node::RemoveEnvironmentCleanupHook ... at ../src/api/hooks.cc:142
```

The stack goes through `Statement::~Statement` in `better_sqlite3.node`. Calls
to `SQLiteWorkflowStore.close()` do not prevent it, because the code creates
prepared statements without a reference and the garbage collector frees them
later. Effects: `agent-rig ui` dies on the first API request, the CLI can abort
at exit or before it saves, and `test/ui/core/api.test.mjs` fails.

The crash depends on how the addon was built, not on the SQLite code in this
repository. Addons built with `node-gyp` against the Node.js 24 headers crash.
Prebuilt binaries and N-API binaries do not crash.

A second effect: npm 12 blocks dependency install scripts that `allowScripts`
does not approve. With npm 12, `npm ci` does not build or download any binary
for `better-sqlite3` 11 or 12, so the package fails at the first use.

## Evidence

Test setup: Node.js v24.20.0, npm 12.0.2, macOS arm64. The repro script creates
a `SQLiteWorkflowStore`, reads tasks, closes the store, allocates 2 million
objects, and waits. It runs in a scratch directory against a copy of the
workflow database. A run "crashes" when the process exits with a non-zero
status.

| Version | Binary on Node 24 | Repro crashes | Notes |
| --- | --- | --- | --- |
| 11.10.0 | compiled with `node-gyp` (no prebuilt) | 12 of 12 | `agent-rig ui` died on the first request. The UI tests ended with a native assertion. |
| 12.0.0 | compiled (no prebuilt; the Node 24 prebuilt target came in 12.1.0) | 12 of 12 | Same assertion. |
| 12.1.0, 12.2.0, 12.3.0, 12.4.1, 12.4.6, 12.8.0, 12.10.1 | prebuilt download | 0 of 10 each | Install takes 1 to 2 seconds. |
| 12.11.1 | prebuilt download | 0 of 12 | The UI and the UI tests pass. |
| 12.11.1 compiled with `node-gyp` | compiled (12 seconds) | 10 of 10 | This shows the cause: the build method matters, not the version. |
| 13.0.3 | prebuilt binary in the npm package (`prebuilds/`), N-API | 0 of 12 | No install script. Needs Node.js 22 or newer. |

Checks for 13.0.3 on the repository copy:

- `npm ci` takes about 1 second and needs no compiler, no download, and no
  install script. The lock file loses 35 transitive packages
  (`prebuild-install`, `bindings`, `tar-fs`, `node-abi`, and others) and gains
  `node-addon-api`.
- `node --test $(find test/ui -name '*.test.mjs')`: 73 of 73 pass, in 6 runs in
  a row, with no native crash. The same command on 11.10.0 ends with the native
  assertion.
- `node dist/index.js ui --port <port>`: 20 pairs of requests to
  `/api/workflow` and `/api/tasks/<id>` return 200 and the server stays alive.
  On 11.10.0 the server aborts on the first request.
- `node dist/index.js tasks`, `tasks show`, `tasks next`, and `tasks handoff`
  (on a copy of the database) exit with status 0 in 10 of 10 runs.
- `npm pack --dry-run` lists `dist/index.js`.

`better-sqlite3` 13.0.0 changed the addon to N-API and moved the prebuilt
binaries into the npm package. The 13.x series supports Node.js 22 and newer.
The prebuilt binaries cover macOS (arm64, x64), Linux (glibc and musl; arm64,
x64), and Windows (arm64, x64).

## Options

1. Stay on 11.10.0 and close statements explicitly. Not chosen. The store
   already has `close()`. The crash comes from statements that the garbage
   collector frees later. A fix needs a cache for all prepared statements and
   an explicit finalize step in every command. This adds code for a defect
   that a dependency version removes. The compiled build would also stay a
   requirement.
2. Use `^12.11.1`. It works on Node.js 20 to 26 and keeps the Node.js 20 range.
   Not chosen. It downloads the prebuilt binary during install, so npm 12 needs
   `allowScripts` approval. A project-level `allowScripts` entry does not reach
   users who install the package. Without the approval, the binary is missing.
   Users without network access to GitHub compile the addon and get the crash.
3. Use `^13.0.3`. Chosen. The package includes the binaries, there is no
   install script, and it works with npm 12.

## Consequences

- Supported Node.js range: 22 or newer (tested on v24.20.0). Node.js 20 is end
  of life, and `better-sqlite3` 13 does not support it.
- Users on Node.js 20 must stay on `@inotives/agent-rig` 0.1.7 or upgrade
  Node.js. `npm` shows an engine warning on Node.js 20.
- The SQLite API that the store uses did not change. No source change was
  needed in `src/workflow/`.
- Do not compile `better-sqlite3` 11 or 12 against Node.js 24 headers.
  Compiled builds crash in this environment.
- npm 12 still lists `better-sqlite3@13.0.3` as "install: node-gyp rebuild" in
  its blocked-scripts warning. The package has no install script and includes
  prebuilt N-API binaries. If you approve the script and run `npm rebuild`, the
  prebuilt binary still loads (0 of 5 crashes). You can ignore the warning.
- `test/ui/core/server.test.mjs` had a second, separate problem: a fixed
  50-tick wait for the Refresh step. The wait now polls up to 2 seconds. The
  next assertion still reports a real failure.
