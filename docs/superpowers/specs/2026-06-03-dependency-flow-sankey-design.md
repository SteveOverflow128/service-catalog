# Dependency Flow (Sankey) view — Design

**Date:** 2026-06-03
**Status:** Approved (pending written-spec review)
**Area:** `web/` (React + TypeScript viewer)

## Summary

Add a third top-level view, **Flow**, alongside Catalog and Mesh: a **focused,
rooted, multi-hop dependency Sankey**. The user picks a focus service; the
dependency graph fans outward from it in left→right columns, one column per
**hop-distance** from the focus. Downstream dependencies fan to the right,
upstream dependants fan to the left. Band thickness encodes **blast radius**
(how much sits behind a link), cycles are rendered via **ghost re-entry** nodes,
and bands are colored by **criticality** by default (toggleable to interaction
type or branch lineage).

This is the Sankey analog of the existing dependency **map**: same rooted, ego
mental model, but laid out as a layered flow diagram instead of a force-directed
graph.

## Goals

- A new top-level **Flow** tab in the top bar (beside Catalog / Mesh).
- A **single focus service**; the diagram lays out services in columns by hop
  distance from it.
- **As many columns as the depth requires** — downstream → right, upstream →
  left, root at column 0.
- **Flow-weighted** band thickness (downstream/upstream blast radius).
- **Ghost re-entry** for cycles: a back-edge's target reappears as a faded
  duplicate node one column further out; the band draws normally left→right.
- **Color-by toggle**: Criticality (default) / Interaction / Branch.
- **Direction** (`downstream` / `upstream` / `both`) and **Depth** (`1` / `2` /
  `All`, default **2**) controls, reusing the mesh/map control vocabulary.
- Click any node (or ghost) to **reroot** the flow on it.
- Entry from the Map affordances (service cards, detail page) to open Flow
  rooted on a service, and a focus picker when Flow is opened with no focus.
- **Shareable/refresh-safe** focus via the URL hash (`#/f/<id>`).
- **Mermaid** (`sankey-beta`) and **CSV** (edge list) export, reusing the
  existing export modals.

## Non-goals

- **Multi-root** flow (the map supports N roots; flow is single-focus — hop
  distance is ill-defined from multiple roots). Future work.
- A global, non-rooted Sankey (e.g. caller→callee matrix across the whole
  catalog). We explicitly chose the rooted/ego structure.
- Group-level nodes (Product→Product, Team→Team). Nodes are **individual
  services**; hop-distance is a service-graph concept.
- True flow conservation. The dependency graph has merges (shared nodes), so
  thickness is an explainable **heuristic**, not a conserved quantity (see
  Flow-weight).
- Encoding direction/depth/color in the hash. Like the mesh, those are local
  component state; only the focus id is in the hash.
- Animated transitions between reroots (nice-to-have, not this iteration).

## Background — what exists today

- **Views** are a discriminated union in `data/routing.ts`:
  `{ kind:'catalog' } | { kind:'mesh' } | { kind:'detail'; id } | { kind:'map'; rootIds }`,
  mapped to/from `window.location.hash` by `parseHash` / `viewToHash`.
- **`data/catalog.ts`** holds `CatalogIndex`: forward + reverse adjacency over
  the resolved dependency graph, external stub synthesis, and ego/neighborhood
  BFS:
  - `egoSet(roots, mode, depth)` / private `neighborhood(roots, mode, depth)` —
    multi-source BFS returning `{ nodes:Set<string>, edges:Edge[] }` under a
    `MapMode` (`'dependencies'|'dependants'|'both'`) and a hop `depth` (`0` =
    unbounded).
  - `dependenciesOf` / `dependantsOf` / `dependencyCount` / `dependantCount`.
  - `Edge = { from, to, dep: Dependency }`; `Dependency` carries
    `interaction` and `critical`.
- **`graph/build.ts`** turns index subgraphs into cytoscape `ElementDefinition[]`
  (`buildMeshElements`, `buildSubgraphElements`) — Mesh/Map specific, **not**
  reused by Flow.
- **`components/MeshView.tsx`** is the closest structural sibling: a view shell
  with a "slice by" + direction + reach control bar, a canvas, a legend, and
  Mermaid/CSV export buttons. Flow's shell mirrors this.
- **`components/GraphCanvas.tsx`** wraps cytoscape with a hover focus-dim /
  neighbor-highlight pattern. Flow's canvas is SVG (not cytoscape) but mirrors
  the hover-to-isolate interaction.
- **Exports**: `MermaidExport({ title, filename, code, onClose })` and
  `CsvExport({ index, services, title, filename, onClose })` are generic modals;
  `graph/mermaid.ts` exposes `toMermaid(...)`.
- **Stack**: React 19, TypeScript, Vite, Vitest + RTL + jsdom. No d3. All SVG is
  hand-rolled (icons, brand glyph, mermaid). Bespoke dark "observatory" theme in
  `theme.css` with token CSS vars (`--accent`, `--signal-crit/-warn/-ok`,
  `--blue-*`, `--slate-*`, `--font-mono`, …).

## Locked design decisions

| Decision | Choice |
|---|---|
| What flows | Dependency edges — who calls whom |
| Layout | Rooted/ego; columns = hop-distance from focus; downstream→right, upstream→left |
| Nodes | Individual services + external stubs |
| Thickness | Flow-weighted (blast radius) |
| Cycles | Ghost re-entry |
| Default color | Criticality; toggle: Criticality / Interaction / Branch |
| Default depth | 2 |
| Library | Custom layout (reuse `CatalogIndex` BFS) + hand-rolled SVG; no new deps |

## Layout algorithm — `graph/flow.ts`

A pure, framework-free, unit-tested module (sibling to `graph/build.ts`).

### Public API

```ts
export interface FlowNode {
  id: string;            // serviceId, or ghost id (see ghosts)
  realId: string;        // serviceId this node/ghost represents (reroot target)
  label: string;         // display name (index name, or titleized external)
  column: number;        // hop offset: 0 = focus, +n downstream, -n upstream
  isExternal: boolean;
  isGhost: boolean;
  // geometry, filled by the layout:
  x: number; y0: number; y1: number;  // rect: [x, x+NODE_W] × [y0, y1]
}

export interface FlowLink {
  source: string;        // FlowNode.id
  target: string;        // FlowNode.id
  edge: Edge;            // the underlying dependency Edge (dep, critical, interaction)
  weight: number;        // flow weight (≥ 1)
  branch: string;        // first-hop ancestor realId on the focus side (for color-by-branch)
  isBackEdge: boolean;   // true when target is a ghost (cycle/back-edge)
  // geometry, filled by the layout:
  sy0: number; sy1: number; ty0: number; ty1: number;
}

export interface FlowColumn { column: number; nodes: FlowNode[]; }

export interface FlowLayout {
  rootId: string;
  columns: FlowColumn[];     // sorted ascending by column index (left→right)
  nodes: FlowNode[];
  links: FlowLink[];
  truncated: number;         // count of nodes hidden by per-column caps
}

export function buildFlowLayout(
  index: CatalogIndex,
  rootId: string,
  opts: { mode: MapMode; depth: Depth; width: number; height: number; nodeCap?: number },
): FlowLayout;
```

`MapMode` and `Depth` are reused from `types.ts` (`Depth`: `1 | 2 | 0`, `0` =
all hops). Geometry is computed inside the module so `SankeyCanvas` is a dumb
renderer; `width`/`height` are the SVG viewport.

### Step 1 — Layering (hop assignment)

BFS outward from `rootId` in the active direction(s), assigning each first-seen
service its **shortest hop distance** as a signed column:

- `downstream` → forward adjacency, columns `0, +1, +2, …`.
- `upstream` → reverse adjacency, columns `0, -1, -2, …`.
- `both` → run downstream and upstream independently from the root; the root is
  the single shared node at column 0.

Stop at `depth` hops (`depth === 0` ⇒ unbounded). This reuses the existing BFS
logic in `CatalogIndex.neighborhood`; we add a variant that also returns the
**hop distance per node** (the current one returns only the visited set). Either
extend `neighborhood` to optionally emit a `distance: Map<string, number>`, or
add `layeredEgo(rootId, mode, depth)` next to it. Externals are valid nodes and
always terminal (no outgoing).

### Step 2 — Edge classification & ghosting

For each dependency edge between two in-scope services, in the active
direction(s), classify by the columns of its endpoints (downstream framing;
upstream is mirrored):

- **Forward** (`target.column === source.column + 1`, or a deeper layer): draw a
  normal band `source → target`.
- **Cross-layer forward** (`target.column > source.column + 1`): a normal band
  that visually spans multiple columns (e.g. `payments → stripe` skipping a
  column). Allowed.
- **Back-edge / same-layer / cycle** (`target.column <= source.column`):
  introduce a **ghost** node — a duplicate of `target` placed at
  `source.column + 1`, with `isGhost: true`, `realId = target`, id
  `${target}__ghost@${source.column + 1}` (de-duplicated if several edges land
  on the same ghost slot). The band draws `source → ghost` normally
  (`isBackEdge: true`). Ghosts are **terminal**: they never emit outgoing edges,
  so cycles cannot expand infinitely.

Self-dependency (`root → root`) and root re-entry (`X → root` with `root` at
column 0) are handled by the same ghost rule.

### Step 3 — Flow weights (blast radius)

Over the now-acyclic, layered DAG, compute per node a **reach set** =
the distinct real service ids reachable outward from that node within the
remaining depth window, including itself; ghosts and externals have
`reach = { realId }` (terminal). Then:

- `weight(u → v) = |reach(v)|` (floor 1).
- `node height ∝ max(Σ incoming weights, Σ outgoing weights)`.
- Root height (downstream side) `∝ Σ outgoing weights`.

Computed by memoized DFS on the layered DAG (no cycles after ghosting → safe).
For `both`, weights are computed **independently per side** (downstream reach for
right columns, upstream reach for left columns).

**This is an explainable heuristic, not conserved flow.** Shared/merge nodes
make in-sum ≠ out-sum; `max(in, out)` for node height is the chosen reconciliation.
Documented here so implementers don't try to "fix" conservation.

### Step 4 — Geometry

Standard Sankey packing, computed in-module:

- **Columns**: sort by signed column index; x-position = even horizontal spread
  across `width` with margins for left/right labels. `NODE_W` ≈ 13px.
- **Vertical packing**: within each column, scale node heights by a single
  figure-wide `value→px` scale (`usable_height / maxColumnTotal`), stack with a
  fixed gap, vertically center the column. (Same approach proven in the
  brainstorming mockups.)
- **Band endpoints**: for each node track an outgoing y-cursor (`oOff`, from
  `y0`) and incoming y-cursor (`iOff`, from `y0`); each link consumes
  `weight × scale` px on both ends. Link ribbon is the cubic-bezier band between
  `[sy0,sy1]` on the source's right edge and `[ty0,ty1]` on the target's left
  edge.
- **Node ordering within a column**: order to reduce crossings — minimally, sort
  by the mean y of connected nodes in the previous column (single-pass
  barycenter). Acceptable for catalog scale.

### Step 5 — Caps (oversized fan-out)

`nodeCap` (default e.g. 24 per column) bounds runaway columns. When a column
exceeds the cap, keep the highest-weight nodes, drop the rest, and report the
dropped count in `FlowLayout.truncated`. The view renders a "+N more" affordance
(see States). Never silently truncate — surface the count.

## Color schemes — `graph/flowColor.ts` (or co-located)

A pure `linkColor(link, scheme)` mapping, plus a small legend descriptor:

- **Criticality (default)**: `link.edge.dep.critical` → hot (`--signal-crit`);
  else muted (`--slate-500`/`--text-lo`).
- **Interaction**: by `link.edge.dep.interaction` — a stable palette
  (sync-http = blue, async-event = green, s3 = amber, plus distinct hues for
  `grpc/soap/sftp/batch/fdw/dms/infrastructure/async-http`). Reuse/extend any
  existing interaction palette from the legend.
- **Branch**: hash `link.branch` (first-hop ancestor on the focus side) to a
  categorical hue; inherited by all descendant links of that branch.

Nodes render in a neutral slate; **bands carry color**. Ghost nodes render
faded (dashed outline, low fill opacity) regardless of scheme.

## Components

### `components/FlowView.tsx` (view shell — parallels `MeshView.tsx`)

Owns local UI state: `mode: MapMode` (default `'dependencies'`),
`depth: Depth` (default `2`), `colorScheme` (default `'criticality'`), export
toggles. Props: `{ index: CatalogIndex; rootId: string; onReroot: (id) => void; onOpenDetail?: (id) => void }`.

Renders:
- A header with stats (focus name, node/edge/hop counts) and Mermaid/CSV export
  buttons (mirrors `mesh__head`).
- A control bar: **focus picker** (searchable select over `index.services`),
  **Direction** segmented (`Downstream/Upstream/Both`), **Depth** segmented
  (`1/2/All`), **Color by** segmented (`Criticality/Interaction/Branch`).
  Reuse the mesh's `modeseg` / `depthseg` / `segbtn` CSS classes.
- `<SankeyCanvas>` + a small legend reflecting the active color scheme.
- Export modals (reused `MermaidExport`, `CsvExport`).

`buildFlowLayout` is memoized on `(rootId, mode, depth, size)`.

### `components/SankeyCanvas.tsx` (renderer — parallels `GraphCanvas.tsx`)

Pure SVG renderer of a `FlowLayout`. Responsibilities:

- Draw bands (`<path>` ribbons, colored via the active scheme, ghost/back-edge
  bands visually distinct), nodes (`<rect>`, ghosts faded), and labels
  (left-anchored for the leftmost column, right-anchored for the rightmost,
  above-node for middle columns — proven in mockups).
- **Hover**: dim everything except the hovered node and its connected
  path/subtree (mirror the mesh focus-dim/neighbor pattern). Tooltip with name,
  hop distance, in/out degree, weight.
- **Click**: node or ghost → `onReroot(node.realId)`. Externals are non-reroot
  leaves (no catalog record) → tooltip only.
- **Pan/zoom**: simple `transform` (translate+scale) with the same
  fit/zoom-in/zoom-out controls vocabulary as `GraphCanvas` (`FitIcon`, etc.).
  Resize-aware via `ResizeObserver`, re-laying out on container size change.

Container size feeds `width`/`height` into `buildFlowLayout` so geometry tracks
the viewport.

## Routing — `data/routing.ts`

Extend the union and (de)serialization:

```ts
export type AppView =
  | { kind: 'catalog' }
  | { kind: 'mesh' }
  | { kind: 'detail'; id: string }
  | { kind: 'map'; rootIds: string[] }
  | { kind: 'flow'; rootId: string };   // NEW
```

- `parseHash`: `#/f/<id>` → `{ kind:'flow', rootId }`; empty id → `catalog`.
- `viewToHash`: `{ kind:'flow' }` → `#/f/<id>`.
- Update `routing.test.ts` to cover round-trips and the empty-id fallback.

## App wiring — `App.tsx`, `TopBar.tsx`

- **`TopBar`**: add a **Flow** tab. `TopBar`'s `View` type currently
  (`'catalog' | 'mesh'`) and `onView` widen to include `'flow'`; the active-tab
  highlight reflects `view.kind === 'flow'`. Use a Sankey-ish icon (new entry in
  `icons.tsx`).
- **`App`**: add an `openFlow(id)` callback (`setView({ kind:'flow', rootId:id })`)
  and a render branch for `view.kind === 'flow'` that mounts `FlowView` with a
  back button + breadcrumb (mirror the map branch). Validate the focus id
  against `index.byId` (only catalogued services can be a focus; otherwise fall
  back to catalog or the busiest hub).
- **Entry points**: where the Map action is offered today (`ServiceCard`
  `onMapView`, the detail page), add a parallel **Flow** affordance (e.g. a
  "Flow" icon-button). Opening Flow with **no/invalid focus** defaults to the
  highest-degree hub (`max(dependencyCount + dependantCount)`), shown via the
  focus picker so the user can change it.
- **`lastTopView`**: include `'flow'` so back-navigation returns correctly
  (extend the existing `lastTopView` machinery, which today tracks
  `'catalog' | 'mesh'`).

## Exports

- **Mermaid**: add `toMermaidSankey(layout)` to `graph/mermaid.ts` emitting a
  `sankey-beta` diagram (`source,target,value` rows) from the `FlowLayout`
  links. Ghost targets render under a `"<name> (loop)"` label. Reuse the
  `MermaidExport` modal.
- **CSV**: export the **edge list** of the current flow (`source, target,
  interaction, critical, weight, hop`). The existing `CsvExport` is
  service-row-oriented; for Flow we either (a) pass a flow-specific row set
  through a thin adapter, or (b) add a minimal edge-list CSV path. Prefer a small
  dedicated edge-list export to avoid overloading `CsvExport`'s service schema.

## Interaction summary

- Click node/ghost → reroot. Click external → tooltip only.
- Hover → isolate connected path/subtree + tooltip.
- Direction / Depth / Color-by segmented controls re-layout in place.
- Focus picker (search) changes the root.
- Pan/zoom/fit on the canvas.
- Mermaid / CSV export of the current flow.

## States

- **Empty downstream** (focus is a leaf, `downstream` mode): hint to switch
  direction or depth ("clearing has no downstream dependencies — try Upstream").
- **Oversized fan-out**: per-column cap + "+N more" indicator; default depth 2
  keeps the common case bounded.
- **External focus attempt**: prevented — only catalogued ids are valid focuses
  (parallels the map's `rootIds.filter(index.byId.has)`).
- **Loading/error**: inherited from `App` (Flow only mounts on a loaded index).

## Testing

- **`graph/flow.test.ts`** (the core; characterization-style like
  `graph/build.test.ts`):
  - Layering: nodes get correct signed columns for `downstream` / `upstream` /
    `both`; shortest-distance wins when multiple paths exist.
  - Depth: `1` / `2` / `All` bound the node set correctly.
  - Ghosting: a known cycle (`A→B→A`) produces a terminal ghost at the right
    column; ghost has `realId = A`, `isGhost`, `isBackEdge` on the closing link;
    no infinite expansion.
  - Cross-layer edges stay single bands.
  - Flow-weight: leaves weigh 1; a trunk weighs ≥ its subtree size; weight is
    monotonic non-increasing along a path.
  - Externals are terminal leaves.
  - Caps: a fan-out beyond `nodeCap` reports `truncated > 0` and keeps the
    heaviest nodes.
- **`data/routing.test.ts`**: `#/f/<id>` round-trips; empty id → catalog.
- **`components/FlowView` smoke test** (RTL): renders for a fixture focus,
  shows controls, clicking a node calls `onReroot`, switching direction/depth
  re-renders. Use/extend `test/fixtures.ts`.
- **`graph/flowColor`**: each scheme maps a known link to the expected token.

Match the existing vitest + RTL + jsdom harness; no snapshot-only tests.

## Edge cases

- Self-dependency and direct root re-entry → ghost.
- Disconnected focus (no edges either direction) → empty-state hint.
- Diamond / shared downstream node (DAG merge) → single node, multiple incoming
  bands; non-conserving thickness is expected (documented).
- Externals appear only as leaves; never a focus.
- Very deep chains at `depth: All` → bounded by caps + the finite catalog.

## Out of scope / future

- Multi-root flow.
- Global caller→callee matrix Sankey.
- Group-level (product/team) flow nodes.
- Animated reroot transitions.
- Encoding direction/depth/color in the hash.

## Module/file checklist

- `web/src/graph/flow.ts` — layout (new)
- `web/src/graph/flow.test.ts` — tests (new)
- `web/src/graph/flowColor.ts` — color schemes + legend descriptor (new)
- `web/src/components/FlowView.tsx` — view shell (new)
- `web/src/components/SankeyCanvas.tsx` — SVG renderer (new)
- `web/src/data/routing.ts` — `flow` view kind (edit)
- `web/src/data/routing.test.ts` — coverage (edit)
- `web/src/graph/mermaid.ts` — `toMermaidSankey` (edit)
- `web/src/components/TopBar.tsx` — Flow tab + widened `View` (edit)
- `web/src/components/icons.tsx` — Flow/Sankey icon (edit)
- `web/src/App.tsx` — render branch, `openFlow`, entry points, `lastTopView` (edit)
- `web/src/components/ServiceCard.tsx` / `ServiceDetail.tsx` — Flow affordance (edit)
- `web/src/app.css` / `theme.css` — Flow view + Sankey styles (edit)
