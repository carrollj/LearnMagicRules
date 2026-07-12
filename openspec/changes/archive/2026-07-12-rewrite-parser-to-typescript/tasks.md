## 1. Baseline and migration scaffolding

- [x] 1.1 Capture baseline generation artifacts and runtime metrics from the Python parser for parity comparison.
- [x] 1.2 Create TypeScript project scaffolding (config, scripts, lint/test setup) for the parser CLI.
- [x] 1.3 Define shared TypeScript domain models for chapters, sections, rules, glossary entries, variants, and link spans.

## 2. Source ingestion and core parsing

- [x] 2.1 Implement source discovery/download and metadata freshness checks equivalent to current behavior.
- [x] 2.2 Implement rules-body and glossary boundary detection and parsers for sections, rules, and glossary entries.
- [x] 2.3 Implement lookup builders (rule lookup, chapter lookup, glossary lookup, aliases, children map).

## 3. Linking and rendering engine

- [x] 3.1 Implement markdown linking helpers for rule references, section references, and glossary references.
- [x] 3.2 Implement HTML link/span generation and overlap resolution with deterministic priority handling.
- [x] 3.3 Implement optimized glossary auto-link matcher that avoids per-line full variant scans.
- [x] 3.4 Implement section, glossary, and preview renderers that preserve route and anchor contracts.

## 4. Output generation and contract compatibility

- [x] 4.1 Implement markdown writers for sections, glossary entries, aliases, and all index pages.
- [x] 4.2 Implement site bundle writers for content pages, navigation bundle, search index, and tooltip previews.
- [x] 4.3 Implement shell asset copy/output cleanup flow matching current output structure.

## 5. Parity, determinism, and performance validation

- [x] 5.1 Add structural parity checks for required files and directories in generated outputs.
- [x] 5.2 Add bundle contract checks for required JSON fields, types, routes, and anchors.
- [x] 5.3 Add deterministic run checks to ensure repeated generation on identical input is stable.
- [x] 5.4 Add targeted semantic checks for representative rule/glossary links and anchors.
- [x] 5.5 Run performance benchmarks and verify migration meets runtime target versus baseline.

## 6. CI cutover and release safety

- [x] 6.1 Update GitHub workflow to run TypeScript parser build on free GitHub-hosted runners.
- [x] 6.2 Verify deploy artifact generation and GitHub Pages publish behavior with TS outputs.
- [x] 6.3 Document and validate one-step rollback procedure to restore previous parser pipeline if needed.
- [x] 6.4 Remove Python parser invocation from deploy path after all migration gates pass.
