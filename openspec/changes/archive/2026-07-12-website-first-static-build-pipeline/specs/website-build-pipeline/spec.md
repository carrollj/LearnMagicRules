## ADDED Requirements

### Requirement: Website-first build ownership
The system SHALL treat the website codebase as the primary product surface, and parser output SHALL be consumed as build input rather than defining website shell structure.

#### Scenario: Website shell ownership
- **WHEN** maintainers update website shell behavior or layout
- **THEN** changes are made in website source files managed by the web build pipeline
- **AND** parser generation does not overwrite website shell assets

### Requirement: Static bundling with SCSS support
The build pipeline MUST compile website assets through a bundler with SCSS support and emit a static output bundle suitable for GitHub Pages hosting.

#### Scenario: Production web build output
- **WHEN** the production build runs
- **THEN** SCSS is compiled into CSS and frontend assets are bundled
- **AND** the final output contains only static files under the deploy directory

### Requirement: CI-only generated content artifacts
Generated content bundles SHALL be produced during build/CI execution and SHALL NOT be treated as committed source artifacts.

#### Scenario: CI generation and deployment
- **WHEN** CI executes the website build workflow
- **THEN** parser content bundles are generated within the build workspace
- **AND** the deploy artifact includes generated content consumed by the website
- **AND** the repository does not require committed generated content files

### Requirement: Minimal script contract
The repository SHALL expose only `build` and `dev` as public workflow scripts for website lifecycle operations.

#### Scenario: Build script responsibilities
- **WHEN** `build` is executed
- **THEN** it performs a full parse and production web build
- **AND** it emits a complete static deploy artifact

#### Scenario: Dev script artifact precondition
- **WHEN** `dev` is executed without previously generated build artifacts
- **THEN** the command fails fast with guidance to run `build` first
