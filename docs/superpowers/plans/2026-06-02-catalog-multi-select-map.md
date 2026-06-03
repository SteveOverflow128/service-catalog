# Catalog Multi-Select → Multi-Root Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select multiple services on the catalog view and open them together in the dependency map as multiple roots.

**Architecture:** Selection state lives local to `CatalogView` (clears on unmount = on any navigation away, exactly the desired lifetime). The map generalizes from a single `rootId` to a root **set**; the left panel shows the rich `ServiceDetail` for one root and a new `RootsSidebar` for ≥2. App routing is refactored to a single `AppView` discriminated union with a new shareable `#/m/<ids>` hash. The graph data layer (`index.egoSet`, `buildSubgraphElements`) already supports multiple seeds from prior work.

**Tech Stack:** React 19 + TypeScript, Vite 8, Cytoscape. Tests introduced via Vitest + jsdom + @testing-library/react (none exist today).

**Spec:** `docs/superpowers/specs/2026-06-02-catalog-multi-select-map-design.md`

---

## File Structure

**New files:**
- `web/vitest.config.ts` — Vitest config (jsdom, react plugin, setup).
- `web/src/test/setup.ts` — RTL cleanup hook.
- `web/src/test/fixtures.ts` — shared `makeIndex()` test fixture.
- `web/src/data/routing.ts` — pure `AppView` type + `parseHash` / `viewToHash`.
- `web/src/data/routing.test.ts` — routing unit tests.
- `web/src/data/catalog.test.ts` — `egoSet` / `induced` unit tests.
- `web/src/graph/build.test.ts` — multi-root node styling test.
- `web/src/graph/mermaid.test.ts` — multi-root mermaid styling test.
- `web/src/components/RootsSidebar.tsx` — ≥2-root map left panel.
- `web/src/components/RootsSidebar.test.tsx` — sidebar RTL test.
- `web/src/components/ServiceCard.test.tsx` — select-mode RTL test.
- `web/src/components/CatalogView.test.tsx` — selection-bar RTL test.

**Modified files:**
- `web/package.json` — devDeps + test scripts.
- `web/src/graph/build.ts` — root **set** styling.
- `web/src/graph/mermaid.ts` — `rootIds` styling.
- `web/src/components/GraphCanvas.tsx` — forward modifier event to `onNodeClick`.
- `web/src/components/DependencyMap.tsx` — `rootId: string` → `rootIds: string[]`, click handlers.
- `web/src/App.tsx` — `AppView` routing, map root-set, `RootsSidebar` wiring.
- `web/src/components/ServiceCard.tsx` — checkbox + select-mode behavior.
- `web/src/components/CatalogView.tsx` — select mode, selection bar, `onMapSelected`.
- `web/src/app.css` — selection bar, checkbox, sidebar, select-toggle styles.

---

## Task 1: Test infrastructure (Vitest + jsdom + RTL)

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`
- Create: `web/src/test/setup.ts`
- Create: `web/src/test/smoke.test.ts`

- [ ] **Step 1: Install dev dependencies**

Run (from `web/`):
```bash
npm install -D vitest jsdom @testing-library/react@^16 @testing-library/user-event
```
Expected: packages added to `devDependencies`, no errors. `vitest`/`jsdom` are
left unpinned so npm picks a build compatible with this repo's **Vite 8**
(Vitest 2 only supports Vite ≤6). `@testing-library/react@^16` is pinned because
that is the line with React 19 support. If npm prints a peer-dep warning about
`vite`, the resolved (latest) Vitest is correct — proceed.

- [ ] **Step 2: Add test scripts to `package.json`**

In `web/package.json`, add to `"scripts"` (after `"typecheck"`):
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Standalone from vite.config.ts so the dev-only live-catalog/save-service
// middleware plugins aren't pulled into the test runner.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 4: Create `web/src/test/setup.ts`**

```ts
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests so the jsdom document stays clean.
afterEach(cleanup);
```

- [ ] **Step 5: Create a smoke test `web/src/test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors. (Test files import `vitest`/RTL types; they resolve from the installed packages.)

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/src/test/setup.ts web/src/test/smoke.test.ts
git commit -m "test: add vitest + jsdom + RTL harness"
```

---

## Task 2: Routing module (`AppView`, `parseHash`, `viewToHash`)

**Files:**
- Create: `web/src/data/routing.ts`
- Create: `web/src/data/routing.test.ts`

- [ ] **Step 1: Write the failing test `web/src/data/routing.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseHash, viewToHash, type AppView } from './routing';

describe('parseHash', () => {
  it('parses empty / root as catalog', () => {
    expect(parseHash('')).toEqual({ kind: 'catalog' });
    expect(parseHash('#/')).toEqual({ kind: 'catalog' });
  });
  it('parses mesh', () => {
    expect(parseHash('#/mesh')).toEqual({ kind: 'mesh' });
  });
  it('parses a detail page', () => {
    expect(parseHash('#/d/auth-service')).toEqual({ kind: 'detail', id: 'auth-service' });
  });
  it('parses a multi-root map', () => {
    expect(parseHash('#/m/auth-service,billing-api')).toEqual({
      kind: 'map',
      rootIds: ['auth-service', 'billing-api'],
    });
  });
  it('treats #/s/<id> as a single-root map (back-compat)', () => {
    expect(parseHash('#/s/auth-service')).toEqual({ kind: 'map', rootIds: ['auth-service'] });
  });
  it('falls back to catalog for an empty map', () => {
    expect(parseHash('#/m/')).toEqual({ kind: 'catalog' });
  });
  it('decodes percent-encoded ids', () => {
    expect(parseHash('#/d/a%2Fb')).toEqual({ kind: 'detail', id: 'a/b' });
  });
});

describe('viewToHash', () => {
  const cases: [AppView, string][] = [
    [{ kind: 'catalog' }, '#/'],
    [{ kind: 'mesh' }, '#/mesh'],
    [{ kind: 'detail', id: 'auth-service' }, '#/d/auth-service'],
    [{ kind: 'map', rootIds: ['auth-service', 'billing-api'] }, '#/m/auth-service,billing-api'],
  ];
  it.each(cases)('serializes %j', (view, hash) => {
    expect(viewToHash(view)).toBe(hash);
  });
  it('round-trips map and detail', () => {
    const v: AppView = { kind: 'map', rootIds: ['a', 'b', 'c'] };
    expect(parseHash(viewToHash(v))).toEqual(v);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- routing`
Expected: FAIL (`Cannot find module './routing'`).

- [ ] **Step 3: Implement `web/src/data/routing.ts`**

```ts
// Single source of truth for how the URL hash maps to what the app shows.
// Pure + framework-free so it can be unit-tested in isolation.

export type AppView =
  | { kind: 'catalog' }
  | { kind: 'mesh' }
  | { kind: 'detail'; id: string }
  | { kind: 'map'; rootIds: string[] };

/** Parse a `window.location.hash` value into the view it represents.
 *  `#/`              catalog
 *  `#/mesh`          mesh
 *  `#/d/<id>`        full detail page
 *  `#/m/<id,id,…>`   dependency map seeded with one or more roots
 *  `#/s/<id>`        back-compat alias for a single-root map */
export function parseHash(hash: string): AppView {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'mesh') return { kind: 'mesh' };
  if (h.startsWith('d/')) return { kind: 'detail', id: decodeURIComponent(h.slice(2)) };
  if (h.startsWith('m/')) {
    const rootIds = h
      .slice(2)
      .split(',')
      .map((s) => decodeURIComponent(s))
      .filter(Boolean);
    return rootIds.length ? { kind: 'map', rootIds } : { kind: 'catalog' };
  }
  if (h.startsWith('s/')) {
    const id = decodeURIComponent(h.slice(2));
    return id ? { kind: 'map', rootIds: [id] } : { kind: 'catalog' };
  }
  return { kind: 'catalog' };
}

/** Inverse of {@link parseHash} (canonical form; never emits the `#/s/` alias). */
export function viewToHash(view: AppView): string {
  switch (view.kind) {
    case 'mesh':
      return '#/mesh';
    case 'detail':
      return `#/d/${encodeURIComponent(view.id)}`;
    case 'map':
      return `#/m/${view.rootIds.map(encodeURIComponent).join(',')}`;
    case 'catalog':
    default:
      return '#/';
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- routing`
Expected: PASS (all routing tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/data/routing.ts web/src/data/routing.test.ts
git commit -m "feat(web): add AppView hash routing module (#/m multi-root maps)"
```

---

## Task 3: Characterization tests for `egoSet` / `induced`

This guards the multi-root graph behavior the map relies on. No production change.

**Files:**
- Create: `web/src/test/fixtures.ts`
- Create: `web/src/data/catalog.test.ts`

- [ ] **Step 1: Create the shared fixture `web/src/test/fixtures.ts`**

```ts
import type { Catalog, Dependency, Service } from '../types';
import { CatalogIndex } from '../data/catalog';

/** Minimal Service with sane defaults; override what a test cares about. */
export function makeService(partial: Partial<Service> & { serviceId: string }): Service {
  return {
    name: partial.serviceId,
    lifecycle: 'prod',
    criticalityTier: 2,
    repository: 'https://example.test/repo',
    team: 'Platform',
    teamEmail: 'platform@example.test',
    dataClassification: 'INTERNAL',
    ...partial,
  };
}

function dep(serviceId: string, external = false): Dependency {
  return { serviceId, interaction: 'sync-http', critical: false, purpose: 'test', external };
}

/** Graph:  a -> b -> c -> ext-x   (forward = "depends on") */
export function makeIndex(): CatalogIndex {
  const services: Service[] = [
    makeService({ serviceId: 'a', dependencies: [dep('b')] }),
    makeService({ serviceId: 'b', dependencies: [dep('c')] }),
    makeService({ serviceId: 'c', dependencies: [dep('ext-x', true)] }),
    makeService({ serviceId: 'd' }),
  ];
  const catalog: Catalog = { generatedFrom: 'test', count: services.length, services };
  return new CatalogIndex(catalog);
}
```

- [ ] **Step 2: Write the test `web/src/data/catalog.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeIndex } from '../test/fixtures';

describe('CatalogIndex.egoSet', () => {
  it('expands one hop of dependencies from a set of roots', () => {
    const index = makeIndex();
    const { nodes } = index.egoSet(new Set(['a']), 'dependencies', 1);
    expect([...nodes].sort()).toEqual(['a', 'b']);
  });
  it('seeds from multiple roots at once', () => {
    const index = makeIndex();
    const { nodes } = index.egoSet(new Set(['a', 'c']), 'dependencies', 1);
    expect([...nodes].sort()).toEqual(['a', 'b', 'c', 'ext-x']);
  });
  it('depth 0 means all hops', () => {
    const index = makeIndex();
    const { nodes } = index.egoSet(new Set(['a']), 'dependencies', 0);
    expect([...nodes].sort()).toEqual(['a', 'b', 'c', 'ext-x']);
  });
  it('dependants walks the reverse direction', () => {
    const index = makeIndex();
    const { nodes } = index.egoSet(new Set(['c']), 'dependants', 0);
    expect([...nodes].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('CatalogIndex.induced', () => {
  it('keeps only edges fully inside the given set', () => {
    const index = makeIndex();
    const { nodes, edges } = index.induced(new Set(['a', 'b']));
    expect([...nodes].sort()).toEqual(['a', 'b']);
    expect(edges).toHaveLength(1); // a -> b only; b -> c excluded
    expect(edges[0].from).toBe('a');
    expect(edges[0].to).toBe('b');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- catalog`
Expected: PASS. (If any fail, the prior egoSet/induced implementation regressed — stop and investigate before continuing.)

- [ ] **Step 4: Commit**

```bash
git add web/src/test/fixtures.ts web/src/data/catalog.test.ts
git commit -m "test(web): characterize egoSet/induced multi-root behavior"
```

---

## Task 4: Multi-root node styling in `build.ts`

Generalize the enlarged "root" treatment from a single id to a **set** of ids.

**Files:**
- Modify: `web/src/graph/build.ts`
- Create: `web/src/graph/build.test.ts`

- [ ] **Step 1: Write the failing test `web/src/graph/build.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { ElementDefinition } from 'cytoscape';
import { buildSubgraphElements } from './build';
import { makeIndex } from '../test/fixtures';

function nodeById(els: ElementDefinition[], id: string) {
  return els.find((e) => e.group === 'nodes' && e.data.id === id)?.data as
    | { id: string; isRoot: boolean; size: number }
    | undefined;
}

describe('buildSubgraphElements', () => {
  it('flags every id in the roots set as a root', () => {
    const index = makeIndex();
    const nodeIds = new Set(['a', 'b', 'c']);
    const els = buildSubgraphElements(index, nodeIds, [], new Set(['a', 'b']));
    expect(nodeById(els, 'a')!.isRoot).toBe(true);
    expect(nodeById(els, 'b')!.isRoot).toBe(true);
    expect(nodeById(els, 'c')!.isRoot).toBe(false);
  });
  it('marks nothing as root when the roots set is empty/omitted', () => {
    const index = makeIndex();
    const els = buildSubgraphElements(index, new Set(['a', 'b']), []);
    expect(nodeById(els, 'a')!.isRoot).toBe(false);
    expect(nodeById(els, 'b')!.isRoot).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- build`
Expected: FAIL (the 4th arg is currently `rootId?: string`, so `isRoot` is computed by `id === rootId` and the Set is never matched → `a`/`b` come back `isRoot: false`).

- [ ] **Step 3: Update `web/src/graph/build.ts`**

Change `buildNode`'s signature from a single `rootId` to a roots set. Replace the current `buildNode` declaration line:
```ts
function buildNode(index: CatalogIndex, id: string, rootId: string): ElementDefinition {
  const node = index.node(id);
  const isRoot = id === rootId;
```
with:
```ts
function buildNode(index: CatalogIndex, id: string, roots: ReadonlySet<string>): ElementDefinition {
  const node = index.node(id);
  const isRoot = roots.has(id);
```

Then replace the whole `buildSubgraphElements` + `buildEgoElements` + `buildMeshElements` block with:
```ts
const NO_ROOTS: ReadonlySet<string> = new Set();

/** Render an explicit node-id set + edge list into cytoscape elements. Ids in
 *  `roots` get the enlarged "root" treatment; pass an empty set for rootless
 *  subgraphs like the full mesh. */
export function buildSubgraphElements(
  index: CatalogIndex,
  nodeIds: Set<string>,
  edges: Edge[],
  roots: ReadonlySet<string> = NO_ROOTS,
): ElementDefinition[] {
  const nodes = [...nodeIds].map((id) => buildNode(index, id, roots));
  return [...nodes, ...edges.map((e, i) => buildEdge(e, i))];
}

export function buildEgoElements(index: CatalogIndex, ego: EgoGraph): ElementDefinition[] {
  return buildSubgraphElements(index, ego.nodes, ego.edges, new Set([ego.rootId]));
}

/** Full, unfiltered mesh: every catalogued service + external stub, all edges. */
export function buildMeshElements(index: CatalogIndex): ElementDefinition[] {
  const ids = new Set<string>();
  for (const s of index.services) ids.add(s.serviceId);
  for (const id of index.externals.keys()) ids.add(id);
  return buildSubgraphElements(index, ids, index.allEdges);
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npm test -- build && npm run typecheck`
Expected: PASS, no type errors. (`MeshView` calls `buildSubgraphElements(index, nodes, edges)` with no roots arg — still valid.)

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/build.ts web/src/graph/build.test.ts
git commit -m "feat(web): enlarge a set of root nodes in buildSubgraphElements"
```

---

## Task 5: Multi-root mermaid styling

**Files:**
- Modify: `web/src/graph/mermaid.ts`
- Create: `web/src/graph/mermaid.test.ts`

- [ ] **Step 1: Write the failing test `web/src/graph/mermaid.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { toMermaid } from './mermaid';
import { makeIndex } from '../test/fixtures';

describe('toMermaid root styling', () => {
  it('emits a focal style line for every id in rootIds', () => {
    const index = makeIndex();
    const out = toMermaid(index, ['a', 'b', 'c'], [], { rootIds: ['a', 'c'] });
    expect(out).toContain('style s_a stroke:#8ecbff');
    expect(out).toContain('style s_c stroke:#8ecbff');
    expect(out).not.toContain('style s_b stroke:#8ecbff');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- mermaid`
Expected: FAIL (`MermaidOptions` has no `rootIds`).

- [ ] **Step 3: Update `web/src/graph/mermaid.ts`**

Add `rootIds` to the options interface — replace:
```ts
export interface MermaidOptions {
  rootId?: string;
  title?: string;
  direction?: 'LR' | 'TB';
}
```
with:
```ts
export interface MermaidOptions {
  /** One id (single-root map) — kept for back-compat; prefer rootIds. */
  rootId?: string;
  /** Highlight a whole set of roots (multi-root map). */
  rootIds?: string[];
  title?: string;
  direction?: 'LR' | 'TB';
}
```

Then replace the focal-style block:
```ts
  // Make the focal service unmistakable (bright thick stroke over its tier fill).
  if (opts.rootId && ids.includes(opts.rootId)) {
    lines.push(`  style ${nodeKey(opts.rootId)} stroke:#8ecbff,stroke-width:4px;`);
  }
```
with:
```ts
  // Make the focal service(s) unmistakable (bright thick stroke over tier fill).
  const idSet = new Set(ids);
  const roots = opts.rootIds ?? (opts.rootId ? [opts.rootId] : []);
  for (const rid of roots) {
    if (idSet.has(rid)) lines.push(`  style ${nodeKey(rid)} stroke:#8ecbff,stroke-width:4px;`);
  }
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npm test -- mermaid && npm run typecheck`
Expected: PASS, no type errors. (`DependencyMap` still passes `rootId` for now — covered by back-compat.)

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/mermaid.ts web/src/graph/mermaid.test.ts
git commit -m "feat(web): highlight multiple roots in mermaid export"
```

---

## Task 6: Forward the modifier key from `GraphCanvas`

`⌘/Ctrl+click` on a node must be distinguishable from a plain click.

**Files:**
- Modify: `web/src/components/GraphCanvas.tsx`

- [ ] **Step 1: Widen the `onNodeClick` prop type**

In `web/src/components/GraphCanvas.tsx`, replace:
```ts
  onNodeClick?: (id: string) => void;
```
with:
```ts
  onNodeClick?: (id: string, ev: MouseEvent) => void;
```

- [ ] **Step 2: Pass the original event in the tap handler**

Replace:
```ts
    cy.on('tap', 'node', (evt) => clickRef.current?.(evt.target.id()));
```
with:
```ts
    cy.on('tap', 'node', (evt) => clickRef.current?.(evt.target.id(), evt.originalEvent as MouseEvent));
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. (`MeshView`'s `handleClick = (id: string) => {…}` is still assignable to the wider type — a handler may accept fewer args.)

- [ ] **Step 4: Commit**

```bash
git add web/src/components/GraphCanvas.tsx
git commit -m "feat(web): forward click modifier event from GraphCanvas"
```

---

## Task 7: `RootsSidebar` component (≥2-root map left panel)

**Files:**
- Create: `web/src/components/RootsSidebar.tsx`
- Create: `web/src/components/RootsSidebar.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/components/RootsSidebar.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RootsSidebar } from './RootsSidebar';
import { makeIndex } from '../test/fixtures';

describe('RootsSidebar', () => {
  it('lists a row per root and removes via ✕', async () => {
    const index = makeIndex();
    const onRemove = vi.fn();
    const onOpen = vi.fn();
    render(<RootsSidebar index={index} rootIds={['a', 'b']} onRemove={onRemove} onOpenDetail={onOpen} />);

    expect(screen.getByText('2 roots')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('opens detail when a root row is clicked', async () => {
    const index = makeIndex();
    const onOpen = vi.fn();
    render(<RootsSidebar index={index} rootIds={['a']} onRemove={vi.fn()} onOpenDetail={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /open a/i }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- RootsSidebar`
Expected: FAIL (`Cannot find module './RootsSidebar'`).

- [ ] **Step 3: Implement `web/src/components/RootsSidebar.tsx`**

```tsx
import type { CatalogIndex } from '../data/catalog';
import { tierStyle } from '../design/tokens';
import { CloseIcon } from './icons';

/** Left panel for a multi-root map: one removable row per seeding service. */
export function RootsSidebar({
  index,
  rootIds,
  onRemove,
  onOpenDetail,
}: {
  index: CatalogIndex;
  rootIds: string[];
  onRemove: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div className="rootsbar scrolly">
      <div className="rootsbar__head">
        <span className="overline">{rootIds.length} roots</span>
      </div>
      <div className="rootsbar__list">
        {rootIds.map((id) => {
          const svc = index.byId.get(id);
          const name = svc?.name ?? id;
          const color = svc ? tierStyle(svc.criticalityTier).color : 'var(--accent)';
          return (
            <div className="rootrow" key={id}>
              <button
                className="rootrow__open"
                onClick={() => onOpenDetail(id)}
                aria-label={`Open ${name}`}
                title="Open detail page"
              >
                <span className="rootrow__dot" style={{ background: color }} />
                <span className="rootrow__name">{name}</span>
                <code className="rootrow__id mono">{id}</code>
              </button>
              <button
                className="rootrow__rm"
                onClick={() => onRemove(id)}
                aria-label={`Remove ${name}`}
                title="Remove from map"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

> Note: the test uses the service **name** in the aria-label; in the fixture `name === serviceId` (`'a'`), so `Remove a` / `Open a` match.

- [ ] **Step 4: Run the test + typecheck**

Run: `npm test -- RootsSidebar && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RootsSidebar.tsx web/src/components/RootsSidebar.test.tsx
git commit -m "feat(web): add RootsSidebar for multi-root map"
```

---

## Task 8: Multi-root `DependencyMap` + `App` routing refactor

This is the core wiring. `DependencyMap` takes a root **set**; `App` moves to `AppView` routing and renders the map's left panel by root count. Done together so the build stays green.

**Files:**
- Modify: `web/src/components/DependencyMap.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Rewrite `web/src/components/DependencyMap.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Depth, MapMode } from '../types';
import { buildSubgraphElements, dagreLayout } from '../graph/build';
import { toMermaid } from '../graph/mermaid';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';
import { MermaidExport } from './MermaidExport';
import { CsvExport } from './CsvExport';
import { BothIcon, CodeIcon, DownstreamIcon, TableIcon, UpstreamIcon } from './icons';

const MODES: { key: MapMode; label: string; hint: string; Icon: typeof BothIcon }[] = [
  { key: 'dependencies', label: 'Dependencies', hint: 'what this calls', Icon: DownstreamIcon },
  { key: 'dependants', label: 'Dependants', hint: 'what calls this', Icon: UpstreamIcon },
  { key: 'both', label: 'Both', hint: 'full neighborhood', Icon: BothIcon },
];

const DEPTHS: { key: Depth; label: string }[] = [
  { key: 1, label: '1 hop' },
  { key: 2, label: '2 hops' },
  { key: 0, label: 'All' },
];

export function DependencyMap({
  index,
  rootIds,
  onReroot,
  onToggleRoot,
}: {
  index: CatalogIndex;
  rootIds: string[];
  /** plain click on a node → make it the sole root */
  onReroot: (id: string) => void;
  /** ⌘/Ctrl+click on a node → add/remove it from the root set */
  onToggleRoot: (id: string) => void;
}) {
  const [mode, setMode] = useState<MapMode>('both');
  const [depth, setDepth] = useState<Depth>(1);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const rootSet = useMemo(() => new Set(rootIds), [rootIds]);
  const ego = useMemo(() => index.egoSet(rootSet, mode, depth), [index, rootSet, mode, depth]);
  const elements = useMemo(
    () => buildSubgraphElements(index, ego.nodes, ego.edges, rootSet),
    [index, ego, rootSet],
  );

  const egoServices = useMemo(
    () => [...ego.nodes].map((id) => index.byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s),
    [ego, index],
  );

  const depthLabel = depth === 0 ? 'all hops' : `${depth} hop${depth === 1 ? '' : 's'}`;
  const rootLabel =
    rootIds.length === 1 ? index.byId.get(rootIds[0])?.name ?? rootIds[0] : `${rootIds.length} services`;
  const exportSlug =
    rootIds.length === 1 ? rootIds[0] : `${rootIds.length}roots`;

  const criticalEdges = ego.edges.filter((e) => e.dep.critical).length;
  const externalNodes = [...ego.nodes].filter((id) => !index.byId.has(id)).length;

  const handleNodeClick = (id: string, ev: MouseEvent) => {
    if (!index.byId.has(id)) return; // externals can't be roots
    if (ev && (ev.metaKey || ev.ctrlKey)) onToggleRoot(id);
    else onReroot(id);
  };

  return (
    <div className="depmap">
      <div className="mapbar">
        <div className="modeseg" role="tablist" aria-label="Map mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={mode === m.key}
              className={`segbtn ${mode === m.key ? 'segbtn--on' : ''}`}
              onClick={() => setMode(m.key)}
              title={m.hint}
            >
              <m.Icon width={15} height={15} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="depthseg" role="group" aria-label="Traversal depth">
          {DEPTHS.map((d) => (
            <button
              key={d.label}
              className={`depthbtn ${depth === d.key ? 'depthbtn--on' : ''}`}
              onClick={() => setDepth(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="mapstats mono">
          <span><b>{ego.nodes.size}</b> nodes</span>
          <span><b>{ego.edges.length}</b> edges</span>
          {criticalEdges > 0 && <span className="mapstats__crit"><b>{criticalEdges}</b> critical</span>}
          {externalNodes > 0 && <span className="mapstats__ext"><b>{externalNodes}</b> external</span>}
        </div>

        <div className="mesh__exports">
          <button className="exportbtn" onClick={() => setExportingCsv(true)} title="Export the services in this map as a CSV">
            <TableIcon width={15} height={15} />
            <span>Export CSV</span>
          </button>
          <button className="exportbtn" onClick={() => setExporting(true)} title="Export this map as a Mermaid diagram">
            <CodeIcon width={15} height={15} />
            <span>Mermaid</span>
          </button>
        </div>
      </div>

      <div className="depmap__canvaswrap">
        {ego.edges.length === 0 ? (
          <div className="graph-empty">
            <div className="graph-empty__ring" />
            <p>
              No {mode === 'dependants' ? 'dependants' : mode === 'dependencies' ? 'dependencies' : 'connections'}{' '}
              recorded for {rootIds.length === 1 ? 'this service' : 'these services'}.
            </p>
            <span className="overline">tip: ⌘/Ctrl-click a node to add it as a root</span>
          </div>
        ) : (
          <GraphCanvas
            elements={elements}
            layout={dagreLayout}
            onNodeClick={handleNodeClick}
            layoutKey={`${rootIds.join(',')}:${mode}:${depth}`}
          />
        )}
        <Legend />
      </div>

      {exporting && (
        <MermaidExport
          title={`${rootLabel} · ${mode} · ${depthLabel}`}
          filename={`${exportSlug}-${mode}-${depth === 0 ? 'all' : depth + 'hop'}.mmd`}
          code={toMermaid(index, ego.nodes, ego.edges, {
            rootIds,
            title: `${rootLabel} — ${mode} · ${depthLabel}`,
          })}
          onClose={() => setExporting(false)}
        />
      )}

      {exportingCsv && (
        <CsvExport
          index={index}
          services={egoServices}
          title={`Export ${rootLabel} map as CSV`}
          filename={`${exportSlug}-${mode}-${depth === 0 ? 'all' : depth + 'hop'}.csv`}
          onClose={() => setExportingCsv(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/src/App.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useCatalog } from './data/useCatalog';
import { deriveFacets } from './data/catalog';
import { parseHash, viewToHash, type AppView } from './data/routing';
import { TopBar } from './components/TopBar';
import { CatalogView } from './components/CatalogView';
import { MeshView } from './components/MeshView';
import { ServiceDetail } from './components/ServiceDetail';
import { ServiceDetailPage } from './components/ServiceDetailPage';
import { DependencyMap } from './components/DependencyMap';
import { RootsSidebar } from './components/RootsSidebar';
import { emptyFilters, type FilterState } from './components/Filters';
import { ArrowRight } from './components/icons';

export default function App() {
  const state = useCatalog();
  const [view, setView] = useState<AppView>(() => parseHash(window.location.hash));
  const [lastTopView, setLastTopView] = useState<'catalog' | 'mesh'>('catalog');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);

  // Remember the last top-level view so "back" from a map/detail returns there.
  useEffect(() => {
    if (view.kind === 'catalog' || view.kind === 'mesh') setLastTopView(view.kind);
  }, [view]);

  // state -> hash
  useEffect(() => {
    const target = viewToHash(view);
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [view]);

  // hash -> state
  useEffect(() => {
    const onHash = () => setView(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toggle = useCallback((group: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const next: FilterState = { ...prev, [group]: new Set(prev[group]) };
      const set = next[group] as Set<string>;
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(emptyFilters()), []);

  const openDetail = useCallback((id: string) => setView({ kind: 'detail', id }), []);
  const openMap = useCallback((ids: string[]) => {
    if (ids.length) setView({ kind: 'map', rootIds: ids });
  }, []);
  const reroot = useCallback((id: string) => setView({ kind: 'map', rootIds: [id] }), []);
  const toggleRoot = useCallback((id: string) => {
    setView((v) => {
      if (v.kind !== 'map') return { kind: 'map', rootIds: [id] };
      const has = v.rootIds.includes(id);
      const rootIds = has ? v.rootIds.filter((r) => r !== id) : [...v.rootIds, id];
      return rootIds.length ? { kind: 'map', rootIds } : { kind: 'catalog' };
    });
  }, []);
  const removeRoot = useCallback((id: string) => {
    setView((v) => {
      if (v.kind !== 'map') return v;
      const rootIds = v.rootIds.filter((r) => r !== id);
      return rootIds.length ? { kind: 'map', rootIds } : { kind: 'catalog' };
    });
  }, []);
  const goBack = useCallback(() => setView({ kind: lastTopView }), [lastTopView]);

  const changeTopView = useCallback((v: 'catalog' | 'mesh') => setView({ kind: v }), []);

  const handleQuery = useCallback((q: string) => {
    setQuery(q);
    if (q) setView({ kind: 'catalog' });
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="app">
        <div className="observatory-bg" />
        <div className="boot">
          <div className="boot__ring" />
          <span className="overline">Initialising observatory…</span>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="app">
        <div className="observatory-bg" />
        <div className="boot boot--error">
          <h1 className="h-display">Catalog unavailable</h1>
          <p className="mono">{state.error}</p>
          <p className="boot__hint">
            Run <code className="mono">npm run catalog</code> to (re)generate{' '}
            <code className="mono">public/catalog.json</code> from <code className="mono">../data</code>.
          </p>
        </div>
      </div>
    );
  }

  const { index } = state;
  const facets = deriveFacets(index.services);

  const detailService = view.kind === 'detail' ? index.byId.get(view.id) : undefined;
  // Only catalogued ids can seed a map.
  const mapRootIds = view.kind === 'map' ? view.rootIds.filter((id) => index.byId.has(id)) : [];

  return (
    <div className="app">
      <div className="observatory-bg" />
      <TopBar
        query={query}
        onQuery={handleQuery}
        view={view.kind === 'mesh' ? 'mesh' : 'catalog'}
        onView={changeTopView}
        serviceCount={index.services.length}
      />

      <main className="app__body">
        {view.kind === 'detail' && detailService ? (
          <ServiceDetailPage
            key={detailService.serviceId}
            service={detailService}
            index={index}
            onBack={goBack}
            onOpenMap={reroot}
            onSelectNode={openDetail}
          />
        ) : view.kind === 'map' && mapRootIds.length > 0 ? (
          <div className="detail" key={mapRootIds.join(',')}>
            <div className="detail__bar">
              <button className="backbtn" onClick={goBack}>
                <ArrowRight width={14} height={14} className="backbtn__ico" />
                <span>{lastTopView === 'mesh' ? 'Mesh' : 'Catalog'}</span>
              </button>
              <span className="detail__crumb mono">
                / {mapRootIds.length === 1 ? mapRootIds[0] : `${mapRootIds.length} roots`}
              </span>
            </div>
            <div className="detail__split">
              {mapRootIds.length === 1 ? (
                <ServiceDetail
                  index={index}
                  service={index.byId.get(mapRootIds[0])!}
                  onSelectNode={reroot}
                  onOpenDetail={openDetail}
                />
              ) : (
                <RootsSidebar
                  index={index}
                  rootIds={mapRootIds}
                  onRemove={removeRoot}
                  onOpenDetail={openDetail}
                />
              )}
              <DependencyMap
                index={index}
                rootIds={mapRootIds}
                onReroot={reroot}
                onToggleRoot={toggleRoot}
              />
            </div>
          </div>
        ) : view.kind === 'mesh' ? (
          <MeshView index={index} onSelectNode={reroot} />
        ) : (
          <CatalogView
            index={index}
            facets={facets}
            query={query}
            filters={filters}
            onToggle={toggle}
            onClear={clearFilters}
            onOpen={openDetail}
            onMapView={reroot}
          />
        )}
      </main>
    </div>
  );
}
```

> Notes: the `DetailMode` type and `readHash` helper are gone (replaced by `routing.ts`). `MeshView`/`ServiceDetailPage` node clicks now `reroot` (open a single-root map) — same behavior as before. The map view falls back to catalog automatically when `mapRootIds` resolves empty (e.g. all ids unknown, or the last root removed).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. If `TopBar` exports a `View` type that's now unused, that's fine — it's still exported from `TopBar.tsx`; we just stopped importing it.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all green (no regressions).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, open the printed URL. Verify:
- A card's "map →" opens the single-root map with the rich `ServiceDetail` panel (unchanged).
- In that map, plain-click a node → it becomes the new single root.
- ⌘/Ctrl-click a different node → panel switches to the **roots sidebar**, both nodes enlarged; URL shows `#/m/a,b`.
- Refresh → the multi-root map is restored from the URL.
- Remove a root via the sidebar ✕ down to one → rich detail panel returns; remove the last → back to catalog.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/DependencyMap.tsx web/src/App.tsx
git commit -m "feat(web): multi-root dependency map + AppView routing"
```

---

## Task 9: `ServiceCard` select mode

**Files:**
- Modify: `web/src/components/ServiceCard.tsx`
- Create: `web/src/components/ServiceCard.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/components/ServiceCard.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceCard } from './ServiceCard';
import { makeIndex, makeService } from '../test/fixtures';

const index = makeIndex();
const svc = makeService({ serviceId: 'a', name: 'Alpha' });

describe('ServiceCard select mode', () => {
  it('clicking the card toggles selection (not open) when selectMode is on', async () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <ServiceCard
        service={svc}
        index={index}
        onOpen={onOpen}
        onMapView={vi.fn()}
        selectMode
        selected={false}
        onToggleSelect={onToggleSelect}
      />,
    );
    await userEvent.click(screen.getByText('Alpha'));
    expect(onToggleSelect).toHaveBeenCalledWith('a');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('clicking the card opens detail when selectMode is off', async () => {
    const onOpen = vi.fn();
    render(<ServiceCard service={svc} index={index} onOpen={onOpen} onMapView={vi.fn()} />);
    await userEvent.click(screen.getByText('Alpha'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('exposes a checkbox reflecting selected state in select mode', () => {
    render(
      <ServiceCard
        service={svc}
        index={index}
        onOpen={vi.fn()}
        onMapView={vi.fn()}
        selectMode
        selected
        onToggleSelect={vi.fn()}
      />,
    );
    const cb = screen.getByRole('checkbox');
    expect(cb.getAttribute('aria-checked')).toBe('true');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- ServiceCard`
Expected: FAIL (props `selectMode`/`selected`/`onToggleSelect` don't exist; no checkbox role).

- [ ] **Step 3: Update `web/src/components/ServiceCard.tsx`**

Replace the component (props + the outer `<div>` open handler + add the checkbox + adjust id/`map →`):
```tsx
export function ServiceCard({
  service,
  index,
  onOpen,
  onMapView,
  style,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  service: Service;
  index: CatalogIndex;
  onOpen: (id: string) => void;
  onMapView: (id: string) => void;
  style?: React.CSSProperties;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const depCount = service.dependencies?.length ?? 0;
  const dependantCount = index.dependantCount(service.serviceId);
  const tier = tierStyle(service.criticalityTier);

  // In select mode the whole card toggles selection; otherwise it opens detail.
  const primary = () => (selectMode ? onToggleSelect?.(service.serviceId) : onOpen(service.serviceId));

  return (
    <div
      className={`svc-card${selectMode ? ' svc-card--select' : ''}${selected ? ' svc-card--selected' : ''}`}
      style={{ ...style, ['--tier' as string]: tier.color, ['--glow' as string]: tier.glow }}
      role="button"
      tabIndex={0}
      onClick={primary}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') primary(); }}
    >
      <span className="svc-card__edge" />
      {selectMode && (
        <span
          className={`svc-card__check${selected ? ' svc-card__check--on' : ''}`}
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${service.name}`}
        />
      )}
      <div className="svc-card__top">
        <TierBadge tier={service.criticalityTier} size="sm" />
        <LifecycleBadge lifecycle={service.lifecycle} />
        <VerifiedBadge verificationDate={service.verificationDate} className="svc-card__verified" />
      </div>

      <h3 className="svc-card__name">{service.name}</h3>
      <code
        className={`svc-card__id mono${selectMode ? ' svc-card__id--link' : ''}`}
        onClick={selectMode ? (e) => { e.stopPropagation(); onOpen(service.serviceId); } : undefined}
        title={selectMode ? 'Open detail page' : undefined}
      >
        {service.serviceId}
      </code>

      {service.description && <p className="svc-card__desc">{service.description}</p>}

      <div className="svc-card__foot">
        <div className="svc-card__owner mono">
          <span className="svc-card__team">{service.team}</span>
          <span className="svc-card__product">Updated: {fmtUpdated(service.lastUpdatedDate)}</span>
        </div>
        <ClassificationBadge value={service.dataClassification} />
      </div>

      <div className="svc-card__stats">
        <span className="depstat">
          <b className="mono">{depCount}</b> deps
        </span>
        <span className="depstat depstat--in">
          <b className="mono">{dependantCount}</b> dependants
        </span>
        {!selectMode && (
          <button
            className="svc-card__open"
            onClick={(e) => { e.stopPropagation(); onMapView(service.serviceId); }}
            tabIndex={0}
            aria-label={`View ${service.name} in mesh`}
          >
            map <ArrowRight width={13} height={13} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npm test -- ServiceCard && npm run typecheck`
Expected: PASS, no type errors. (`CatalogView` doesn't pass the new props yet — they default; existing behavior unchanged.)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ServiceCard.tsx web/src/components/ServiceCard.test.tsx
git commit -m "feat(web): ServiceCard select-mode checkbox + toggle behavior"
```

---

## Task 10: `CatalogView` select mode, selection bar, "Map selected"

**Files:**
- Modify: `web/src/components/CatalogView.tsx`
- Modify: `web/src/App.tsx` (pass `onMapSelected`)
- Create: `web/src/components/CatalogView.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/components/CatalogView.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogView } from './CatalogView';
import { emptyFilters } from './Filters';
import { deriveFacets } from '../data/catalog';
import { makeIndex } from '../test/fixtures';

function renderCatalog(onMapSelected = vi.fn()) {
  const index = makeIndex();
  render(
    <CatalogView
      index={index}
      facets={deriveFacets(index.services)}
      query=""
      filters={emptyFilters()}
      onToggle={vi.fn()}
      onClear={vi.fn()}
      onOpen={vi.fn()}
      onMapView={vi.fn()}
      onMapSelected={onMapSelected}
    />,
  );
  return { onMapSelected };
}

describe('CatalogView multi-select', () => {
  it('shows the selection bar only after enabling Select multiple', async () => {
    renderCatalog();
    expect(screen.queryByText(/selected/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /select multiple/i }));
    expect(screen.getByText(/0 selected/i)).toBeTruthy();
  });

  it('enables Map selected once cards are checked and passes their ids', async () => {
    const { onMapSelected } = renderCatalog();
    await userEvent.click(screen.getByRole('button', { name: /select multiple/i }));

    const mapSelected = screen.getByRole('button', { name: /map selected/i });
    expect(mapSelected).toBeDisabled();

    // fixture services are named by id: 'a','b','c','d'
    await userEvent.click(screen.getByRole('checkbox', { name: /select a/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /select c/i }));
    expect(mapSelected).not.toBeDisabled();

    await userEvent.click(mapSelected);
    expect(onMapSelected).toHaveBeenCalledWith(['a', 'c']);
  });

  it('Clear empties the selection', async () => {
    renderCatalog();
    await userEvent.click(screen.getByRole('button', { name: /select multiple/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /select a/i }));
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(screen.getByText(/0 selected/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- CatalogView`
Expected: FAIL (`onMapSelected` not a prop; no "Select multiple" button).

- [ ] **Step 3: Update `web/src/components/CatalogView.tsx`**

Add `useState` is already imported. Make these changes:

(a) Add `onMapSelected` to the prop list and types — replace the destructured params + type block opening:
```tsx
export function CatalogView({
  index,
  facets,
  query,
  filters,
  onToggle,
  onClear,
  onOpen,
  onMapView,
  onMapSelected,
}: {
  index: CatalogIndex;
  facets: Facets;
  query: string;
  filters: FilterState;
  onToggle: (group: keyof FilterState, value: string) => void;
  onClear: () => void;
  onOpen: (id: string) => void;
  onMapView: (id: string) => void;
  onMapSelected: (ids: string[]) => void;
}) {
```

(b) Add selection state next to the existing `useState` hooks:
```tsx
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectMode = () =>
    setSelectMode((on) => {
      if (on) setSelected(new Set()); // turning off clears the selection
      return !on;
    });
```

(c) In the `results__head`, add the "Select multiple" toggle button right before the Export CSV button:
```tsx
          <button
            className={`sortbtn${selectMode ? ' sortbtn--on' : ''}`}
            onClick={toggleSelectMode}
            aria-pressed={selectMode}
          >
            {selectMode ? '☑ ' : ''}Select multiple
          </button>
```

(d) Immediately after the `</div>` that closes `results__head`, add the selection bar:
```tsx
        {selectMode && (
          <div className="selbar">
            <span className="selbar__count mono"><b>{selected.size}</b> selected</span>
            <button
              className="selbar__cta"
              disabled={selected.size === 0}
              onClick={() => onMapSelected([...selected])}
            >
              Map selected →
            </button>
            <button className="selbar__clear" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <span className="selbar__hint mono">checks persist across filters</span>
          </div>
        )}
```

(e) Pass select props to each `ServiceCard`:
```tsx
              <ServiceCard
                key={s.serviceId}
                service={s}
                index={index}
                onOpen={onOpen}
                onMapView={onMapView}
                selectMode={selectMode}
                selected={selected.has(s.serviceId)}
                onToggleSelect={toggleSelect}
                style={{ animationDelay: `${Math.min(i * 24, 480)}ms` }}
              />
```

- [ ] **Step 4: Pass `onMapSelected` from `App.tsx`**

In `web/src/App.tsx`, in the `<CatalogView … />` element, add the prop:
```tsx
            onMapView={reroot}
            onMapSelected={openMap}
```
(`openMap` already exists from Task 8 and ignores an empty list.)

- [ ] **Step 5: Run the test + typecheck**

Run: `npm test -- CatalogView && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/CatalogView.tsx web/src/App.tsx web/src/components/CatalogView.test.tsx
git commit -m "feat(web): catalog multi-select mode + Map selected"
```

---

## Task 11: Styling (selection bar, card checkbox, roots sidebar)

**Files:**
- Modify: `web/src/app.css`

- [ ] **Step 1: Append styles to `web/src/app.css`**

```css
/* ---- Catalog multi-select ------------------------------------------------ */
.selbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 14px;
  padding: 9px 14px;
  background: #13243f;
  border: 1px solid rgba(27, 116, 203, 0.35);
  border-left: 3px solid var(--blue-500);
  border-radius: var(--r-md);
  font-size: 13px;
  color: var(--text-mid);
}
.selbar__count b { color: var(--text-hi); }
.selbar__cta {
  padding: 6px 12px;
  border: 1px solid var(--blue-500);
  border-radius: var(--r-md);
  background: linear-gradient(180deg, var(--blue-500), var(--accent-deep));
  color: #fff;
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
}
.selbar__cta:disabled { opacity: 0.4; cursor: not-allowed; }
.selbar__clear {
  padding: 6px 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: none;
  color: var(--text-lo);
  font-size: 12.5px;
  cursor: pointer;
}
.selbar__clear:hover { color: var(--text-mid); }
.selbar__hint { margin-left: auto; color: var(--text-lo); font-size: 11px; }

/* Card checkbox (top-left) shown only in select mode. */
.svc-card--select { cursor: pointer; }
.svc-card--selected { border-color: var(--blue-500); box-shadow: 0 0 0 1px rgba(27, 116, 203, 0.45); }
.svc-card__check {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid #4a5570;
  background: #0c0f17;
}
.svc-card__check--on { background: var(--blue-500); border-color: var(--blue-500); }
.svc-card__check--on::after {
  content: "✓";
  position: absolute;
  top: -3px;
  left: 2px;
  color: #fff;
  font-size: 12px;
}
.svc-card__id--link { cursor: pointer; }
.svc-card__id--link:hover { color: var(--text-hi); text-decoration: underline; }

/* ---- Roots sidebar (multi-root map left panel) --------------------------- */
.rootsbar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--hairline);
  background: var(--surface-1);
  padding: 14px;
}
.rootsbar__head { margin-bottom: 12px; }
.rootsbar__list { display: flex; flex-direction: column; gap: 8px; }
.rootrow {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.rootrow__open {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  background: none;
  border: none;
  color: var(--text-mid);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.rootrow__open:hover { color: var(--text-hi); }
.rootrow__dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.rootrow__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rootrow__id { margin-left: auto; font-size: 10px; color: var(--text-lo); flex-shrink: 0; }
.rootrow__rm {
  display: flex;
  align-items: center;
  padding: 0 9px;
  align-self: stretch;
  background: none;
  border: none;
  border-left: 1px solid var(--hairline);
  color: var(--text-lo);
  cursor: pointer;
}
.rootrow__rm:hover { color: var(--error, #e72c2f); }
```

> If any CSS variable above (e.g. `--blue-500`, `--accent-deep`, `--surface-1/2`, `--hairline`, `--r-md`, `--text-hi/mid/lo`) is not defined in `web/src/theme.css`, grep for the closest existing token and substitute it. These names match those already used elsewhere in `app.css`.

- [ ] **Step 2: Manual visual check**

Run: `npm run dev`. Toggle "Select multiple", check a few cards (corner checkbox + selected ring appear), confirm the selection bar looks right, then "Map selected" → multi-root map → confirm the roots sidebar renders cleanly.

- [ ] **Step 3: Commit**

```bash
git add web/src/app.css
git commit -m "style(web): selection bar, card checkbox, roots sidebar"
```

---

## Task 12: Full verification + acceptance

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual acceptance (against the spec)**

Run `npm run dev` and walk the spec's acceptance list:
1. Toggle Select multiple → checkboxes appear, selection bar shows, Map selected disabled at 0.
2. Check 3 cards; apply a filter and change sort → the 3 checks persist.
3. Open a card's detail via the id link, then browser-back → selection cleared (CatalogView remounted).
4. Re-select 3; Map selected → map opens with 3 enlarged roots + sidebar; URL is `#/m/a,b,c`; refresh restores it.
5. ⌘/Ctrl-click a non-root node → added (4 roots); ⌘/Ctrl-click a root → removed.
6. Plain-click a node → collapses to single-root detail map.
7. Remove roots down to 1 → detail panel returns; remove last → back to catalog.
8. Single-root map via a card "map →" still shows the rich ServiceDetail, unchanged.

- [ ] **Step 5: Final commit (if anything was adjusted during verification)**

```bash
git add -A
git commit -m "chore(web): finalize catalog multi-select → multi-root map"
```

---

## Self-Review notes

- **Spec coverage:** select toggle (T10), per-card checkbox (T9), persists across filtering (T10 — local state + mount), Map selected (T10), multi-root map (T8), 1-root detail vs ≥2 sidebar (T7/T8), ⌘/Ctrl+click toggle + plain re-root (T6/T8), shareable `#/m/` (T2/T8), clear-on-leave (T8/T10 via unmount). All covered.
- **Type consistency:** `AppView`, `parseHash`/`viewToHash` (T2) used verbatim in T8. `buildSubgraphElements(index, nodeIds, edges, roots?)` (T4) called in T8. `onNodeClick(id, ev)` (T6) consumed by `handleNodeClick(id, ev)` (T8). `DependencyMap` props `rootIds/onReroot/onToggleRoot` (T8) match App's wiring. `ServiceCard` props `selectMode/selected/onToggleSelect` (T9) match CatalogView (T10). `RootsSidebar` props `index/rootIds/onRemove/onOpenDetail` (T7) match App (T8).
- **Known sharp edge (per spec):** opening a card's detail in select mode clears selection (deliberate — "any navigation away"). Reachable only via the id link, which is the intended affordance.
