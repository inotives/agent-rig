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
