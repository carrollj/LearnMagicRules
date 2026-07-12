## ADDED Requirements

### Requirement: Generation is deterministic
The TypeScript parser MUST produce deterministic output for identical inputs and configuration.

#### Scenario: Repeated runs produce equivalent output
- **WHEN** the parser is run multiple times with unchanged source inputs
- **THEN** output comparisons show no nondeterministic differences in ordered content and generated references

### Requirement: Glossary auto-linking scales efficiently
The TypeScript parser MUST implement glossary auto-linking with an algorithm that avoids per-line full scans of every glossary variant.

#### Scenario: Performance gate for glossary matching
- **WHEN** parser performance is measured on the canonical rules source
- **THEN** glossary matching does not dominate runtime in a way consistent with O(lines x variants) scanning behavior

### Requirement: Parser cleanup preserves AGENTS guidance files
The parser cleanup process MUST NOT delete files whose basename is exactly `AGENTS.md` when cleaning generated output roots.

#### Scenario: Preserve AGENTS file during cleanup
- **WHEN** parser cleanup processes a directory containing an `AGENTS.md` file and stale generated files
- **THEN** the `AGENTS.md` file remains present after cleanup
- **AND** stale generated files that are not protected are deleted

#### Scenario: Preserve nested AGENTS files
- **WHEN** parser cleanup recursively processes nested output directories that contain `AGENTS.md`
- **THEN** each `AGENTS.md` file remains present regardless of directory depth
