# Catalog multi-select → multi-root map — Design

**Date:** 2026-06-02
**Status:** Approved (pending written-spec review)
**Area:** `web/` (React + TypeScript viewer)

## Summary

Add the ability to select multiple services on the catalog view (via a "Select
multiple" mode + per-card checkboxes) and open them together in the dependency
map as **multiple roots**. The map generalizes from a single root to a *set* of
roots; the graph and all its controls behave exactly as today, just seeded from
N services instead of one.

## Goals

- Toggle a "Select multiple" mode on the catalog view.
- Per-card checkbox showing selected/unselected; default all unselected.
- Selection survives filtering and sorting within the catalog.
- A "Map selected" action opens the map seeded with the selected services.
- The map supports multiple roots; existing map behavior (mode, depth, CSV,
  Mermaid, node click) is unchanged.
- Grow/shrink the root set from inside the map via ⌘/Ctrl+click.
- Multi-root maps are shareable/refresh-safe via the URL hash.

## Non-goals

- Multi-select on the mesh ("Slice by") view — out of scope.
- Selecting external/unresolved dependency nodes as roots (only catalogued
  services are selectable).
- Persisting selection across full page reloads or across leaving the catalog
  (selection is intentionally ephemeral — see Selection lifetime).
- Bulk actions other than "map selected" (e.g. bulk CSV of the selection) —
  not in this iteration.

## Selection model & lifetime

Selection state lives **local to `CatalogView`** as:

- `selectMode: boolean` — whether "Select multiple" is on.
- `selected: Set<string>` — selected `serviceId`s.

Rationale: `CatalogView` only mounts when `view === 'catalog'` and nothing is
selected/mapped (see `App.tsx` render branch). Opening a detail page, switching
to mesh, or opening the map all **unmount** `CatalogView`. Keeping selection in
local state means it clears exactly when the spec requires — no app-level reset
logic to maintain.

**Cleared when:**
- "Select multiple" is toggled off, or the selection bar's **Clear** is clicked.
- The user navigates away from the catalog for any reason (mesh, map, or a
  detail page) — falls out of unmount automatically.

**Persists across:** filtering, sorting, and query changes (these keep
`CatalogView` mounted).

**[[ASSUMPTION]]** Toggling "Select multiple" off also empties `selected`, and
leaving the catalog resets both `selectMode` (back to off) and `selected` (empty)
— so returning to the catalog is a clean slate. This is the natural consequence
of local state + unmount.

## Catalog view UI

### Results toolbar
- A **"Select multiple"** toggle button in the existing `results__head` row,
  alongside the Sort segmented control and Export CSV.

### Selection bar (option B)
- When `selectMode` is on, a highlighted **selection bar** renders below the
  results head: `N selected · [Map selected →] · [Clear]`.
- **Map selected** is disabled when `N === 0`. When `N ≥ 1` it navigates to the
  map seeded with the selected ids.

### Service card (`ServiceCard`)
- A **checkbox** in the card's top-left corner, visible only while `selectMode`
  is on, reflecting membership in `selected`.
- While `selectMode` is on:
  - Clicking **anywhere on the card body toggles** selection (not open-detail).
  - The service-id `<code>` becomes the affordance to **open the detail page**.
  - The per-card "map →" button is **hidden** (the flow is Map selected).
- While `selectMode` is off: card behaves exactly as today (body opens detail,
  "map →" opens single-root map). No checkbox shown.

## Map view — multiple roots

The map is generalized from a single `rootId` to a **root set** (`rootIds`,
length ≥ 1). The left panel follows the root count:

- **1 root** → the existing rich `ServiceDetail` panel (unchanged; no regression
  for the common single-service case).
- **≥2 roots** → a new **roots sidebar** (`RootsSidebar`): one row per root with
  tier-colored dot, name, and a remove **✕**; a `N roots` header. Clicking a row
  opens that root's detail page. ✕ removes the root from the set.

The graph (right) and its controls — Dependencies/Dependants/Both, 1/2/All hops,
Export CSV, Mermaid — are identical regardless of count. **All roots are drawn
enlarged** (the "root" node treatment, generalized from one id to a set).

### Node interaction (in the graph)
- **Plain left-click** a node → re-root to that node: the set becomes
  `[clicked]`, collapsing to the 1-root detail layout. (Matches today.)
- **⌘/Ctrl+click** a node → **toggle** it in the root set: add if absent, remove
  if present. Adding a 2nd root flips the panel to the sidebar; removing back to
  1 returns to the detail panel. Implemented with `metaKey || ctrlKey` so macOS
  `ctrl+click` (OS right-click) is not relied upon.
- Only catalogued services (`index.byId.has(id)`) can be roots; clicks on
  external/unresolved nodes are ignored for re-rooting/toggling (same guard as
  today's `handleNodeClick`).

### Edge cases
- ⌘/Ctrl+click that removes the **last** root → navigate back to the catalog.
- CSV/Mermaid exports reflect the resolved multi-root neighborhood (consistent
  with current dependency-map export behavior).
- Mermaid title and root styling generalize to the root set (e.g. title lists
  the roots or a count; all roots get root styling).

## Routing

- New hash: `#/m/<id1,id2,…>` — the map keyed by a comma-separated root set
  (URL-encoded ids). Refresh-safe and shareable.
- `#/s/<id>` is kept as a **back-compat alias** parsed as a single-root map
  (`rootIds = [id]`).
- `#/d/<id>` (full detail page) and `#/` / `#/mesh` are unchanged.
- `App` parses `#/m/` into a `rootIds` array and syncs state→hash as the root set
  changes (re-root, ⌘/Ctrl+click add/remove).

## Component & data-layer changes

- **`CatalogView.tsx`** — `selectMode` + `selected` state; toolbar toggle;
  selection bar; pass selection props/handlers to cards; `onMapSelected(ids)` up
  to `App`.
- **`ServiceCard.tsx`** — checkbox; select-mode click semantics; hide "map →" and
  route detail through the id link in select mode.
- **`App.tsx`** — generalize the map route from single `selectedId`+`detailMode`
  to a `rootIds: string[]` map state; `#/m/` parse + hash sync; `onMapSelected`;
  pass root-set + mutation callbacks to the map.
- **New `RootsSidebar.tsx`** — the ≥2-root left panel (list, remove, open detail).
- **`DependencyMap.tsx`** — `rootId: string` → `rootIds: string[]`; use
  `index.egoSet(rootIds, mode, depth)` + `buildSubgraphElements`; ⌘/Ctrl+click
  toggling and plain-click re-root via callbacks; stats/empty-state for N roots.
- **`graph/build.ts`** — `buildSubgraphElements` accepts a **set** of root ids for
  enlarged-node styling (replacing the single `rootId` sentinel param).
- **`graph/mermaid.ts`** — multi-root title + root styling.
- **`app.css`** — selection bar, card checkbox, roots-sidebar styles (reusing
  existing tokens/classes where possible).

The data layer (`index.egoSet` + `buildSubgraphElements`) already supports
multiple seed roots from the previous mesh "Slice by" work; this is largely
wiring + UI. The one data-layer change is letting `buildSubgraphElements` take a
**set** of root ids (today it enlarges a single `rootId`).

## Testing

No automated test suite exists in `web/` today; verification is `npm run
typecheck` plus manual checks. Manual acceptance:

1. Toggle Select multiple → checkboxes appear, selection bar shows, Map selected
   disabled at 0.
2. Check 3 cards; apply a filter and a sort → the 3 checks persist.
3. Open a card's detail via the id link, go back → selection cleared (per spec).
4. Re-select 3; Map selected → map opens with 3 enlarged roots + sidebar; URL is
   `#/m/a,b,c`; refresh restores it.
5. ⌘/Ctrl+click a non-root node → added (4 roots); ⌘/Ctrl+click a root → removed.
6. Plain-click a node → collapses to single-root detail map.
7. Remove roots down to 1 → detail panel returns; remove last → back to catalog.
8. Single-root map (card "map →") still shows the rich ServiceDetail, unchanged.
