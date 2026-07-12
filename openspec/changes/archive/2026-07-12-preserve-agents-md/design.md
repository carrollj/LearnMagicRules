## Context

The TypeScript parser regenerates markdown and site data outputs and uses cleanup steps to remove stale generated files. The repository also relies on `AGENTS.md` files as instruction and policy documents for agent behavior. Current cleanup behavior can remove these files when they appear under output roots, which breaks local workflow guardrails and automation safety.

## Goals / Non-Goals

**Goals:**
- Prevent parser cleanup from deleting files named `AGENTS.md`.
- Preserve existing cleanup behavior for generated artifacts not explicitly protected.
- Add verification coverage so regressions are caught in local and CI runs.

**Non-Goals:**
- Redesigning the full cleanup algorithm.
- Protecting arbitrary additional filenames beyond `AGENTS.md` in this change.
- Changing output locations or output contract formats.

## Decisions

1. Introduce a protected-filename guard in cleanup traversal.
Rationale: A targeted guard is the smallest safe change and directly addresses the risk.
Alternatives considered:
- Broad allowlist by extension or folder: rejected because it increases scope and risks stale output retention.
- Disable deletion for entire directories: rejected because it allows obsolete generated files to accumulate.

2. Apply protection by basename match (`AGENTS.md`) regardless of depth under cleanup roots.
Rationale: `AGENTS.md` files may exist at multiple levels and all should be preserved.
Alternatives considered:
- Protect only top-level `AGENTS.md`: rejected as incomplete.
- Path-specific exceptions: rejected due to maintenance overhead and fragility.

3. Add tests that assert preservation while confirming normal stale-file deletion still occurs.
Rationale: Dual assertions prevent over-protection and under-protection regressions.
Alternatives considered:
- Manual validation only: rejected because behavior is easy to regress.

## Risks / Trade-offs

- [Risk] Cleanup logic may skip files incorrectly if filename checks are too broad.
  -> Mitigation: Restrict protection to exact case-sensitive basename `AGENTS.md` and keep deletion tests for other files.

- [Risk] Existing tests may not cover all cleanup entry points.
  -> Mitigation: Add test cases at the shared cleanup utility layer used by parser workflows.

- [Risk] Future contributors may add destructive cleanup paths without the guard.
  -> Mitigation: Centralize guard helper and include test expectations documenting the invariant.

## Migration Plan

1. Implement guarded deletion in parser cleanup utility/path traversal.
2. Add or update tests that seed `AGENTS.md` and stale generated files under cleanup roots.
3. Run parser and tests to verify preserved `AGENTS.md` plus normal stale-file cleanup.
4. Merge as non-breaking internal behavior update.

Rollback strategy:
- Revert the guard commit if unexpected stale file retention impacts generation.

## Open Questions

- Should case-insensitive matches (e.g., `agents.md`) also be protected on case-insensitive filesystems?
- Should this evolve into a configurable protected filename set in a later change?
