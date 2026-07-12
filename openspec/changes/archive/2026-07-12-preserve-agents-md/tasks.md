## 1. Cleanup Guard Implementation

- [x] 1.1 Identify the parser cleanup entry point(s) that delete stale output files.
- [x] 1.2 Add a protected-filename check so files named `AGENTS.md` are skipped during deletion.
- [x] 1.3 Ensure the guard applies recursively for nested directories under cleanup roots.

## 2. Validation and Regression Coverage

- [x] 2.1 Add or update tests to verify `AGENTS.md` remains after cleanup.
- [x] 2.2 Add or update tests to verify non-protected stale generated files are still deleted.
- [x] 2.3 Run parser and test suite checks relevant to cleanup behavior and confirm expected results.

Validation note: `npm run build` and `npm run generate` succeeded; cleanup-focused tests passed. Existing parity baseline tests fail due missing baseline artifacts under `openspec/changes/rewrite-parser-to-typescript/artifacts/baseline`.

## 3. Documentation and Readiness

- [x] 3.1 Document the preservation rule in parser cleanup code comments or contributor-facing notes if needed.
- [x] 3.2 Confirm the change satisfies the parser spec delta scenarios for `AGENTS.md` preservation.
