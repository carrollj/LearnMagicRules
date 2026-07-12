## ADDED Requirements

### Requirement: Sidebar collapse and expansion animate smoothly
The sidebar SHALL animate between expanded and collapsed states instead of changing width and visibility abruptly.

#### Scenario: Collapse transition runs
- **WHEN** the user collapses the sidebar
- **THEN** the sidebar SHALL transition to the collapsed layout with visible motion

#### Scenario: Expand transition runs
- **WHEN** the user expands the sidebar
- **THEN** the sidebar SHALL transition to the expanded layout with visible motion

### Requirement: Sidebar content fades during state changes
Sidebar header and navigation content SHALL use subtle opacity and/or transform motion while the sidebar is changing size so the content does not disappear instantly.

#### Scenario: Content hides during collapse
- **WHEN** the sidebar begins collapsing
- **THEN** the visible sidebar content SHALL animate out before it is fully hidden

#### Scenario: Content appears during expand
- **WHEN** the sidebar begins expanding
- **THEN** the sidebar content SHALL animate in as the sidebar becomes visible

### Requirement: Motion respects reduced-motion preferences
The sidebar animation system SHALL reduce or remove motion when the user has enabled reduced-motion preferences.

#### Scenario: Reduced motion is enabled
- **WHEN** the user has requested reduced motion
- **THEN** the sidebar SHALL preserve the same collapse and expand behavior without pronounced animation