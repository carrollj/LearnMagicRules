## ADDED Requirements

### Requirement: Parser migration parity gates
The parser migration process MUST include parity gates that validate structural, semantic, and deterministic equivalence between baseline and migrated outputs before deployment.

#### Scenario: Parity gate execution
- **WHEN** migration validation is executed for a release candidate
- **THEN** it verifies output structure, bundle contracts, route and anchor correctness, and deterministic regeneration behavior

### Requirement: Safe cutover and rollback
Parser deployment SHALL provide a one-step rollback path to restore the previous generation pipeline if critical regressions are detected after cutover.

#### Scenario: Rollback on critical regression
- **WHEN** a post-cutover critical regression is identified in generated outputs or site navigation/linking
- **THEN** maintainers can revert to the previous parser pipeline in one rollback action and restore working generation/deploy behavior

### Requirement: CI compatibility on free GitHub-hosted runners
The parser pipeline MUST run successfully in GitHub Actions using free GitHub-hosted runners without paid third-party services.

#### Scenario: CI build and deploy preparation
- **WHEN** the parser build job executes in the configured GitHub Actions workflow
- **THEN** it completes generation and artifact packaging using only free runner capabilities and repository-managed dependencies

### Requirement: TypeScript parser generates complete static outputs
The parser implementation MUST provide a TypeScript parser CLI that generates the complete static outputs currently required for documentation and site publishing, including markdown outputs and site data bundles.

#### Scenario: Full generation run succeeds
- **WHEN** the TypeScript parser is executed against the current comprehensive rules source
- **THEN** it completes successfully and writes all required output roots and files for markdown and site content

### Requirement: TypeScript parser preserves output contracts
The TypeScript parser SHALL preserve output contract compatibility for site consumers, including expected bundle file names, required fields, route formats, and anchor conventions.

#### Scenario: Contract validation against generated bundles
- **WHEN** generated JSON bundles are validated by contract checks
- **THEN** all required bundle files and fields are present and conform to expected types and route/anchor format rules

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
