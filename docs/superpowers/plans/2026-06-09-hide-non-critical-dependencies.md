# Hide Non-Critical Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle to the Map, Mesh, and Flow graph views that hides non-critical dependencies, leaving only the critical-path backbone.

**Architecture:** A pure catalog transform `withoutNonCritical` strips `critical === false` edges; the BFS-driven views drop orphaned nodes for free, and the full mesh prunes zero-degree nodes explicitly. App composes the infra + critical filters lazily into a per-combo cached `CatalogIndex`. A reusable `GraphToggle` backs both the existing Infrastructure toggle and the new "Critical only" toggle.

**Tech Stack:** React + TypeScript, Vitest, Testing Library, Cytoscape (graph), Vite.

**Spec:** `docs/superpowers/specs/2026-06-09-hide-non-critical-dependencies-design.md`

**Naming refinements vs spec (intentional):**
- Filter function is named **`withoutNonCritical`** (not `criticalOnly`) for symmetry with `withoutInfrastructure` and to avoid clashing with the App state.
- App state is **`criticalOnly`** (boolean, default `false` = filter off / everything shown). The toggle is highlighted when the filter is *active*, default un-highlighted — cleaner than a perpetually-lit "shown" state.

**All commands run from the `web/` directory** (e.g. `cd web` first). The repo root is `/home/steve/availity/service-catalog`.

---

## File Structure

- `web/src/data/catalog.ts` — add `withoutNonCritical` next to `withoutInfrastructure`.
- `web/src/data/catalog.test.ts` — tests for `withoutNonCritical`.
- `web/src/graph/build.ts` — `buildMeshElements` gains a `{ pruneIsolated }` option.
- `web/src/graph/build.test.ts` — prune test.
- `web/src/components/icons.tsx` — add `BoltIcon`.
- `web/src/theme.css` — add `--critical` color token.
- `web/src/components/GraphToggle.tsx` — new generic toggle (presentational).
- `web/src/components/GraphToggle.test.tsx` — toggle tests.
- `web/src/components/InfraToggle.tsx` — re-implement via `GraphToggle`.
- `web/src/components/CriticalToggle.tsx` — new wrapper via `GraphToggle`.
- `web/src/app.css` — migrate `.infratoggle` rules to `.graphtoggle` + per-tone `--on`.
- `web/src/data/useCatalog.ts` — expose `{ index, catalog }`; drop eager `indexNoInfra`.
- `web/src/App.tsx` — `criticalOnly` state, lazy `graphIndex` cache/selector, thread props.
- `web/src/components/DependencyMap.tsx`, `MeshView.tsx`, `FlowView.tsx` — render `CriticalToggle`, thread props; MeshView passes `pruneIsolated`.
- `web/src/components/FlowView.test.tsx` — update render calls for new required props.

---

## Task 1: `withoutNonCritical` catalog filter

**Files:**
- Modify: `web/src/data/catalog.ts` (add after `withoutInfrastructure`, ~line 187)
- Test: `web/src/data/catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `web/src/data/catalog.test.ts`. First add a critical-edge helper near the existing `dep` helper (top of file, after the existing `function dep`):

```ts
function critDep(serviceId: string): Dependency {
  return { serviceId, interaction: 'sync-http', critical: true, purpose: 'test', external: false };
}
```

Update the import on line 3 to include the new function:

```ts
import { CatalogIndex, withoutInfrastructure, withoutNonCritical } from './catalog';
```

Then append this describe block at the end of the file:

```ts
describe('withoutNonCritical', () => {
  // a -> b (non-critical), a -> c (critical), c -> ext-x (non-critical).
  // Filtering keeps only a -> c; b and ext-x become unreferenced.
  function mixedCatalog(): Catalog {
    const services = [
      makeService({ serviceId: 'a', dependencies: [dep('b'), critDep('c')] }),
      makeService({ serviceId: 'b' }),
      makeService({ serviceId: 'c', dependencies: [dep('ext-x')] }),
    ];
    return { generatedFrom: 'test', count: services.length, services };
  }

  it('keeps every service record and the count', () => {
    const pruned = withoutNonCritical(mixedCatalog());
    expect(pruned.services.map((s) => s.serviceId).sort()).toEqual(['a', 'b', 'c']);
    expect(pruned.count).toBe(3);
  });

  it('strips every non-critical edge, keeping only critical ones', () => {
    const index = new CatalogIndex(withoutNonCritical(mixedCatalog()));
    expect(index.allEdges).toHaveLength(1);
    expect(index.allEdges.every((e) => e.dep.critical)).toBe(true);
    expect(index.dependenciesOf('a').map((e) => e.to)).toEqual(['c']); // a -> b gone
  });

  it('leaves no phantom external stub for a target only reached non-critically', () => {
    const index = new CatalogIndex(withoutNonCritical(mixedCatalog()));
    expect(index.externals.has('ext-x')).toBe(false); // c -> ext-x was non-critical
  });

  it('returns the catalog unchanged when nothing is non-critical', () => {
    const services = [makeService({ serviceId: 'a', dependencies: [critDep('b')] })];
    const catalog: Catalog = { generatedFrom: 'test', count: 1, services };
    const pruned = withoutNonCritical(catalog);
    expect(pruned).toBe(catalog); // same reference
  });

  it('composes with withoutInfrastructure', () => {
    // a -> infra-b (critical), a -> c (non-critical). Both filters: drop infra-b
    // node AND the non-critical a -> c edge, leaving just node a (+ c) no edges.
    const services = [
      makeService({ serviceId: 'a', dependencies: [critDep('infra-b'), dep('c')] }),
      makeService({ serviceId: 'infra-b', infrastructure: true }),
      makeService({ serviceId: 'c' }),
    ];
    const catalog: Catalog = { generatedFrom: 'test', count: 3, services };
    const index = new CatalogIndex(withoutNonCritical(withoutInfrastructure(catalog)));
    expect(index.byId.has('infra-b')).toBe(false);
    expect(index.allEdges).toHaveLength(0); // critical edge pointed at removed infra; non-critical stripped
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/data/catalog.test.ts`
Expected: FAIL — `withoutNonCritical` is not exported / not a function.

- [ ] **Step 3: Implement `withoutNonCritical`**

Add to `web/src/data/catalog.ts` immediately after the `withoutInfrastructure` function (after line ~187):

```ts
/**
 * Returns a copy of the catalog with every non-critical dependency edge
 * (`critical !== true`) stripped from every service. Service records are
 * untouched — only edges are removed. Stripping the edges (rather than hiding
 * them downstream) keeps the index constructor from synthesizing phantom
 * external stubs for targets that were only reached non-critically.
 *
 * Pure + cheap: returns the original catalog unchanged when no service has a
 * non-critical dependency.
 */
export function withoutNonCritical(catalog: Catalog): Catalog {
  const hasNonCritical = catalog.services.some((s) =>
    s.dependencies?.some((d) => d.critical !== true),
  );
  if (!hasNonCritical) return catalog;

  const services = catalog.services.map((s) =>
    s.dependencies?.some((d) => d.critical !== true)
      ? { ...s, dependencies: s.dependencies.filter((d) => d.critical === true) }
      : s,
  );

  return { ...catalog, services };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/data/catalog.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
cd web && git add src/data/catalog.ts src/data/catalog.test.ts
git commit -m "feat(web): withoutNonCritical catalog filter"
```

---

## Task 2: `buildMeshElements` zero-degree pruning

**Files:**
- Modify: `web/src/graph/build.ts:96-101` (`buildMeshElements`)
- Test: `web/src/graph/build.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `web/src/graph/build.test.ts`. Add `buildMeshElements` to the import on line 3:

```ts
import { buildSubgraphElements, buildMeshElements } from './build';
```

Then add this describe block (the `makeIndex` fixture's graph is `a -> b -> c -> ext-x` plus an isolated service `d`):

```ts
describe('buildMeshElements pruneIsolated', () => {
  it('includes the edgeless service by default', () => {
    const els = buildMeshElements(makeIndex());
    expect(nodeById(els, 'd')).toBeDefined(); // 'd' has no edges but still shows
  });

  it('drops zero-degree service nodes when pruneIsolated is set', () => {
    const els = buildMeshElements(makeIndex(), { pruneIsolated: true });
    expect(nodeById(els, 'd')).toBeUndefined(); // 'd' has no edges -> pruned
    expect(nodeById(els, 'a')).toBeDefined();   // 'a' still has the a -> b edge
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/graph/build.test.ts`
Expected: FAIL — `buildMeshElements` does not accept a second argument / `d` still present.

- [ ] **Step 3: Implement the option**

Replace `buildMeshElements` in `web/src/graph/build.ts` (lines 96-101):

```ts
/** Full mesh: every catalogued service + external stub, all edges. With
 *  `pruneIsolated`, nodes are taken from the surviving edges instead of from
 *  every service — so services left edgeless by an active edge filter (e.g.
 *  hide non-critical) drop out. */
export function buildMeshElements(
  index: CatalogIndex,
  opts: { pruneIsolated?: boolean } = {},
): ElementDefinition[] {
  const ids = new Set<string>();
  if (opts.pruneIsolated) {
    for (const e of index.allEdges) {
      ids.add(e.from);
      ids.add(e.to);
    }
  } else {
    for (const s of index.services) ids.add(s.serviceId);
    for (const id of index.externals.keys()) ids.add(id);
  }
  return buildSubgraphElements(index, ids, index.allEdges);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/graph/build.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/graph/build.ts src/graph/build.test.ts
git commit -m "feat(web): buildMeshElements pruneIsolated option"
```

---

## Task 3: `GraphToggle` component, `BoltIcon`, `CriticalToggle`, CSS

**Files:**
- Modify: `web/src/components/icons.tsx` (add `BoltIcon` at end)
- Modify: `web/src/theme.css` (add `--critical` token near `--infra`, line ~51)
- Create: `web/src/components/GraphToggle.tsx`
- Create: `web/src/components/GraphToggle.test.tsx`
- Modify: `web/src/components/InfraToggle.tsx` (re-implement via `GraphToggle`)
- Create: `web/src/components/CriticalToggle.tsx`
- Modify: `web/src/app.css` (rename `.infratoggle` → `.graphtoggle`, per-tone `--on`)

- [ ] **Step 1: Write the failing GraphToggle test**

Create `web/src/components/GraphToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphToggle } from './GraphToggle';

describe('GraphToggle', () => {
  function setup(on: boolean, onToggle = () => {}) {
    return render(
      <GraphToggle
        on={on}
        onToggle={onToggle}
        icon={<svg data-testid="ico" />}
        label="Critical only"
        titleOn="Show all dependencies"
        titleOff="Hide non-critical dependencies"
        tone="critical"
      />,
    );
  }

  it('reflects pressed state and on-title when on', () => {
    setup(true);
    const btn = screen.getByRole('button', { name: /critical only/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveAttribute('title', 'Show all dependencies');
    expect(btn.className).toContain('graphtoggle--on');
    expect(btn.className).toContain('graphtoggle--critical');
  });

  it('shows off-title and is not pressed when off', () => {
    setup(false);
    const btn = screen.getByRole('button', { name: /critical only/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveAttribute('title', 'Hide non-critical dependencies');
    expect(btn.className).not.toContain('graphtoggle--on');
  });

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn();
    setup(false, onToggle);
    await userEvent.click(screen.getByRole('button', { name: /critical only/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/GraphToggle.test.tsx`
Expected: FAIL — cannot find module `./GraphToggle`.

- [ ] **Step 3: Create `GraphToggle`**

Create `web/src/components/GraphToggle.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * Generic include/exclude pill shared by the graph views (Infrastructure,
 * Critical-only). `on` drives the highlighted/pressed state; `tone` selects the
 * accent color of the highlighted state.
 */
export function GraphToggle({
  on,
  onToggle,
  icon,
  label,
  titleOn,
  titleOff,
  tone = 'infra',
}: {
  on: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
  /** hover hint shown when `on` (the toggle is active) */
  titleOn: string;
  /** hover hint shown when `off` */
  titleOff: string;
  tone?: 'infra' | 'critical';
}) {
  return (
    <button
      type="button"
      className={`graphtoggle graphtoggle--${tone}${on ? ' graphtoggle--on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      title={on ? titleOn : titleOff}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/GraphToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add `BoltIcon`**

Append to `web/src/components/icons.tsx` (after `FlowIcon`, end of file):

```tsx
export const BoltIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);
```

- [ ] **Step 6: Re-implement `InfraToggle` via `GraphToggle`**

Replace the entire body of `web/src/components/InfraToggle.tsx`:

```tsx
import { ServerIcon } from './icons';
import { GraphToggle } from './GraphToggle';

/**
 * Shared map/mesh/flow control that includes or excludes ambient infrastructure
 * nodes (logging, mesh, secrets, config, …). Bound to the app-level
 * `showInfrastructure` preference so the choice is consistent across views.
 */
export function InfraToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <GraphToggle
      on={on}
      onToggle={onToggle}
      icon={<ServerIcon width={15} height={15} />}
      label="Infrastructure"
      titleOn="Hide ambient infrastructure nodes"
      titleOff="Show ambient infrastructure nodes"
      tone="infra"
    />
  );
}
```

- [ ] **Step 7: Create `CriticalToggle`**

Create `web/src/components/CriticalToggle.tsx`:

```tsx
import { BoltIcon } from './icons';
import { GraphToggle } from './GraphToggle';

/**
 * Shared map/mesh/flow control that hides non-critical dependency edges,
 * leaving only the critical-path backbone. Bound to the app-level `criticalOnly`
 * preference (highlighted when the filter is active). Default off — everything
 * shown.
 */
export function CriticalToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <GraphToggle
      on={on}
      onToggle={onToggle}
      icon={<BoltIcon width={15} height={15} />}
      label="Critical only"
      titleOn="Show all dependencies"
      titleOff="Hide non-critical dependencies"
      tone="critical"
    />
  );
}
```

- [ ] **Step 8: Add `--critical` token**

In `web/src/theme.css`, add directly below the `--infra: #5fb3c6;` line (line ~51):

```css
  --critical: #ff6b79; /* mirrors edgeColors.critical in tokens.ts */
```

- [ ] **Step 9: Migrate CSS from `.infratoggle` to `.graphtoggle`**

In `web/src/app.css`, replace the block (lines ~995-1018, the comment through `.infratoggle--on { ... }`):

```css
/* Generic include/exclude toggle pill, shared by map/mesh/flow. */
.graphtoggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  color: var(--text-lo);
  font-size: 12.5px;
  font-weight: 500;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: color 0.16s, background 0.16s, border-color 0.16s;
}
.graphtoggle:hover {
  color: var(--text-mid);
}
.graphtoggle--on.graphtoggle--infra {
  color: var(--infra);
  background: color-mix(in srgb, var(--infra) 14%, transparent);
  border-color: color-mix(in srgb, var(--infra) 42%, transparent);
}
.graphtoggle--on.graphtoggle--critical {
  color: var(--critical);
  background: color-mix(in srgb, var(--critical) 14%, transparent);
  border-color: color-mix(in srgb, var(--critical) 42%, transparent);
}
```

- [ ] **Step 10: Run the full suite to confirm nothing broke**

Run: `cd web && npm test`
Expected: PASS — all existing tests plus the new GraphToggle tests. (`InfraToggle` API is unchanged, so its call sites still compile.)

- [ ] **Step 11: Commit**

```bash
cd web && git add src/components/GraphToggle.tsx src/components/GraphToggle.test.tsx \
  src/components/InfraToggle.tsx src/components/CriticalToggle.tsx \
  src/components/icons.tsx src/theme.css src/app.css
git commit -m "feat(web): GraphToggle component + CriticalToggle + bolt icon"
```

---

## Task 4: Wire the critical filter through useCatalog, App, and the three views

This is one atomic change — `useCatalog` dropping `indexNoInfra` forces App to change, which forces the view prop signatures to change, which forces the FlowView test update. Implement all steps, then run the suite once and commit.

**Files:**
- Modify: `web/src/data/useCatalog.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/DependencyMap.tsx`
- Modify: `web/src/components/MeshView.tsx`
- Modify: `web/src/components/FlowView.tsx`
- Modify: `web/src/components/FlowView.test.tsx`

- [ ] **Step 1: Update `useCatalog` to expose `{ index, catalog }`**

In `web/src/data/useCatalog.ts`, replace the `Status` union's ready arm (lines 8-11):

```ts
  // `index` is the full graph; `catalog` is the raw source the graph views
  // filter on demand (infra / critical) via composable transforms.
  | { status: 'ready'; index: CatalogIndex; catalog: Catalog };
```

Replace the `setState({ status: 'ready', ... })` call (lines 33-37):

```ts
        setState({
          status: 'ready',
          index: new CatalogIndex(catalog),
          catalog,
        });
```

Remove the now-unused `withoutInfrastructure` import on line 3:

```ts
import { CatalogIndex } from './catalog';
```

- [ ] **Step 2: Update `App.tsx` imports and add `criticalOnly` state**

In `web/src/App.tsx`, add `useMemo` to the React import (line 1 — App does not currently import it):

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
```

Change the catalog import (line 3) to pull both filters:

```ts
import { deriveFacets, withoutInfrastructure, withoutNonCritical, type CatalogIndex } from './data/catalog';
```

Add a `Catalog` type import (after line 13, with the other imports):

```ts
import type { Catalog } from './types';
```

Import the new toggle (with the other component imports, near line 11):

```ts
import { CriticalToggle } from './components/CriticalToggle';
```

After the `showInfrastructure` state (line 36), add:

```ts
  // Shared across map/mesh/flow: hide non-critical dependency edges, leaving the
  // critical-path backbone. Off by default — everything shown.
  const [criticalOnly, setCriticalOnly] = useState(false);
```

After `toggleInfra` (line 67), add:

```ts
  const toggleCriticalOnly = useCallback(() => setCriticalOnly((v) => !v), []);
```

- [ ] **Step 3: Add the memoized graph-index cache (hook — must be above the early returns)**

In `web/src/App.tsx`, immediately after the `const state = useCatalog();` line (line 27) and the other top-level hooks but **before** the `if (state.status === 'loading')` return, add (place it after the `handleQuery` callback, ~line 100, so it sits with the other hooks):

```ts
  // Lazy per-filter-combo CatalogIndex cache for the graph views. Keyed by
  // "<dropInfra>:<dropCritical>"; rebuilt only when the underlying index
  // identity changes (a refetch). Hook lives above the early returns.
  const readyIndex = state.status === 'ready' ? state.index : null;
  const graphIndexCache = useMemo(() => new Map<string, CatalogIndex>(), [readyIndex]);
```

- [ ] **Step 4: Replace the index selection block in App**

In `web/src/App.tsx`, replace the destructure + selection block (lines 130 and 142-148):

Replace line 130:

```ts
  const { index, catalog } = state;
```

Replace the comment + three derivations (lines 142-148):

```ts
  // The graph each view traverses, composed lazily from the raw catalog and
  // cached by filter combo. Critical filtering needs no root guard — the BFS
  // root always survives even if all its edges are non-critical — so it enters
  // uniformly as `criticalOnly`. Infra keeps its root guard: a map/flow focused
  // on an infra node must use the full index so its focus is never pruned.
  const isInfra = (id: string): boolean => !!index.byId.get(id)?.infrastructure;
  const graphIndex = (dropInfra: boolean, dropCritical: boolean): CatalogIndex => {
    const key = `${dropInfra}:${dropCritical}`;
    let idx = graphIndexCache.get(key);
    if (!idx) {
      if (!dropInfra && !dropCritical) {
        idx = index;
      } else {
        const filters: Array<(c: Catalog) => Catalog> = [];
        if (dropInfra) filters.push(withoutInfrastructure);
        if (dropCritical) filters.push(withoutNonCritical);
        idx = new CatalogIndex(filters.reduce((c, f) => f(c), catalog));
      }
      graphIndexCache.set(key, idx);
    }
    return idx;
  };
  const meshIndex = graphIndex(!showInfrastructure, criticalOnly);
  const mapIndex = graphIndex(!showInfrastructure && !mapRootIds.some(isInfra), criticalOnly);
  const flowIndex = graphIndex(!showInfrastructure && !isInfra(flowRootId), criticalOnly);
```

(Note: the old `const isInfra = ...` on line 145 is now inside this block — make sure it appears only once.)

- [ ] **Step 5: Pass the new props from App to the three views**

In `web/src/App.tsx`:

`DependencyMap` (after `onToggleInfra={toggleInfra}`, ~line 209):

```tsx
                criticalOnly={criticalOnly}
                onToggleCriticalOnly={toggleCriticalOnly}
```

`FlowView` (after `onToggleInfra={toggleInfra}`, ~line 227):

```tsx
              criticalOnly={criticalOnly}
              onToggleCriticalOnly={toggleCriticalOnly}
```

`MeshView` (after `onToggleInfra={toggleInfra}`, ~line 235):

```tsx
            criticalOnly={criticalOnly}
            onToggleCriticalOnly={toggleCriticalOnly}
```

- [ ] **Step 6: Update `DependencyMap` to accept props and render the toggle**

In `web/src/components/DependencyMap.tsx`:

Add the import (with the other component imports, ~line 10):

```ts
import { CriticalToggle } from './CriticalToggle';
```

Add to the destructured props (after `onToggleInfra,`, line 31) and the type (after `onToggleInfra: () => void;`, line 40):

```ts
  criticalOnly,
  onToggleCriticalOnly,
```
```ts
  criticalOnly: boolean;
  onToggleCriticalOnly: () => void;
```

Render the toggle right after the `<InfraToggle ... />` (line 105):

```tsx
        <InfraToggle on={showInfra} onToggle={onToggleInfra} />
        <CriticalToggle on={criticalOnly} onToggle={onToggleCriticalOnly} />
```

- [ ] **Step 7: Update `MeshView` — props, toggle, and pruneIsolated**

In `web/src/components/MeshView.tsx`:

Add the import (~line 10):

```ts
import { CriticalToggle } from './CriticalToggle';
```

Add to destructured props (after `onToggleInfra,`, line 87) and type (after `onToggleInfra: () => void;`, line 92):

```ts
  criticalOnly,
  onToggleCriticalOnly,
```
```ts
  criticalOnly: boolean;
  onToggleCriticalOnly: () => void;
```

Pass `pruneIsolated` on the full-mesh path — replace the `elements` memo (lines 151-157):

```tsx
  const elements = useMemo(
    () =>
      neighborhood
        ? buildSubgraphElements(index, neighborhood.nodes, neighborhood.edges)
        : buildMeshElements(index, { pruneIsolated: criticalOnly }),
    [index, neighborhood, criticalOnly],
  );
```

Render the toggle next to `InfraToggle` in the `marginLeft:auto` span (lines 281-283):

```tsx
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <InfraToggle on={showInfra} onToggle={onToggleInfra} />
          <CriticalToggle on={criticalOnly} onToggle={onToggleCriticalOnly} />
        </span>
```

- [ ] **Step 8: Update `FlowView` — props and toggle**

In `web/src/components/FlowView.tsx`:

Add the import (next to the `InfraToggle` import, ~line 10):

```ts
import { CriticalToggle } from './CriticalToggle';
```

Add to the destructured props (line 34) and the prop type (after `onToggleInfra: () => void;`, ~line 40):

```ts
export function FlowView({
  index, rootId, onReroot, showInfra, onToggleInfra, criticalOnly, onToggleCriticalOnly,
}: {
```
```ts
  criticalOnly: boolean;
  onToggleCriticalOnly: () => void;
```

Render `<CriticalToggle on={criticalOnly} onToggle={onToggleCriticalOnly} />` immediately after the existing `<InfraToggle ... />` in the JSX. (Search for `<InfraToggle` in the file and add the sibling on the next line.)

- [ ] **Step 9: Update `FlowView.test.tsx` for the new required props**

In `web/src/components/FlowView.test.tsx`, add `criticalOnly={false} onToggleCriticalOnly={() => {}}` to each of the three `render(<FlowView ... />)` calls. Example for the first:

```tsx
render(<FlowView index={makeIndex()} rootId="a" onReroot={() => {}} showInfra={false} onToggleInfra={() => {}} criticalOnly={false} onToggleCriticalOnly={() => {}} />);
```

Apply the same two added props to the second (`rootId="a"`, `onReroot={onReroot}`) and third (`rootId="c"`) render calls.

- [ ] **Step 10: Typecheck + full suite**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: PASS — no type errors (all view prop signatures satisfied), all tests green.

- [ ] **Step 11: Commit**

```bash
cd web && git add src/data/useCatalog.ts src/App.tsx \
  src/components/DependencyMap.tsx src/components/MeshView.tsx \
  src/components/FlowView.tsx src/components/FlowView.test.tsx
git commit -m "feat(web): hide non-critical dependencies toggle across graph views"
```

---

## Task 5: Manual verification

**Files:** none (manual smoke test).

- [ ] **Step 1: Build + run the dev server**

Run: `cd web && npm run dev`
Open the app. (If a catalog must be generated first, run `npm run catalog` per the app's own error hint.)

- [ ] **Step 2: Verify each view**

- [ ] Open a **Map** (click a service → map). Confirm a "Critical only" pill sits next to "Infrastructure". Toggle it: non-critical edges vanish, the "N critical" stat now equals the edge count, nodes reachable only via non-critical edges disappear. The focused root stays even if it had only non-critical edges.
- [ ] Open the **Mesh** full view. Toggle "Critical only": non-critical edges drop and now-edgeless service nodes disappear (no floating islands). Slice by a dimension and confirm the same.
- [ ] Open **Flow**. Toggle "Critical only": the Sankey shows only critical links. A root with no critical deps yields the existing empty state.
- [ ] Toggle **Infrastructure** and **Critical only** together — both filters compose (infra nodes gone AND non-critical edges gone).
- [ ] Switch between views — the "Critical only" choice persists.

- [ ] **Step 3: Final full suite**

Run: `cd web && npm test`
Expected: PASS.

---

## Self-Review Notes

- **Spec coverage:** `withoutNonCritical` (Task 1) ✓; index composition Approach B with seeded no-filter combo and no critical root-guard (Task 4 steps 3-4) ✓; full-mesh prune (Task 2 + Task 4 step 7) ✓; scope Map+Mesh+Flow (Task 4 steps 6-8) ✓; `GraphToggle` generalization + `BoltIcon` + persisted state (Task 3, Task 4 step 2) ✓; exports/stat untouched (no task needed — they read the passed index) ✓; tests (Tasks 1-3, FlowView test update in Task 4) ✓.
- **Naming:** filter `withoutNonCritical`, state `criticalOnly`, props `criticalOnly`/`onToggleCriticalOnly`, CSS `.graphtoggle`/`--on`/`--infra`/`--critical`, token `--critical`, icon `BoltIcon`, components `GraphToggle`/`CriticalToggle` — used consistently across all tasks.
- **Green between commits:** Tasks 1-3 are additive (InfraToggle keeps its public API). The only build-breaking change (useCatalog dropping `indexNoInfra`) is contained entirely within Task 4 alongside every consumer it affects, so each commit compiles.
