# Source layout

The source tree is organized by capability. This is the ownership boundary
for later Phase 20 slices; existing flat modules remain in place until their
assigned slice moves them.

```text
src/
├── cli/                         # command dispatch and CLI composition
├── workspace/                   # workspace filesystem and project setup
├── profiles/                    # agent and role profile definitions
├── workflow/                    # task, handoff, store, loop, and safety behavior
└── ui/
    ├── core/                    # routing, settings, API, and server adapters
    ├── common/                  # page-independent UI helpers with real reuse
    └── pages/task-board/        # task board, drawer, graph, and handoff timeline
```

Dependencies point toward composition: CLI may compose capabilities, UI core
may adapt workflow data for read-only responses, UI pages consume UI contracts,
and workflow code never imports UI code.
