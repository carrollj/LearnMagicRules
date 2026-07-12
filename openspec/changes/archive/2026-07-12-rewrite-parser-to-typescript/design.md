## Context

The repository currently generates markdown and site data from a Python parser (`parse_comprehensive_rules.py`) and deploys static output through GitHub Pages. Profiling shows the dominant runtime cost is glossary auto-linking where many glossary term patterns are scanned repeatedly across rendered lines. The migration goal is a one-shot replacement to TypeScript so parser/linking logic can be shared with JavaScript-oriented site code while preserving existing output contracts consumed by the browser UI.

Constraints:
- Must run on free GitHub-hosted CI runners.
- Must preserve compatibility with current site data consumers and routing semantics.
- Must support rollback if migration introduces regressions.

## Goals / Non-Goals

**Goals:**
- Replace the Python parser pipeline with a TypeScript CLI that produces equivalent markdown and JSON outputs.
- Preserve schema and route/anchor contracts consumed by the existing site runtime.
- Improve runtime by replacing O(lines x variants) glossary matching with a single-pass or near-single-pass strategy.
- Keep generation deterministic (stable ordering and repeatable outputs).
- Update CI workflow to use Node/TypeScript for build and deploy.

**Non-Goals:**
- Redesign the browser UI or change site interaction behavior.
- Introduce new output formats or break existing output paths during cutover.
- Add paid services or non-free CI dependencies.

## Decisions

1. One-shot cutover in a dedicated change branch
- Decision: Implement all parser functionality in TypeScript and switch CI in one release event.
- Rationale: User preference is all-at-once migration; this also avoids prolonged dual-maintenance.
- Alternative considered: staged migration with Python and TypeScript side-by-side. Rejected due to duplicated maintenance burden and slower convergence.

2. Preserve output contracts first, optimize internals under the hood
- Decision: Keep output roots, key bundle filenames, route formats, and anchor conventions unchanged for initial cutover.
- Rationale: Minimizes downstream break risk in the existing site app.
- Alternative considered: simultaneous contract redesign. Rejected due to high blast radius and reduced confidence in one-shot migration.

3. Use shared TypeScript core modules for parsing and linking
- Decision: Implement reusable modules (normalization, term variants, link span selection, route helpers) consumed by generator entrypoints.
- Rationale: Enables future reuse in site-side JavaScript/TypeScript and reduces duplicated logic.
- Alternative considered: monolithic script-only CLI. Rejected because it limits reuse and testability.

4. Replace glossary matching algorithm with deterministic consolidated matching
- Decision: Implement glossary auto-link detection using a consolidated matcher strategy instead of scanning every variant against every line.
- Rationale: Removes the measured hotspot and improves scaling behavior.
- Alternative considered: direct 1:1 port of Python regex loops. Rejected because it preserves known performance bottleneck.

5. Enforce migration via parity test harness and release gates
- Decision: Add parity checks covering file structure, bundle shape, routes/anchors, deterministic regeneration, and representative link correctness.
- Rationale: Provides objective go/no-go criteria for one-shot migration.
- Alternative considered: manual visual validation only. Rejected as insufficient for high-confidence cutover.

## Risks / Trade-offs

- [Semantic drift in linking/anchors] -> Mitigation: add deterministic parity assertions and sampled deep-link checks against known baseline outputs.
- [One-shot migration blast radius] -> Mitigation: enforce merge gates (contract parity, CI pass, performance threshold) and maintain a single-commit rollback path.
- [Runtime regressions due to JS regex behavior differences] -> Mitigation: define explicit tie-breaking/overlap rules and validate with corpus-based tests.
- [Increased initial implementation complexity] -> Mitigation: split into internal modules with focused tests before integrating final CLI wiring.
- [CI environment mismatch] -> Mitigation: run migration pipeline in `ubuntu-latest` with pinned Node and lockfile-based installs.

## Migration Plan

1. Capture baseline outputs and runtime metrics from the current Python parser.
2. Implement TypeScript parser modules and CLI with contract-compatible output generation.
3. Add parity tests and run repeated deterministic generation checks.
4. Update GitHub Actions workflow to build with Node/TypeScript and publish generated `rules-site` output.
5. Validate deployed site behavior and route/link correctness post-deploy.
6. Keep rollback strategy ready: revert workflow and parser entrypoint to the Python version if any critical regression is detected.

## Open Questions

- Should the glossary matcher be implemented as a compiled alternation regex, trie-based scanner, or Aho-Corasick utility library for best maintainability/performance balance?
- Should parity checks run on every push or only on protected branch/PR validation to control CI time?
- Should TypeScript output preserve exact key ordering for byte-level parity, or accept semantic parity with normalized comparison for selected artifacts?
