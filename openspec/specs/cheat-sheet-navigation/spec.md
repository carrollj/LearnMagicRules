## ADDED Requirements

### Requirement: Cheat sheet is the home page
The cheat sheet view SHALL be displayed when the URL hash is `#index` or empty. The cheat sheet replaces the previous rules/glossary cards grid as the default landing view.

#### Scenario: App loads with no hash
- **WHEN** the app loads with an empty hash
- **THEN** the cheat sheet view is rendered in the main view area

#### Scenario: User navigates to #index
- **WHEN** the URL hash is `#index`
- **THEN** the cheat sheet view is rendered in the main view area

### Requirement: Sidebar title navigates to the cheat sheet
The sidebar SHALL display a clickable title element (the app name) above the filter input. Activating it SHALL navigate to `#index`, displaying the cheat sheet.

#### Scenario: User clicks the sidebar title
- **WHEN** the user activates the sidebar title
- **THEN** the URL hash is set to `#index` and the cheat sheet view is rendered
