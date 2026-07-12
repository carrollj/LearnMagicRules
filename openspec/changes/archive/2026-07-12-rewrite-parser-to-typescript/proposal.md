## Why

The current Python parser is increasingly hard to evolve with the JavaScript-heavy site runtime, and its current glossary auto-linking implementation is the dominant performance bottleneck. Rewriting the parser in TypeScript now enables shared parsing/linking logic with the site code while addressing runtime performance with a better matching algorithm.

## What Changes

- Replace `parse_comprehensive_rules.py` with a TypeScript parser/generator CLI that produces equivalent markdown and site data outputs.
- Preserve output contracts used by the rules browser (`navigation.json`, `search-index.json`, `tooltip-previews.json`, and content bundles) so the existing site continues to run without consumer-breaking changes.
- Reimplement rule/glossary linking and auto-glossary matching in TypeScript with deterministic behavior and improved performance.
- Update CI/CD workflow to build/deploy from the TypeScript parser on free GitHub-hosted runners.
- Add parity and regression verification to ensure one-shot migration safety.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `parser`: Update parser requirements to define output compatibility, deterministic generation, and migration acceptance criteria for the TypeScript cutover.

## Impact

- Affected code: parser implementation and generation pipeline, plus deployment workflow.
- Affected systems: static output generation under `comprehensive-rules/` and `rules-site/`, GitHub Pages build/deploy.
- Dependencies: Node.js/TypeScript toolchain in CI (free GitHub Actions usage).
- Risk: migration-scale regression in linking/anchors/output shape; mitigated by explicit parity checks.
