# Hide non-critical dependencies — design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

The graph views (Map, Mesh, Flow) draw every dependency edge. A service's
topology is dominated by incidental, non-critical links, which bury the
critical-path backbone an operator actually cares about during an incident or a
blast-radius review. We want a control that hides non-critical dependencies so
only the critical skeleton remains.

## Decisions (locked)

1. **"Non-critical" = the per-edge `Dependency.critical` flag.** Hide edges where
   `critical === false`. This is the field that already drives thick/colored
   critical edge styling, the map's "N critical" stat, the Sankey hot/muted
   colors, and the Mermaid `==>` arrows. It is *not* the target service's
   `criticalityTier`. Data is well populated: 180 `critical: true` vs 61
   `critical: false` across the catalog.
2. **Scope: Map + Mesh + Flow** — matches the reach of the existing
   Infrastructure toggle so both controls sit side by side everywhere and the
   choice persists across views.
3. **Drop orphaned nodes** — filter at the index level (like
   `withoutInfrastructure`). The BFS-driven views drop unreachable nodes for
   free; the full mesh prunes zero-degree nodes explicitly (see §Full mesh).
4. **Index composition: lazy compose + cache (Approach B).** `useCatalog`
   exposes the raw catalog plus the full `index`; the graph index for any
   filter combination is built on demand and memoized.
5. **Full mesh: prune zero-degree nodes** when the critical filter is active, so
   "drop them" holds in every view. Default behavior (filter off) is untouched.

## Architecture

### 1. Data filter — `criticalOnly` (`web/src/data/catalog.ts`)

A pure transform, sibling to `withoutInfrastructure`:

```ts
/**
 * Returns a copy of the catalog with every non-critical dependency edge
 * (`critical === false`) stripped from every service. Service records are
 * untouched — only edges are removed. Stripping the edges (rather than hiding
 * them later) is what keeps the index constructor from synthesizing phantom
 * external stubs for targets that were only reached non-critically.
 *
 * Pure + cheap: returns the original catalog unchanged when no service has a
 * non-critical dependency.
 */
export function criticalOnly(catalog: Catalog): Catalog
```

Behavior:
- For each service, drop `dependencies` entries with `critical === false`.
- Reuse the same object when a service has no non-critical deps (minimize churn,
  mirror `withoutInfrastructure`'s shape).
- Return the original `catalog` reference when nothing is stripped.
- `count` is unchanged (no services removed).

Why this is enough for orphan-dropping in the BFS views: Map, Mesh-slice, and
Flow all compute their visible node set by BFS over the index
(`egoSet` / `induced` / flow traversal). A node reachable only via a
now-removed edge is never visited, so it vanishes — no extra logic needed.

### 2. Index composition — Approach B (`web/src/data/useCatalog.ts` + `App.tsx`)

There are now two independent boolean filters (infrastructure, critical) → up to
four index combinations. Build them lazily and cache by combo.

`useCatalog` change:
- `ready` state exposes `{ catalog, index }` where `index` is the full
  `CatalogIndex` (still used everywhere for `byId`, facets, detail pages,
  `busiestHub`, etc.). Drop the eagerly-built `indexNoInfra`.
- Keep `refetch`, loading/error states unchanged.

`App.tsx` graph-index selection:
- New helper composes filters and memoizes by combo key:

```ts
// Cache rebuilt whenever the catalog itself changes (refetch). Seed it with the
// already-built full index so the no-filter combo is never rebuilt.
const graphIndexCache = useMemo(
  () => new Map<string, CatalogIndex>([['false:false', index]]),
  [catalog, index],
);

function graphIndex(dropInfra: boolean, dropNonCritical: boolean): CatalogIndex {
  const key = `${dropInfra}:${dropNonCritical}`;
  let idx = graphIndexCache.get(key);
  if (!idx) {
    const filters: Array<(c: Catalog) => Catalog> = [];
    if (dropInfra) filters.push(withoutInfrastructure);
    if (dropNonCritical) filters.push(criticalOnly);
    idx = new CatalogIndex(filters.reduce((c, f) => f(c), catalog));
    graphIndexCache.set(key, idx);
  }
  return idx;
}
```

- Per-view selection (the critical filter needs **no root guard** — the BFS root
  is always kept even if all its edges are non-critical, so it only enters as a
  uniform `!showNonCritical`):

```ts
const dropNonCritical = !showNonCritical;
const meshIndex = graphIndex(!showInfrastructure, dropNonCritical);
const mapIndex  = graphIndex(!showInfrastructure && !mapRootIds.some(isInfra), dropNonCritical);
const flowIndex = graphIndex(!showInfrastructure && !isInfra(flowRootId), dropNonCritical);
```

This preserves the existing infra root-guard semantics exactly while layering the
critical filter on top.

New App state, lifted alongside `showInfrastructure` so it persists across views:

```ts
const [showNonCritical, setShowNonCritical] = useState(true); // shown by default
const toggleNonCritical = useCallback(() => setShowNonCritical((v) => !v), []);
```

### 3. Full mesh zero-degree pruning (`web/src/graph/build.ts` + `MeshView.tsx`)

The unsliced mesh (`buildMeshElements`) adds every service + external node
regardless of edges, so the BFS-orphan-drop does not apply there. Gate a prune
on the active filter:

```ts
export function buildMeshElements(
  index: CatalogIndex,
  opts?: { pruneIsolated?: boolean },
): ElementDefinition[]
```

- When `pruneIsolated` is true, derive the node set from the endpoints of
  `index.allEdges` instead of from all services — services with no remaining
  edge are excluded. (With the critical filter active, `index.allEdges` already
  contains only critical edges, so this drops exactly the services left
  edgeless.)
- When false/absent: current behavior unchanged (all services shown).
- `MeshView` passes `pruneIsolated: !showNonCritical` only on the full-mesh path
  (`!neighborhood`). The slice path already uses BFS node sets and needs nothing.

Note: pruning is gated on the **critical** filter, not infra — infra removes
service *records* from the index entirely, so those are already gone.

### 4. UI — `GraphToggle` + critical toggle

Generalize the 14-line `InfraToggle` into a reusable presentational component to
avoid duplicating it:

```ts
// web/src/components/GraphToggle.tsx
export function GraphToggle({
  on, onToggle, icon, label, titleOn, titleOff,
}: {
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  titleOn: string;   // shown when on (i.e. action = hide)
  titleOff: string;  // shown when off (i.e. action = show)
}) { /* button.graphtoggle[--on], aria-pressed=on */ }
```

- `InfraToggle` becomes a thin wrapper (or is replaced at call sites) rendering
  `GraphToggle` with `ServerIcon` / label "Infrastructure".
- New critical toggle renders `GraphToggle` with a new `BoltIcon` / label
  **"Non-critical"**, `on={showNonCritical}` (default on), pressed = shown —
  exactly parallel to Infrastructure's include/exclude mechanic. Turning it off
  hides non-critical deps. `titleOn = "Hide non-critical dependencies"`,
  `titleOff = "Show non-critical dependencies"`.
- CSS: introduce a `.graphtoggle` / `.graphtoggle--on` base by migrating the
  existing `.infratoggle` rules in `app.css`; keep visuals identical.

New icon in `web/src/components/icons.tsx`:

```ts
export const BoltIcon = (p) => ( /* lightning glyph, matches the thin stroke set */ );
```

Lightning connotes the critical/hot backbone, matching the Sankey's
`CRIT_HOT` color language.

Placement — render the critical toggle immediately after the Infrastructure
toggle in all three views:
- `DependencyMap.tsx` — after the `InfraToggle` in `.mapbar`.
- `MeshView.tsx` — in the `marginLeft:auto` cluster, after `InfraToggle`.
- `FlowView.tsx` — wherever `InfraToggle` currently renders.

Each view gains props `showNonCritical: boolean` and `onToggleNonCritical: () => void`,
passed from App alongside the existing `showInfra` / `onToggleInfra`.

## No-touch (works for free)

- **Exports** (Mermaid, CSV) consume the passed `index` / edge list, so they
  reflect the filter automatically — desirable: the export matches what's on
  screen.
- **Map "N critical" stat** stays meaningful (when filtering, edge count ==
  critical count).
- **No Legend change** — the filter removes edges, introduces no new node style.

## Known nuances (accepted)

- **Flow root with only non-critical edges:** BFS over the critical-only index
  yields just the root → empty Sankey. FlowView already handles the empty case;
  same outcome as a service with no critical deps. Acceptable.
- **Flow color legend** lists both `critical` / `non-critical` swatches even when
  the filter leaves only critical links visible. Minor; the legend documents the
  color scheme, not the current contents. Left as-is.

## Testing

`web/src/data/catalog.test.ts` (mirror the `withoutInfrastructure` block):
- strips non-critical edges, keeps all service records and `count`;
- the rebuilt `CatalogIndex` has no edge with `critical === false`;
- leaves no phantom external stub for a target only reached non-critically;
- returns the catalog unchanged when no non-critical dep exists (identity);
- composes with `withoutInfrastructure` (both filters applied → infra gone AND
  non-critical edges gone).

`web/src/graph/build.test.ts` (or alongside existing build tests):
- `buildMeshElements(index, { pruneIsolated: true })` omits a service that has no
  edges; the same call without the flag includes it.

`GraphToggle`:
- renders label + reflects `aria-pressed` from `on`; click calls `onToggle`;
  title switches on `on`.

App-level (if an infra-toggle App/integration test exists, mirror it):
- toggling `showNonCritical` selects an index whose graph excludes non-critical
  edges; combined with the infra toggle, picks the doubly-filtered index.

## Files touched

- `web/src/data/catalog.ts` — add `criticalOnly`.
- `web/src/data/catalog.test.ts` — tests.
- `web/src/data/useCatalog.ts` — expose `{ catalog, index }`; drop eager `indexNoInfra`.
- `web/src/App.tsx` — `showNonCritical` state, `graphIndex` cache/selector, pass props.
- `web/src/graph/build.ts` — `buildMeshElements` `pruneIsolated` option.
- `web/src/graph/build.test.ts` — prune test.
- `web/src/components/GraphToggle.tsx` — new generic toggle.
- `web/src/components/InfraToggle.tsx` — re-implement via `GraphToggle` (or remove, updating call sites).
- `web/src/components/icons.tsx` — `BoltIcon`.
- `web/src/components/DependencyMap.tsx`, `MeshView.tsx`, `FlowView.tsx` — render critical toggle, thread props; MeshView passes `pruneIsolated`.
- `web/src/app.css` — `.graphtoggle` base (migrate `.infratoggle`).
