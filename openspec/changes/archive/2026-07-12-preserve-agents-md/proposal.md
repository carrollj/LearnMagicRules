## Why

The parser cleanup flow currently risks deleting repository guidance files named `AGENTS.md`. This change is needed now to protect agent instruction files that are required for safe and consistent development workflows.

## What Changes

- Update parser cleanup behavior so files named `AGENTS.md` are never deleted during generation or output refresh operations.
- Add explicit parser requirements and test coverage for preserving `AGENTS.md` files when cleaning output directories.
- Keep current cleanup behavior for other generated files unchanged.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `parser`: Add a requirement that parser cleanup must preserve files named `AGENTS.md` in output trees.

## Impact

- Affected code: parser cleanup logic in TypeScript parser implementation and related tests.
- Affected systems: local parser runs and CI parser generation workflows.
- Compatibility: non-breaking; narrows deletion scope to protect `AGENTS.md` files.
