## ADDED Requirements

### Requirement: Panels render as equal-width horizontal columns
The cheat sheet view SHALL render panels as equal-width columns in a single horizontal row using CSS Grid (`repeat(N, minmax(280px, 1fr))`). Each panel SHALL occupy the full height of the cheat sheet view area. Each panel body SHALL scroll independently (overflow-y: auto).

#### Scenario: One or more panels exist
- **WHEN** the cheat sheet view is rendered with one or more panels
- **THEN** each panel is displayed as a column of equal width filling the available horizontal space

#### Scenario: Panels exceed viewport width
- **WHEN** the total minimum width of all panels (N × 280px) exceeds the viewport width
- **THEN** the cheat sheet container scrolls horizontally; panels are not compressed below 280px

### Requirement: Add panel via "+" button
The system SHALL display a "+" button at the right edge of the cheat sheet view. Activating it SHALL append a new empty panel to the end of the panels array.

#### Scenario: User adds a panel
- **WHEN** the user activates the "+" button
- **THEN** a new panel with a generated id, default title "New Panel", and empty items array is appended to the panels array and the layout re-renders

### Requirement: Remove panel via close button
Each panel header SHALL contain a remove button. Activating it SHALL remove that panel from the panels array.

#### Scenario: User removes a panel
- **WHEN** the user activates the remove button on a panel
- **THEN** the panel is removed from the panels array and the layout re-renders

### Requirement: Drag-to-reorder panels horizontally
The user SHALL be able to reorder panels by dragging a panel's header left or right. While dragging, the dragged panel SHALL appear as a semi-transparent ghost in its original position. A floating clone SHALL follow the cursor. Drop-zone indicators SHALL appear in the gaps between columns. On drop, the panel SHALL be inserted at the indicated position.

#### Scenario: User drags panel to a new position
- **WHEN** the user drags a panel header and drops it over a drop-zone indicator between two other panels
- **THEN** the panel is moved to that position in the array and the layout re-renders

#### Scenario: User drops panel back to original position
- **WHEN** the user drags a panel and releases it without crossing a drop-zone threshold
- **THEN** the panels array is unchanged and the layout re-renders without change

#### Scenario: User cancels drag (Escape key)
- **WHEN** the user presses Escape during a drag operation
- **THEN** the drag is cancelled, the panels array is unchanged, and all drag visuals are removed

### Requirement: Rename panel title
The user SHALL be able to edit a panel's title inline by activating the title in the panel header.

#### Scenario: User renames a panel
- **WHEN** the user activates the panel title and submits a new name (blur or Enter)
- **THEN** the panel's title is updated to the new value and persisted
