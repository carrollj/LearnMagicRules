## ADDED Requirements

### Requirement: Parser cleanup preserves AGENTS guidance files
The parser cleanup process MUST NOT delete files whose basename is exactly `AGENTS.md` when cleaning generated output roots.

#### Scenario: Preserve AGENTS file during cleanup
- **WHEN** parser cleanup processes a directory containing an `AGENTS.md` file and stale generated files
- **THEN** the `AGENTS.md` file remains present after cleanup
- **AND** stale generated files that are not protected are deleted

#### Scenario: Preserve nested AGENTS files
- **WHEN** parser cleanup recursively processes nested output directories that contain `AGENTS.md`
- **THEN** each `AGENTS.md` file remains present regardless of directory depth
