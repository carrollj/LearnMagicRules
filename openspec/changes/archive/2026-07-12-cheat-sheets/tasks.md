## 1. Storage Layer

- [x] 1.1 Add localStorage key constant and storage helper functions (load, save, with parse-error handling)
- [x] 1.2 Implement default cheat sheet factory (generates id, name "My Cheat Sheet", empty panels)
- [x] 1.3 Implement cheat sheet mutation functions: addPanel, removePanel, reorderPanels, renamePanel
- [x] 1.4 Implement item mutation functions: addItem, removeItem, setItemDisplayMode
- [x] 1.5 Implement export: serialize cheat sheet to JSON and trigger browser download
- [x] 1.6 Implement import: file picker, parse + validate JSON, replace current cheat sheet

## 2. Routing and Navigation

- [x] 2.1 Update `#index` (and empty hash) route handling in `renderCurrentRoute` to render the cheat sheet view
- [x] 2.2 Add clickable app title element to the sidebar (above filter input) linking to `#index`

## 3. Cheat Sheet View

- [x] 3.1 Implement `renderCheatSheet()` — outer layout: CSS Grid container, "+" button, panel columns
- [x] 3.2 Implement panel column markup: header with title, rename input, remove button; scrollable body; sticky search footer
- [x] 3.3 Add SCSS for cheat sheet layout: grid container, min-width, horizontal scroll, panel height, panel body scroll
- [x] 3.4 Add SCSS for panel header: drag handle affordance, title, remove button
- [x] 3.5 Wire up add-panel "+" button event
- [x] 3.6 Wire up remove-panel button event
- [x] 3.7 Wire up inline panel title rename (blur / Enter to commit)

## 4. Drag-to-Reorder

- [x] 4.1 Implement pointer-event drag lifecycle on panel headers (pointerdown → pointermove → pointerup)
- [x] 4.2 Render floating clone that follows cursor during drag
- [x] 4.3 Render drop-zone indicators between columns during drag
- [x] 4.4 Determine target drop position from cursor X and column bounds
- [x] 4.5 On drop: call reorderPanels, re-render, remove drag visuals
- [x] 4.6 Handle Escape key to cancel drag
- [x] 4.7 Add SCSS for drag states: ghost opacity, floating clone style, drop-zone indicator

## 5. Item Rendering

- [x] 5.1 Implement link mode rendering: tooltip preview HTML + navigation button + toggle button (hidden for leaf rules)
- [x] 5.2 Implement card mode rendering for rules: parent preview HTML + derived subrule previews from app.previews
- [x] 5.3 Implement card mode rendering for glossary: fetch full bundle via loadContent, render inline
- [x] 5.4 Wire up display mode toggle button (persists displayMode to storage on change)
- [x] 5.5 Wire up remove-item button event per item
- [x] 5.6 Add SCSS for item cards: link mode, card mode expanded state, toggle button, navigation button

## 6. Add-Item Search

- [x] 6.1 Implement three-tier panel search function (T1 exact title, T2 starts-with, T3 scored text) returning flat deduplicated results capped at VITE_CHEAT_SHEET_MAX_RESULTS (default 10)
- [x] 6.2 Wire up panel search input: T1+T2 on every input event, T3 debounced 300ms with cancel-on-change
- [x] 6.3 Render search results list floating above the input
- [x] 6.4 Wire up result click: call addItem, clear input, dismiss results
- [x] 6.5 Wire up input blur and Escape to dismiss results and clear input
- [x] 6.6 Add SCSS for search input footer and floating results list
