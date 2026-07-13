## Context

The app is a single-page static site (vanilla JS, no framework) with an `app.js` monolith, hash-based routing, and a sidebar + main view shell. State is held in a plain `app` object. localStorage is already used for theme and sidebar-collapse preferences. There is no existing concept of user-created content.

## Goals / Non-Goals

**Goals:**
- Single cheat sheet with a horizontal panel-column layout
- Always-editable: add/remove panels, drag-to-reorder columns
- Panels hold curated rules and glossary items
- Persisted to localStorage; exportable/importable as JSON
- Fits within the existing routing and rendering patterns of `app.js`

**Non-Goals:**
- Multiple cheat sheets (coming later; data model should not block it)
- Row spans, column spans, or 2D grid layout (prototype first)
- Server-side sync or accounts
- Mobile-optimized cheat sheet editing

## Decisions

### Data model: flat panel array, no grid coordinates

Panels are stored as an ordered array. Array index = column position. No `row`/`col`/`colSpan`/`rowSpan` fields for this prototype. If the grid model is introduced later, a migration adds those fields with defaults.

```
CheatSheet { id: string, name: string, panels: Panel[] }
Panel      { id: string, title: string, items: Item[] }
Item       { type: 'rule'|'glossary', pageId: string, anchor: string|null, label: string|null, displayMode: 'link'|'card' }
```

**Alternatives considered:** explicit `order` field on each panel — rejected in favor of array position (simpler, fewer fields to maintain in sync).

### Storage: single localStorage key

The cheat sheet is stored under `'cheat-sheet'` as a serialized JSON string. Reads/writes happen through a thin storage wrapper that handles parse errors and missing entries gracefully (returns `null` on failure).

**Alternatives considered:** IndexedDB — overkill for a single object at prototype stage.

### Layout: CSS Grid with `repeat(N, minmax(280px, 1fr))`

Equal-width columns via CSS Grid. `minmax(280px, 1fr)` ensures panels have a usable minimum width while filling available space. When total min-width exceeds the viewport, the sheet container scrolls horizontally.

**Alternatives considered:** flexbox — less precise for equal-column enforcement; doesn't easily handle horizontal overflow with equal sizing.

### Drag-to-reorder: Pointer Events API (no library)

Drag reordering is implemented with `pointerdown`/`pointermove`/`pointerup` on panel headers. While dragging:
- The dragged panel becomes a semi-transparent ghost in place
- A floating clone follows the cursor
- Drop-zone indicators appear in the gaps between columns
- On drop, the panel array is reordered and the layout re-renders

**Alternatives considered:** HTML5 Drag and Drop API — cross-browser inconsistency with custom ghost rendering makes Pointer Events cleaner. Third-party sort library — avoided to keep zero-dependency frontend.

### Rendering: inline re-render on state change

Consistent with existing `renderCurrentRoute` / `renderSidebar` patterns. Cheat sheet state changes (add panel, reorder, remove) call a `renderCheatSheet()` function that rebuilds the main view HTML. Event delegation handles all panel interactions.

### Item rendering: two modes, sourced from existing in-memory data

**Link mode** (default): renders `app.previews.rules[ruleKey].html` or `app.previews.glossary[term].html` — the existing tooltip preview HTML. This data is already loaded at app boot. Zero extra fetches.

**Card mode for rules**: subrule HTML is derived from the same `app.previews.rules` map. Subrule keys are computed from the parent rule key and `subruleCount` using alphabetic suffixes:
```js
// "702.19" with subruleCount:7 → ["702.19a", "702.19b", ..., "702.19g"]
Array.from({ length: rule.subruleCount },
  (_, i) => `${ruleKey}${String.fromCharCode(97 + i)}`)
```
The toggle button is hidden for leaf rules (`subruleCount === 0`) — there is no richer content to expand.

**Card mode for glossary**: fetches the full glossary bundle via the existing `loadContent` / `getBundleForDestination` path. Bundles are per-term and already cached in `contentCache` if previously viewed in the reader.

**`displayMode` persisted**: each `Item` stores `displayMode: 'link'|'card'` so expansions survive page reload.

### Add-item search: three-tier algorithm with cancel-on-change debounce

Each panel has a sticky search input at the bottom (outside the scroll area). A new search function — separate from the existing `runSearch` — handles item discovery. It returns a flat array of candidate items (not grouped by type), each shaped as `{ type, pageId, anchor }`. `type` is sourced directly from the matched entry's own `type` field (`'rule'` or `'glossary'`).

**Three tiers, run in order, results accumulated and deduplicated:**

| Tier | Trigger | Match condition | Min chars |
|------|---------|----------------|-----------|
| T1 | Every keystroke | `entry.title.toLowerCase() === query` | none |
| T2 | Every keystroke | `entry.title.toLowerCase().startsWith(query)` | 3 |
| T3 | Debounced 300ms | Scored full-text search | none |

- T1 and T2 run against the in-memory previews data (individual rule and glossary entries).
- T3 runs a scored search similar to the existing `scoreDocument` logic.
- Deduplication is by `pageId + anchor`; later tiers exclude entries already returned.
- Total results capped at `VITE_CHEAT_SHEET_MAX_RESULTS` (default: 10).
- Results are ordered T1 → T2 → T3 appended; tier ordering is preserved at append time.

**Debounce: cancel-on-change.** On every input change, any pending T3 debounce is cancelled (`clearTimeout`) before scheduling a new one. Only the most recent debounce ever fires; stale T3 results are never produced.

**Alternatives considered:** compare-query-at-fire-time to discard stale T3 results — rejected in favour of cancel-on-change, which is simpler and guarantees no stale work is done.

## Risks / Trade-offs

- **localStorage limits (~5MB)**: If users add many items with long content, storage may fill. Mitigation: items store references (pageId + anchor), not content — content is fetched at render time. Storage footprint stays small.
- **Re-render on every drag move**: The pointer-move handler only moves a floating clone; the actual DOM re-render only fires on drop. No performance concern.
- **Prototype may pivot**: Layout model is intentionally minimal. If the grid model is adopted, the flat panel array is migrated; no other systems are affected.

## Open Questions

- **Panel minimum width**: 280px is a starting assumption. May adjust based on observed content density.
