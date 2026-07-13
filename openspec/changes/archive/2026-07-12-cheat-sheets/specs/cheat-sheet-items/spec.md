## ADDED Requirements

### Requirement: Items render in link mode by default
Each item in a panel SHALL render in link mode by default, showing the item's preview HTML (from `app.previews`) and a navigation button that opens the item in the reader.

#### Scenario: Rule item renders in link mode
- **WHEN** a rule item is displayed in a panel
- **THEN** the item shows the rule's tooltip preview HTML and a navigation button linking to the rule in the reader

#### Scenario: Glossary item renders in link mode
- **WHEN** a glossary item is displayed in a panel
- **THEN** the item shows the glossary term's tooltip preview HTML and a navigation button linking to the term in the reader

### Requirement: Rule items with subrules can toggle to card mode
A rule item whose `subruleCount` is greater than 0 SHALL display a toggle button. Activating it SHALL switch the item to card mode, showing the rule's preview HTML followed by the preview HTML of each subrule in order. Activating the toggle again SHALL return the item to link mode.

#### Scenario: User expands a rule with subrules to card mode
- **WHEN** the user activates the card mode toggle on a rule item with subrules
- **THEN** the item expands to show the rule's own preview HTML followed by the preview HTML for each subrule (702.19a, 702.19b, etc.), derived from `app.previews.rules`

#### Scenario: User collapses a card mode rule back to link mode
- **WHEN** the user activates the toggle on a rule item in card mode
- **THEN** the item returns to showing only its link mode preview HTML

#### Scenario: Leaf rule has no toggle
- **WHEN** a rule item has `subruleCount` of 0
- **THEN** no toggle button is shown; the item is always in link mode

### Requirement: Glossary items can toggle to card mode
A glossary item SHALL display a toggle button. Activating it SHALL switch the item to card mode by fetching and rendering the full glossary bundle for that term. Activating the toggle again SHALL return the item to link mode.

#### Scenario: User expands a glossary term to card mode
- **WHEN** the user activates the card mode toggle on a glossary item
- **THEN** the full glossary entry bundle is fetched and its HTML is rendered inline within the item card

#### Scenario: Glossary card mode uses cached bundle
- **WHEN** the user expands a glossary item that was previously expanded in the same session
- **THEN** the bundle is served from the existing content cache without a new network request

### Requirement: Items store their display mode
The `displayMode` of each item SHALL be persisted as part of the cheat sheet state so that card mode expansions survive page reload.

#### Scenario: Card mode survives reload
- **WHEN** the user expands an item to card mode and reloads the page
- **THEN** the item is still in card mode when the cheat sheet re-renders

### Requirement: Remove item from panel
The user SHALL be able to remove an item from a panel.

#### Scenario: User removes an item
- **WHEN** the user activates the remove button on an item within a panel
- **THEN** the item is removed from the panel's items array and the panel re-renders

### Requirement: Panel displays a sticky search input for adding items
Each panel SHALL display a search input fixed at the bottom of the panel, outside the panel's scrollable body area. The input SHALL be visible at all times regardless of scroll position.

#### Scenario: Input is always visible
- **WHEN** a panel contains enough items to require scrolling
- **THEN** the search input remains visible at the bottom of the panel without scrolling

### Requirement: Live search results appear above the input
As the user types in the panel search input, matching results SHALL appear in a list that floats above the input. Results SHALL update immediately for tier 1 and tier 2 matches.

#### Scenario: Results appear while typing
- **WHEN** the user types into the panel search input
- **THEN** tier 1 and tier 2 matches appear above the input without requiring a form submission

#### Scenario: Results dismiss on input blur
- **WHEN** the panel search input loses focus without a result being selected
- **THEN** the results list is dismissed and the input is cleared

#### Scenario: Results dismiss on Escape
- **WHEN** the user presses Escape while the panel search input is focused
- **THEN** the results list is dismissed and the input is cleared

### Requirement: Three-tier search algorithm
The panel search SHALL implement three tiers of matching, applied in order, with results accumulated and deduplicated by `pageId + anchor`.

**Tier 1 — Exact title match**: fires on every keystroke, no minimum character length. Matches entries whose title exactly equals the query (case-insensitive).

**Tier 2 — Title starts-with**: fires on every keystroke when the query is 3 or more characters. Matches entries whose title starts with the query (case-insensitive). Excludes tier 1 matches.

**Tier 3 — Scored full-text search**: fires after a configurable debounce delay (default 300ms) following the last keystroke. Uses scored full-text matching similar to the existing search. Excludes tier 1 and tier 2 matches.

The debounce SHALL be cancelled and reset on every input change (cancel-on-change). Stale tier 3 results are never produced.

Total results SHALL be capped at a configurable maximum (default 10). Results are presented in tier order: tier 1 first, tier 2 next, tier 3 appended after the debounce fires.

#### Scenario: Tier 1 matches a single-character glossary term
- **WHEN** the user types "X" into the panel search input
- **THEN** the glossary term "X" appears immediately as a tier 1 result

#### Scenario: Tier 2 fires only at 3+ characters
- **WHEN** the user types "50" (2 chars)
- **THEN** only tier 1 results are shown; no starts-with results appear

#### Scenario: Tier 2 fires at 3 characters
- **WHEN** the user types "506"
- **THEN** tier 2 starts-with results (rules and glossary terms beginning with "506") appear immediately

#### Scenario: Tier 3 appends after debounce
- **WHEN** the user stops typing for the debounce duration
- **THEN** tier 3 scored results are appended below any existing tier 1 and tier 2 results, up to the total cap

#### Scenario: Debounce cancels on new input
- **WHEN** the user types a new character before the debounce delay elapses
- **THEN** the pending tier 3 search is cancelled and a new debounce is scheduled

#### Scenario: Results deduplicated across tiers
- **WHEN** a result would appear in both tier 2 and tier 3
- **THEN** it appears only once, at its tier 2 position

#### Scenario: Results capped at maximum
- **WHEN** the combined tier 1, 2, and 3 results exceed the configured maximum
- **THEN** only up to the maximum number of results are shown

### Requirement: Clicking a result adds it to the panel
Clicking a result in the panel search results SHALL add the corresponding item to the panel's items array, clear the search input, and dismiss the results list.

The item's `type` SHALL be taken from the matched entry's own type field (`'rule'` or `'glossary'`). The item's `displayMode` SHALL default to `'link'`.

#### Scenario: User selects a rule result
- **WHEN** the user clicks a rule result in the search dropdown
- **THEN** an item `{ type: 'rule', pageId, anchor, displayMode: 'link' }` is appended to the panel's items array, the input clears, and results dismiss

#### Scenario: User selects a glossary result
- **WHEN** the user clicks a glossary result in the search dropdown
- **THEN** an item `{ type: 'glossary', pageId, anchor, displayMode: 'link' }` is appended to the panel's items array, the input clears, and results dismiss
