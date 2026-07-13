## Why

Users need a way to quickly reference specific rules and glossary terms during play without navigating through the full rules browser. A customizable cheat sheet allows players to build and share focused reference cards for common game scenarios (e.g., combat, keyword abilities, multiplayer rules).

## What Changes

- New cheat sheet view accessible from the main navigation
- A single cheat sheet composed of user-configured panels arranged as a horizontal column layout
- Panels contain user-curated rules and glossary items
- Layout is always editable: add/remove panels, drag-to-reorder columns
- Cheat sheet state persisted to `localStorage`
- Export and import cheat sheet as JSON for sharing between users

## Capabilities

### New Capabilities

- `cheat-sheet-storage`: Persist and retrieve a single cheat sheet (panels + items) in `localStorage`; export/import as JSON
- `cheat-sheet-layout`: Horizontal panel-column layout with drag-to-reorder, add/remove panels, horizontal scroll when panels exceed viewport
- `cheat-sheet-items`: Add rules and glossary terms to panels; render items inside panels; remove items
- `cheat-sheet-navigation`: Cheat sheet is the home page (`#index`); sidebar gains a clickable app title that links to `#index`

### Modified Capabilities

## Impact

- `website/src/app.js`: New route (`#cheat-sheet`), new render functions, navigation integration
- `website/index.html`: New navigation element or mode button for cheat sheets
- `website/src/styles/app.scss`: New layout styles for cheat sheet view, panels, drag states
- `localStorage`: New key(s) for cheat sheet data (alongside existing theme/sidebar-collapse keys)
- No changes to the parser, build pipeline, or data files
