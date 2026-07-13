## ADDED Requirements

### Requirement: Load cheat sheet from localStorage
The system SHALL load the cheat sheet from localStorage on app initialization. If no cheat sheet exists, the system SHALL initialize a default empty cheat sheet with a generated id and the name "My Cheat Sheet".

#### Scenario: Cheat sheet exists in storage
- **WHEN** the app initializes and a valid cheat sheet JSON is found under the storage key
- **THEN** the cheat sheet is parsed and used as the active cheat sheet

#### Scenario: No cheat sheet in storage
- **WHEN** the app initializes and no entry exists under the storage key
- **THEN** a new empty cheat sheet is created with a generated id, name "My Cheat Sheet", and an empty panels array

#### Scenario: Corrupt storage entry
- **WHEN** the app initializes and the storage entry cannot be parsed as valid JSON
- **THEN** a new empty cheat sheet is created (same as no entry) and the corrupt value is overwritten

### Requirement: Persist cheat sheet on every change
The system SHALL write the current cheat sheet to localStorage after every mutation (add panel, remove panel, reorder panels, add item, remove item, rename panel).

#### Scenario: Mutation occurs
- **WHEN** any cheat sheet mutation is applied
- **THEN** the updated cheat sheet is serialized to JSON and written to localStorage under the storage key

#### Scenario: localStorage write fails
- **WHEN** a write to localStorage throws (e.g., storage quota exceeded or private mode)
- **THEN** the error is silently swallowed and the in-memory state remains unchanged

### Requirement: Export cheat sheet as JSON
The system SHALL allow the user to export the active cheat sheet as a downloadable JSON file.

#### Scenario: User triggers export
- **WHEN** the user activates the export action
- **THEN** the browser downloads a JSON file containing the full cheat sheet object (id, name, panels, items)

### Requirement: Import cheat sheet from JSON
The system SHALL allow the user to import a cheat sheet from a JSON file, replacing the current cheat sheet after confirmation.

#### Scenario: Valid JSON file selected
- **WHEN** the user selects a valid cheat sheet JSON file
- **THEN** the imported cheat sheet replaces the current cheat sheet in memory and is persisted to localStorage

#### Scenario: Invalid JSON file selected
- **WHEN** the user selects a file that is not valid cheat sheet JSON
- **THEN** the import is rejected and an error message is displayed; the current cheat sheet is unchanged

#### Scenario: User cancels import
- **WHEN** the user dismisses the file picker without selecting a file
- **THEN** the current cheat sheet is unchanged
