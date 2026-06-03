# Dependency Flow (Sankey) View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third top-level **Flow** view — a focused, rooted, multi-hop dependency Sankey — to the service-catalog web explorer.

**Architecture:** A pure layout module (`graph/flow.ts`) reuses `CatalogIndex`'s public adjacency to lay services into columns by hop-distance from a focus, breaking cycles into terminal "ghost" re-entry nodes and computing flow-weighted (blast-radius) band thickness. A dumb SVG renderer (`SankeyCanvas.tsx`) draws the precomputed geometry; a view shell (`FlowView.tsx`) owns the direction/depth/color controls; routing/app/topbar wiring exposes it as `#/f/<id>`.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + RTL + jsdom. No new dependencies — all SVG is hand-rolled, consistent with the existing codebase.

---

## File Structure

**New files**
- `web/src/graph/flow.ts` — layout: layering, ghosting, flow-weights, geometry, caps. Pure, framework-free.
- `web/src/graph/flow.test.ts` — unit tests for the layout.
- `web/src/graph/flowColor.ts` — `linkColor(link, scheme)` + legend descriptor for the 3 color schemes.
- `web/src/graph/flowColor.test.ts` — color-scheme tests.
- `web/src/graph/flowCsv.ts` — pure `flowToCsv(layout)` edge-list export.
- `web/src/graph/flowCsv.test.ts` — csv tests.
- `web/src/components/SankeyCanvas.tsx` — SVG renderer of a `FlowLayout`.
- `web/src/components/SankeyCanvas.test.tsx` — render/click smoke test.
- `web/src/components/FlowView.tsx` — view shell (controls, header, exports).
- `web/src/components/FlowView.test.tsx` — render/reroot/control smoke test.
- `web/src/components/FlowCsvExport.tsx` — small modal wrapping `flowToCsv`.

**Modified files**
- `web/src/data/routing.ts` — add `{ kind:'flow'; rootId }` + `#/f/<id>` (de)serialization.
- `web/src/data/routing.test.ts` — coverage for the flow hash.
- `web/src/test/fixtures.ts` — add `makeCyclicIndex()` for ghost tests.
- `web/src/graph/mermaid.ts` — add `toMermaidSankey(layout)`.
- `web/src/graph/mermaid.test.ts` — coverage for the sankey export.
- `web/src/components/icons.tsx` — add `FlowIcon`.
- `web/src/components/TopBar.tsx` — Flow tab; widen `View` to include `'flow'`.
- `web/src/App.tsx` — `flow` render branch, `openFlow`, focus validation/default hub, `lastTopView`.
- `web/src/components/ServiceCard.tsx` — "Flow" affordance (`onFlowView`).
- `web/src/components/ServiceDetail.tsx` — "Flow" affordance (`onOpenFlow`).
- `web/src/app.css` — Flow view + Sankey styles.

---

## Task 1: Routing — the `flow` view kind

**Files:**
- Modify: `web/src/data/routing.ts`
- Test: `web/src/data/routing.test.ts`

- [ ] **Step 1: Add failing tests**

In `web/src/data/routing.test.ts`, add inside the `describe('parseHash', …)` block:

```ts
  it('parses a flow view', () => {
    expect(parseHash('#/f/clearing-api')).toEqual({ kind: 'flow', rootId: 'clearing-api' });
  });
  it('falls back to catalog for an empty flow id', () => {
    expect(parseHash('#/f/')).toEqual({ kind: 'catalog' });
  });
  it('decodes percent-encoded flow ids', () => {
    expect(parseHash('#/f/a%2Fb')).toEqual({ kind: 'flow', rootId: 'a/b' });
  });
```

And add this row to the `viewToHash` `cases` array:

```ts
    [{ kind: 'flow', rootId: 'clearing-api' }, '#/f/clearing-api'],
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/data/routing.test.ts`
Expected: FAIL — `parseHash` returns `{ kind:'catalog' }` for `#/f/...`; TS error on the `flow` variant not existing.

- [ ] **Step 3: Implement in `web/src/data/routing.ts`**

Add the variant to the union:

```ts
export type AppView =
  | { kind: 'catalog' }
  | { kind: 'mesh' }
  | { kind: 'detail'; id: string }
  | { kind: 'map'; rootIds: string[] }
  | { kind: 'flow'; rootId: string };
```

In `parseHash`, add before the final `return { kind: 'catalog' }`:

```ts
  if (h.startsWith('f/')) {
    const rootId = decodeURIComponent(h.slice(2));
    return rootId ? { kind: 'flow', rootId } : { kind: 'catalog' };
  }
```

In `viewToHash`'s switch, add:

```ts
    case 'flow':
      return `#/f/${encodeURIComponent(view.rootId)}`;
```

Update the doc comment block to mention `#/f/<id>  focused dependency flow (Sankey)`.

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/data/routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/data/routing.ts web/src/data/routing.test.ts
git commit -m "feat(web): add flow view kind to routing"
```

---

## Task 2: Test fixture — a cyclic index

**Files:**
- Modify: `web/src/test/fixtures.ts`

- [ ] **Step 1: Add `makeCyclicIndex` to `web/src/test/fixtures.ts`**

Append:

```ts
/** Graph with a cycle and a shared leaf:
 *    a -> b -> a   (cycle back to root)
 *    a -> c -> ext-x
 *    b -> c        (shared: c has two in-edges)
 */
export function makeCyclicIndex(): CatalogIndex {
  const services: Service[] = [
    makeService({ serviceId: 'a', dependencies: [dep('b'), dep('c')] }),
    makeService({ serviceId: 'b', dependencies: [dep('a'), dep('c')] }),
    makeService({ serviceId: 'c', dependencies: [dep('ext-x', true)] }),
  ];
  const catalog: Catalog = { generatedFrom: 'test', count: services.length, services };
  return new CatalogIndex(catalog);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no test runs this yet; just confirm it compiles).

- [ ] **Step 3: Commit**

```bash
git add web/src/test/fixtures.ts
git commit -m "test(web): add cyclic catalog fixture for flow layout"
```

---

## Task 3: `graph/flow.ts` — layering, ghosting, branch

**Files:**
- Create: `web/src/graph/flow.ts`
- Test: `web/src/graph/flow.test.ts`

This task builds the graph transform. `buildFlowLayout` is a pipeline; this task implements `assignColumns` + `classify` + `groupByColumn` and **stubs** `computeWeights` (weight = 1), `applyCaps` (no-op), and `layout` (geometry = 0). Tasks 4–6 fill the stubs.

- [ ] **Step 1: Write the failing test `web/src/graph/flow.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildFlowLayout } from './flow';
import { makeIndex, makeCyclicIndex } from '../test/fixtures';

const OPTS = { width: 800, height: 400 } as const;

function node(layout: ReturnType<typeof buildFlowLayout>, id: string) {
  return layout.nodes.find((n) => n.id === id);
}

describe('buildFlowLayout — layering', () => {
  it('assigns downstream columns by hop distance', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    expect(node(layout, 'a')!.column).toBe(0);
    expect(node(layout, 'b')!.column).toBe(1);
    expect(node(layout, 'c')!.column).toBe(2);
    expect(node(layout, 'ext-x')!.column).toBe(3);
    expect(node(layout, 'ext-x')!.isExternal).toBe(true);
  });

  it('assigns upstream columns as negative', () => {
    const layout = buildFlowLayout(makeIndex(), 'c', { mode: 'dependants', depth: 0, ...OPTS });
    expect(node(layout, 'c')!.column).toBe(0);
    expect(node(layout, 'b')!.column).toBe(-1);
    expect(node(layout, 'a')!.column).toBe(-2);
  });

  it('bounds the node set by depth', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 1, ...OPTS });
    expect(node(layout, 'b')).toBeTruthy();
    expect(node(layout, 'c')).toBeUndefined();
  });

  it('places the root at column 0 in both mode', () => {
    const layout = buildFlowLayout(makeIndex(), 'b', { mode: 'both', depth: 1, ...OPTS });
    expect(node(layout, 'b')!.column).toBe(0);
    expect(node(layout, 'a')!.column).toBe(-1); // a depends on b -> upstream
    expect(node(layout, 'c')!.column).toBe(1);  // b depends on c -> downstream
  });
});

describe('buildFlowLayout — ghosting', () => {
  it('breaks a cycle into a terminal ghost', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    const ghost = layout.nodes.find((n) => n.isGhost);
    expect(ghost).toBeTruthy();
    expect(ghost!.realId).toBe('a');           // b -> a loops back to root
    expect(ghost!.column).toBe(2);             // placed at source(b=1).column + 1
    // ghost is terminal: no link leaves it
    expect(layout.links.some((l) => l.source === ghost!.id)).toBe(false);
    // the closing link is flagged
    const closing = layout.links.find((l) => l.target === ghost!.id);
    expect(closing!.isBackEdge).toBe(true);
  });

  it('keeps a cross-layer dependency as a single forward band', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    // a->c and b->c: c (col 1) has two real incoming bands, not a ghost
    const intoC = layout.links.filter((l) => l.target === 'c');
    expect(intoC.length).toBe(2);
    expect(intoC.every((l) => l.isBackEdge === false)).toBe(true);
  });

  it('tags each link with its first-hop branch', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    expect(layout.links.find((l) => l.source === 'a' && l.target === 'b')!.branch).toBe('b');
    expect(layout.links.find((l) => l.source === 'b' && l.target === 'c')!.branch).toBe('b');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/flow.test.ts`
Expected: FAIL — `Cannot find module './flow'`.

- [ ] **Step 3: Implement `web/src/graph/flow.ts`**

```ts
import type { CatalogIndex } from '../data/catalog';
import type { Depth, Edge, MapMode } from '../types';

export const NODE_W = 13;

export interface FlowNode {
  id: string;        // serviceId, or `${realId}__ghost@${column}` for ghosts
  realId: string;    // serviceId this node/ghost represents (reroot target)
  label: string;
  column: number;    // 0 = focus, +n downstream, -n upstream
  isExternal: boolean;
  isGhost: boolean;
  x: number; y0: number; y1: number;
}

export interface FlowLink {
  source: string; target: string;
  edge: Edge;
  weight: number;
  branch: string;
  isBackEdge: boolean;
  sy0: number; sy1: number; ty0: number; ty1: number;
}

export interface FlowColumn { column: number; nodes: FlowNode[]; }

export interface FlowLayout {
  rootId: string;
  columns: FlowColumn[];
  nodes: FlowNode[];
  links: FlowLink[];
  truncated: number;
}

export interface FlowOpts {
  mode: MapMode;
  depth: Depth;
  width: number;
  height: number;
  nodeCap?: number;
}

const GAP = 10;
const PAD = 28;
const DEFAULT_CAP = 24;

/** BFS outward from the root in the active direction(s); returns signed
 *  shortest-hop columns and the first-hop branch each node descends from. */
function assignColumns(index: CatalogIndex, rootId: string, mode: MapMode, depth: Depth) {
  const limit = depth === 0 ? Infinity : depth;
  const col = new Map<string, number>([[rootId, 0]]);
  const branch = new Map<string, string>([[rootId, '']]);

  const bfs = (sign: number, neighborsOf: (id: string) => string[]) => {
    const visited = new Set<string>([rootId]);
    let frontier = [rootId];
    let hop = 0;
    while (frontier.length && hop < limit) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of neighborsOf(id)) {
          if (visited.has(n)) continue;
          visited.add(n);
          if (!col.has(n)) {
            col.set(n, sign * (hop + 1));
            branch.set(n, hop === 0 ? n : branch.get(id) ?? id);
          }
          next.push(n);
        }
      }
      frontier = next;
      hop++;
    }
  };

  if (mode === 'dependencies' || mode === 'both')
    bfs(+1, (id) => index.dependenciesOf(id).map((e) => e.to));
  if (mode === 'dependants' || mode === 'both')
    bfs(-1, (id) => index.dependantsOf(id).map((e) => e.from));

  return { col, branch };
}

/** Label for a node id: catalog name, or titleized external/ghost. */
function labelFor(index: CatalogIndex, id: string): string {
  return index.node(id)?.kind === 'service'
    ? index.byId.get(id)!.name
    : index.externals.get(id)?.name ?? id;
}

/** Build FlowNodes + FlowLinks, introducing ghost re-entry nodes for any
 *  edge that doesn't go strictly left→right (target column ≤ source column). */
function classify(index: CatalogIndex, col: Map<string, number>, branch: Map<string, string>, rootId: string) {
  const nodes = new Map<string, FlowNode>();
  const ensureReal = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id, realId: id, label: labelFor(index, id), column: col.get(id)!,
        isExternal: index.node(id)?.kind !== 'service', isGhost: false,
        x: 0, y0: 0, y1: 0,
      });
    }
    return nodes.get(id)!;
  };
  // every assigned service/external becomes a node
  for (const id of col.keys()) ensureReal(id);

  const links: FlowLink[] = [];
  for (const e of index.allEdges) {
    const cf = col.get(e.from);
    const ct = col.get(e.to);
    if (cf === undefined || ct === undefined) continue; // edge leaves the scope
    const fartherIsTarget = Math.abs(ct) >= Math.abs(cf);
    const farther = fartherIsTarget ? e.to : e.from;
    const branchOf = branch.get(farther) || branch.get(e.from) || e.from;

    if (cf < ct) {
      links.push({
        source: e.from, target: e.to, edge: e, weight: 1, branch: branchOf,
        isBackEdge: false, sy0: 0, sy1: 0, ty0: 0, ty1: 0,
      });
    } else {
      // back-edge / same-layer / cycle -> ghost terminal at source.column + 1
      const ghostCol = cf + 1;
      const ghostId = `${e.to}__ghost@${ghostCol}`;
      if (!nodes.has(ghostId)) {
        nodes.set(ghostId, {
          id: ghostId, realId: e.to, label: labelFor(index, e.to), column: ghostCol,
          isExternal: index.node(e.to)?.kind !== 'service', isGhost: true,
          x: 0, y0: 0, y1: 0,
        });
      }
      links.push({
        source: e.from, target: ghostId, edge: e, weight: 1, branch: branch.get(e.from) || e.from,
        isBackEdge: true, sy0: 0, sy1: 0, ty0: 0, ty1: 0,
      });
    }
  }

  return { nodes: [...nodes.values()], links };
}

function groupByColumn(nodes: FlowNode[]): FlowColumn[] {
  const by = new Map<number, FlowNode[]>();
  for (const n of nodes) {
    const arr = by.get(n.column);
    if (arr) arr.push(n);
    else by.set(n.column, [n]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([column, ns]) => ({ column, nodes: ns }));
}

/** STUB — filled in Task 4. */
function computeWeights(_nodes: FlowNode[], links: FlowLink[]): void {
  for (const l of links) l.weight = 1;
}

/** STUB — filled in Task 6. */
function applyCaps(nodes: FlowNode[], links: FlowLink[], _cap: number): { nodes: FlowNode[]; links: FlowLink[]; truncated: number } {
  return { nodes, links, truncated: 0 };
}

/** STUB — filled in Task 5. */
function layout(_columns: FlowColumn[], _links: FlowLink[], _width: number, _height: number): void {
  /* geometry filled in Task 5 */
}

export function buildFlowLayout(index: CatalogIndex, rootId: string, opts: FlowOpts): FlowLayout {
  const { col, branch } = assignColumns(index, rootId, opts.mode, opts.depth);
  const { nodes: allNodes, links: allLinks } = classify(index, col, branch, rootId);
  computeWeights(allNodes, allLinks);
  const { nodes, links, truncated } = applyCaps(allNodes, allLinks, opts.nodeCap ?? DEFAULT_CAP);
  const columns = groupByColumn(nodes);
  layout(columns, links, opts.width, opts.height);
  return { rootId, columns, nodes, links, truncated };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/flow.test.ts`
Expected: PASS (layering + ghosting tests). Weights/geometry still stubbed.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/graph/flow.ts web/src/graph/flow.test.ts
git commit -m "feat(web): flow layout layering + ghost re-entry"
```

---

## Task 4: `graph/flow.ts` — flow weights (blast radius)

**Files:**
- Modify: `web/src/graph/flow.ts`
- Test: `web/src/graph/flow.test.ts`

- [ ] **Step 1: Add failing weight tests**

Append to `web/src/graph/flow.test.ts`:

```ts
function link(layout: ReturnType<typeof buildFlowLayout>, s: string, t: string) {
  return layout.links.find((l) => l.source === s && l.target === t)!;
}

describe('buildFlowLayout — flow weights', () => {
  it('weighs a leaf edge 1 and a trunk by its subtree size', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    expect(link(layout, 'c', 'ext-x').weight).toBe(1);      // leaf
    expect(link(layout, 'b', 'c').weight).toBe(2);          // c, ext-x
    expect(link(layout, 'a', 'b').weight).toBe(3);          // b, c, ext-x
  });

  it('is non-increasing along a path away from the root', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const ab = link(layout, 'a', 'b').weight;
    const bc = link(layout, 'b', 'c').weight;
    const cx = link(layout, 'c', 'ext-x').weight;
    expect(ab).toBeGreaterThanOrEqual(bc);
    expect(bc).toBeGreaterThanOrEqual(cx);
  });

  it('weighs a back-edge (ghost) link 1', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const back = layout.links.find((l) => l.isBackEdge)!;
    expect(back.weight).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/flow.test.ts`
Expected: FAIL — every weight is currently 1, so the trunk assertions fail.

- [ ] **Step 3: Replace the `computeWeights` stub in `web/src/graph/flow.ts`**

```ts
/** Flow weight = blast radius of the endpoint FARTHER from the root: the count
 *  of distinct services reachable continuing away from the root. Leaves/ghosts
 *  weigh 1. Computed on the post-ghost DAG (|column| strictly increases along
 *  the away direction → acyclic), memoized. */
function computeWeights(nodes: FlowNode[], links: FlowLink[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // awayAdj[n] = farther neighbors reached by stepping away from the root.
  const awayAdj = new Map<string, string[]>();
  for (const n of nodes) awayAdj.set(n.id, []);
  for (const l of links) {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    const nearer = Math.abs(s.column) < Math.abs(t.column) ? s : t;
    const farther = nearer === s ? t : s;
    if (Math.abs(farther.column) > Math.abs(nearer.column)) {
      awayAdj.get(nearer.id)!.push(farther.id);
    }
  }
  const memo = new Map<string, Set<string>>();
  const reach = (id: string): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const acc = new Set<string>([byId.get(id)!.realId]);
    memo.set(id, acc); // set before recursing; DAG guarantees no self-cycle
    for (const m of awayAdj.get(id)!) for (const r of reach(m)) acc.add(r);
    return acc;
  };
  for (const l of links) {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    const farther = Math.abs(t.column) >= Math.abs(s.column) ? t : s;
    l.weight = Math.max(1, reach(farther.id).size);
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/flow.ts web/src/graph/flow.test.ts
git commit -m "feat(web): flow-weighted (blast-radius) band thickness"
```

---

## Task 5: `graph/flow.ts` — geometry packing

**Files:**
- Modify: `web/src/graph/flow.ts`
- Test: `web/src/graph/flow.test.ts`

- [ ] **Step 1: Add failing geometry tests**

Append to `web/src/graph/flow.test.ts`:

```ts
describe('buildFlowLayout — geometry', () => {
  const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });

  it('keeps every node rect within the viewport', () => {
    for (const n of layout.nodes) {
      expect(n.y0).toBeGreaterThanOrEqual(0);
      expect(n.y1).toBeLessThanOrEqual(400);
      expect(n.y1).toBeGreaterThan(n.y0);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(800);
    }
  });

  it('orders columns left→right by ascending column index with increasing x', () => {
    const cols = layout.columns;
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i].column).toBeGreaterThan(cols[i - 1].column);
      expect(cols[i].nodes[0].x).toBeGreaterThanOrEqual(cols[i - 1].nodes[0].x);
    }
  });

  it('sizes a band consistently on both ends (∝ weight)', () => {
    const ab = link(layout, 'a', 'b');
    expect(Math.round(ab.sy1 - ab.sy0)).toBe(Math.round(ab.ty1 - ab.ty0));
    const cx = link(layout, 'c', 'ext-x');
    expect(ab.sy1 - ab.sy0).toBeGreaterThan(cx.sy1 - cx.sy0); // heavier band is thicker
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/flow.test.ts`
Expected: FAIL — geometry is all zeros (`y1 > y0` fails).

- [ ] **Step 3: Replace the `layout` stub in `web/src/graph/flow.ts`**

```ts
/** Sankey packing: x by column, y by stacked value (max of in/out weight),
 *  band endpoints by a per-node running offset. Mutates node/link geometry. */
function layout(columns: FlowColumn[], links: FlowLink[], width: number, height: number): void {
  const byId = new Map<string, FlowNode>();
  for (const c of columns) for (const n of c.nodes) byId.set(n.id, n);

  // node value = max(sum incoming weight, sum outgoing weight, 1)
  const inSum = new Map<string, number>();
  const outSum = new Map<string, number>();
  for (const l of links) {
    inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.weight);
    outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.weight);
  }
  const value = (n: FlowNode) => Math.max(inSum.get(n.id) ?? 0, outSum.get(n.id) ?? 0, 1);

  // single figure-wide value→px scale
  const colTotals = columns.map((c) => c.nodes.reduce((a, n) => a + value(n), 0));
  const maxTotal = Math.max(1, ...colTotals);
  const maxNodes = Math.max(1, ...columns.map((c) => c.nodes.length));
  const usable = Math.max(1, height - 2 * PAD - GAP * (maxNodes - 1));
  const scale = usable / maxTotal;

  // x per column: evenly spread between left/right label margins
  const xLeft = 64;
  const xRight = Math.max(xLeft + NODE_W, width - 80);
  const span = columns.length > 1 ? (xRight - xLeft) / (columns.length - 1) : 0;
  columns.forEach((c, i) => {
    const x = columns.length > 1 ? xLeft + i * span : (width - NODE_W) / 2;
    c.nodes.forEach((n) => (n.x = x));
  });

  // barycenter ordering of each column by the mean y of already-placed neighbors
  // in the column nearer the root; root column (index of column 0) seeds first.
  const rootColIdx = columns.findIndex((c) => c.column === 0);
  const place = (c: FlowColumn) => {
    const total = c.nodes.reduce((a, n) => a + value(n), 0);
    const colH = total * scale + GAP * (c.nodes.length - 1);
    let y = (height - colH) / 2;
    for (const n of c.nodes) {
      const h = value(n) * scale;
      n.y0 = y; n.y1 = y + h; y += h + GAP;
    }
  };
  // place root column, then fan outward both directions
  place(columns[rootColIdx]);
  const order = [...Array(columns.length).keys()].sort(
    (a, b) => Math.abs(columns[a].column) - Math.abs(columns[b].column),
  );
  for (const i of order) {
    if (i === rootColIdx) continue;
    const c = columns[i];
    const nearerCol = columns.find((cc) => cc.column === c.column + (c.column > 0 ? -1 : 1));
    if (nearerCol) {
      const yOf = (id: string) => { const n = byId.get(id); return n ? (n.y0 + n.y1) / 2 : 0; };
      const bary = (n: FlowNode) => {
        const ys = links
          .filter((l) => l.source === n.id || l.target === n.id)
          .map((l) => (l.source === n.id ? l.target : l.source))
          .filter((id) => nearerCol.nodes.some((nn) => nn.id === id))
          .map(yOf);
        return ys.length ? ys.reduce((a, v) => a + v, 0) / ys.length : Number.MAX_SAFE_INTEGER;
      };
      c.nodes.sort((a, b) => bary(a) - bary(b));
    }
    place(c);
  }

  // band endpoints: running offset per node on each side
  const oOff = new Map<string, number>();
  const iOff = new Map<string, number>();
  for (const n of byId.values()) { oOff.set(n.id, n.y0); iOff.set(n.id, n.y0); }
  // draw heavier bands first for a tidier stack
  for (const l of [...links].sort((a, b) => b.weight - a.weight)) {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    const h = l.weight * scale;
    l.sy0 = oOff.get(s.id)!; l.sy1 = l.sy0 + h; oOff.set(s.id, l.sy1);
    l.ty0 = iOff.get(t.id)!; l.ty1 = l.ty0 + h; iOff.set(t.id, l.ty1);
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify typecheck + full suite**

Run: `npm run typecheck && npm test -- src/graph/flow.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/graph/flow.ts web/src/graph/flow.test.ts
git commit -m "feat(web): flow geometry packing (columns, stacks, bands)"
```

---

## Task 6: `graph/flow.ts` — per-column caps

**Files:**
- Modify: `web/src/graph/flow.ts`
- Test: `web/src/graph/flow.test.ts`

- [ ] **Step 1: Add failing cap test**

Append to `web/src/graph/flow.test.ts`:

```ts
describe('buildFlowLayout — caps', () => {
  it('caps a column and reports the dropped count', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', {
      mode: 'dependencies', depth: 1, width: 800, height: 400, nodeCap: 0,
    });
    // nodeCap 0 forces every non-root column to be fully truncated
    expect(layout.truncated).toBeGreaterThan(0);
    // root is never dropped
    expect(layout.nodes.some((n) => n.id === 'a')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/flow.test.ts`
Expected: FAIL — `truncated` is always 0.

- [ ] **Step 3: Replace the `applyCaps` stub in `web/src/graph/flow.ts`**

```ts
/** Bound runaway columns: keep the heaviest nodes per column, drop the rest,
 *  prune dangling links, and report how many nodes were hidden. The root
 *  (column 0) is never dropped. */
function applyCaps(nodes: FlowNode[], links: FlowLink[], cap: number): { nodes: FlowNode[]; links: FlowLink[]; truncated: number } {
  const weightOf = new Map<string, number>();
  for (const l of links) {
    weightOf.set(l.source, Math.max(weightOf.get(l.source) ?? 0, l.weight));
    weightOf.set(l.target, Math.max(weightOf.get(l.target) ?? 0, l.weight));
  }
  const byCol = new Map<number, FlowNode[]>();
  for (const n of nodes) {
    const arr = byCol.get(n.column);
    if (arr) arr.push(n);
    else byCol.set(n.column, [n]);
  }
  const keep = new Set<string>();
  let truncated = 0;
  for (const [column, ns] of byCol) {
    if (column === 0) { ns.forEach((n) => keep.add(n.id)); continue; }
    const sorted = [...ns].sort((a, b) => (weightOf.get(b.id) ?? 0) - (weightOf.get(a.id) ?? 0));
    sorted.slice(0, cap).forEach((n) => keep.add(n.id));
    truncated += Math.max(0, sorted.length - cap);
  }
  const keptNodes = nodes.filter((n) => keep.has(n.id));
  const keptLinks = links.filter((l) => keep.has(l.source) && keep.has(l.target));
  return { nodes: keptNodes, links: keptLinks, truncated };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/flow.test.ts`
Expected: PASS (all flow.test.ts blocks).

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/flow.ts web/src/graph/flow.test.ts
git commit -m "feat(web): per-column node caps with truncation count"
```

---

## Task 7: `graph/flowColor.ts` — color schemes

**Files:**
- Create: `web/src/graph/flowColor.ts`
- Test: `web/src/graph/flowColor.test.ts`

- [ ] **Step 1: Write the failing test `web/src/graph/flowColor.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { linkColor, legendFor, type ColorScheme } from './flowColor';
import type { FlowLink } from './flow';
import type { Edge } from '../types';

function mkLink(partial: Partial<Edge['dep']> & { branch?: string }): FlowLink {
  const dep = { serviceId: 'x', interaction: 'sync-http', critical: false, purpose: '', external: false, ...partial } as Edge['dep'];
  return {
    source: 's', target: 't', edge: { from: 's', to: 't', dep },
    weight: 1, branch: partial.branch ?? 'b', isBackEdge: false,
    sy0: 0, sy1: 0, ty0: 0, ty1: 0,
  };
}

describe('linkColor', () => {
  it('criticality: critical links are hot, others muted', () => {
    const crit = linkColor(mkLink({ critical: true }), 'criticality');
    const noncrit = linkColor(mkLink({ critical: false }), 'criticality');
    expect(crit).not.toBe(noncrit);
  });

  it('interaction: distinct colors per interaction type', () => {
    const sync = linkColor(mkLink({ interaction: 'sync-http' }), 'interaction');
    const async = linkColor(mkLink({ interaction: 'async-event' }), 'interaction');
    expect(sync).not.toBe(async);
  });

  it('branch: same branch → same color, different branch → different', () => {
    const b1 = linkColor(mkLink({ branch: 'alpha' }), 'branch');
    const b1b = linkColor(mkLink({ branch: 'alpha' }), 'branch');
    const b2 = linkColor(mkLink({ branch: 'beta' }), 'branch');
    expect(b1).toBe(b1b);
    expect(b1).not.toBe(b2);
  });

  it('legendFor returns labelled swatches for each scheme', () => {
    (['criticality', 'interaction', 'branch'] as ColorScheme[]).forEach((s) => {
      expect(legendFor(s).length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/flowColor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/graph/flowColor.ts`**

```ts
import type { FlowLink } from './flow';
import type { Interaction } from '../types';

export type ColorScheme = 'criticality' | 'interaction' | 'branch';

const CRIT_HOT = '#FF4D5E';
const CRIT_MUTED = '#54657d';

const INTERACTION_COLORS: Record<string, string> = {
  'sync-http': '#519ee6',
  'async-http': '#6cafe7',
  'async-event': '#4FD6A0',
  s3: '#FFB454',
  sftp: '#c08af0',
  batch: '#8f87e0',
  fdw: '#39c0c8',
  dms: '#e07fb0',
  grpc: '#5bd0e0',
  soap: '#b0884f',
  infrastructure: '#7d8ba1',
};
const INTERACTION_FALLBACK = '#7d8ba1';

const BRANCH_PALETTE = [
  '#519ee6', '#FF9F45', '#4FD6A0', '#8f87e0', '#FF4D5E',
  '#39c0c8', '#FFB454', '#c08af0', '#6cafe7', '#e07fb0',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function linkColor(link: FlowLink, scheme: ColorScheme): string {
  switch (scheme) {
    case 'criticality':
      return link.edge.dep.critical ? CRIT_HOT : CRIT_MUTED;
    case 'interaction':
      return INTERACTION_COLORS[link.edge.dep.interaction as Interaction] ?? INTERACTION_FALLBACK;
    case 'branch':
      return BRANCH_PALETTE[hash(link.branch) % BRANCH_PALETTE.length];
  }
}

export interface LegendItem { label: string; color: string; }

export function legendFor(scheme: ColorScheme): LegendItem[] {
  if (scheme === 'criticality')
    return [{ label: 'critical', color: CRIT_HOT }, { label: 'non-critical', color: CRIT_MUTED }];
  if (scheme === 'interaction')
    return Object.entries(INTERACTION_COLORS).map(([label, color]) => ({ label, color }));
  return [{ label: 'one hue per first-hop branch', color: BRANCH_PALETTE[0] }];
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/flowColor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/flowColor.ts web/src/graph/flowColor.test.ts
git commit -m "feat(web): flow color schemes (criticality/interaction/branch)"
```

---

## Task 8: `graph/mermaid.ts` — `toMermaidSankey`

**Files:**
- Modify: `web/src/graph/mermaid.ts`
- Test: `web/src/graph/mermaid.test.ts`

- [ ] **Step 1: Add failing test**

Append to `web/src/graph/mermaid.test.ts`:

```ts
import { toMermaidSankey } from './mermaid';
import { buildFlowLayout } from './flow';
import { makeIndex } from '../test/fixtures';

describe('toMermaidSankey', () => {
  it('emits a sankey-beta header and source,target,value rows', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const code = toMermaidSankey(layout);
    expect(code).toMatch(/^sankey-beta/m);
    expect(code).toContain('a,b,3');     // a->b weight 3
    expect(code).toContain('c,ext-x,1'); // leaf
  });

  it('labels ghost targets with a loop marker', () => {
    const { makeCyclicIndex } = require('../test/fixtures');
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const code = toMermaidSankey(layout);
    expect(code).toMatch(/loop/i);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/mermaid.test.ts`
Expected: FAIL — `toMermaidSankey` is not exported.

- [ ] **Step 3: Add `toMermaidSankey` to `web/src/graph/mermaid.ts`**

```ts
import type { FlowLayout } from './flow';

/** Mermaid `sankey-beta` rows from a FlowLayout. Mermaid sankey is CSV-bodied:
 *  one `source,target,value` line per link. Ghost targets get a "(loop)" label
 *  so the re-entry reads clearly. Labels are sanitized (commas/quotes stripped). */
export function toMermaidSankey(layout: FlowLayout): string {
  const labelOf = new Map(layout.nodes.map((n) => [n.id, n.isGhost ? `${n.label} (loop)` : n.label]));
  const clean = (s: string) => s.replace(/[",]/g, ' ').trim();
  const rows = layout.links.map((l) => {
    const src = clean(labelOf.get(l.source) ?? l.source);
    const tgt = clean(labelOf.get(l.target) ?? l.target);
    return `${src},${tgt},${l.weight}`;
  });
  return ['sankey-beta', '', ...rows].join('\n');
}
```

(Use the existing import style in the file; place the `FlowLayout` import with the other imports.)

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/mermaid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/mermaid.ts web/src/graph/mermaid.test.ts
git commit -m "feat(web): mermaid sankey-beta export for flow"
```

---

## Task 9: `graph/flowCsv.ts` — edge-list CSV

**Files:**
- Create: `web/src/graph/flowCsv.ts`
- Test: `web/src/graph/flowCsv.test.ts`

- [ ] **Step 1: Write the failing test `web/src/graph/flowCsv.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { flowToCsv } from './flowCsv';
import { buildFlowLayout } from './flow';
import { makeIndex } from '../test/fixtures';

describe('flowToCsv', () => {
  it('emits a header and one row per link', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
    const csv = flowToCsv(layout);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('source,target,interaction,critical,weight,hop');
    expect(lines.length).toBe(1 + layout.links.length);
    expect(csv).toContain('a,b,sync-http,false,3,1');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/graph/flowCsv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/graph/flowCsv.ts`**

```ts
import type { FlowLayout, FlowNode } from './flow';

function esc(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Edge-list CSV of the current flow: one row per link. `hop` = target column
 *  distance from the focus (|column|). */
export function flowToCsv(layout: FlowLayout): string {
  const byId = new Map<string, FlowNode>(layout.nodes.map((n) => [n.id, n]));
  const header = 'source,target,interaction,critical,weight,hop';
  const rows = layout.links.map((l) => {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    return [
      esc(s.realId), esc(t.realId), esc(l.edge.dep.interaction),
      esc(l.edge.dep.critical), esc(l.weight), esc(Math.abs(t.column)),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/graph/flowCsv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/graph/flowCsv.ts web/src/graph/flowCsv.test.ts
git commit -m "feat(web): flow edge-list CSV export"
```

---

## Task 10: `icons.tsx` — Flow icon

**Files:**
- Modify: `web/src/components/icons.tsx`

- [ ] **Step 1: Add a `FlowIcon` export**

Follow the existing icon signature in `icons.tsx` (each icon takes `{ width, height, className }` and returns an `<svg>`). Add:

```tsx
export function FlowIcon({ width = 16, height = 16, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2" y="3" width="3" height="7" rx="1" fill="currentColor" />
      <rect x="2" y="14" width="3" height="6" rx="1" fill="currentColor" />
      <rect x="19" y="6" width="3" height="11" rx="1" fill="currentColor" />
      <path d="M5 6.5 C12 6.5 12 11.5 19 11.5" stroke="currentColor" strokeWidth="2.4" opacity="0.5" fill="none" />
      <path d="M5 17 C12 17 12 11.5 19 11.5" stroke="currentColor" strokeWidth="1.6" opacity="0.35" fill="none" />
    </svg>
  );
}
```

If `icons.tsx` defines its own `IconProps`/inline prop type, match it exactly (reuse the type the other icons use rather than introducing a new one).

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/icons.tsx
git commit -m "feat(web): add FlowIcon"
```

---

## Task 11: `SankeyCanvas.tsx` — SVG renderer

**Files:**
- Create: `web/src/components/SankeyCanvas.tsx`
- Test: `web/src/components/SankeyCanvas.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/components/SankeyCanvas.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SankeyCanvas } from './SankeyCanvas';
import { buildFlowLayout } from '../graph/flow';
import { makeIndex } from '../test/fixtures';

function layout() {
  return buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, width: 800, height: 400 });
}

describe('SankeyCanvas', () => {
  it('renders a node rect for each service', () => {
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={() => {}} />);
    expect(screen.getByTestId('flow-node-b')).toBeInTheDocument();
    expect(screen.getByTestId('flow-node-c')).toBeInTheDocument();
  });

  it('reroots on node click', async () => {
    const onReroot = vi.fn();
    render(<SankeyCanvas layout={layout()} colorScheme="criticality" onReroot={onReroot} />);
    await userEvent.click(screen.getByTestId('flow-node-b'));
    expect(onReroot).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/components/SankeyCanvas.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/components/SankeyCanvas.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { FlowLayout, FlowNode, FlowLink } from '../graph/flow';
import { NODE_W } from '../graph/flow';
import { linkColor, type ColorScheme } from '../graph/flowColor';

interface Props {
  layout: FlowLayout;
  colorScheme: ColorScheme;
  onReroot: (realId: string) => void;
  width?: number;
  height?: number;
}

function bandPath(l: FlowLink, nodeX: (id: string) => number): string {
  const x1 = nodeX(l.source) + NODE_W;
  const x2 = nodeX(l.target);
  const cx = (x1 + x2) / 2;
  return `M${x1},${l.sy0} C${cx},${l.sy0} ${cx},${l.ty0} ${x2},${l.ty0} ` +
         `L${x2},${l.ty1} C${cx},${l.ty1} ${cx},${l.sy1} ${x1},${l.sy1} Z`;
}

export function SankeyCanvas({ layout, colorScheme, onReroot, width = 800, height = 400 }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const xOf = useMemo(() => {
    const m = new Map(layout.nodes.map((n) => [n.id, n.x]));
    return (id: string) => m.get(id) ?? 0;
  }, [layout]);

  // ids connected to the hovered node (for focus-dim)
  const connected = useMemo(() => {
    if (!hover) return null;
    const ids = new Set<string>([hover]);
    for (const l of layout.links) {
      if (l.source === hover) ids.add(l.target);
      if (l.target === hover) ids.add(l.source);
    }
    return ids;
  }, [hover, layout]);

  const dim = (id: string) => (connected && !connected.has(id) ? 0.12 : 1);

  const click = (n: FlowNode) => { if (!n.isExternal) onReroot(n.realId); };

  return (
    <svg className="sankey" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dependency flow">
      <g className="sankey__links">
        {layout.links.map((l, i) => {
          const lit = !connected || connected.has(l.source) || connected.has(l.target);
          return (
            <path
              key={i}
              d={bandPath(l, xOf)}
              fill={linkColor(l, colorScheme)}
              opacity={lit ? (l.isBackEdge ? 0.32 : 0.5) : 0.08}
              strokeDasharray={l.isBackEdge ? '6 4' : undefined}
              stroke={l.isBackEdge ? linkColor(l, colorScheme) : undefined}
              strokeWidth={l.isBackEdge ? 1 : undefined}
            />
          );
        })}
      </g>
      <g className="sankey__nodes">
        {layout.nodes.map((n) => {
          const isLast = n.column === Math.max(...layout.columns.map((c) => c.column));
          const isFirst = n.column === Math.min(...layout.columns.map((c) => c.column));
          const mid = (n.y0 + n.y1) / 2;
          return (
            <g key={n.id} opacity={dim(n.id)}>
              <rect
                data-testid={`flow-node-${n.realId}`}
                x={n.x} y={n.y0} width={NODE_W} height={Math.max(2, n.y1 - n.y0)} rx={2}
                className={`sankey__node${n.isGhost ? ' sankey__node--ghost' : ''}${n.isExternal ? ' sankey__node--ext' : ''}`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => click(n)}
                style={{ cursor: n.isExternal ? 'default' : 'pointer' }}
              >
                <title>{n.label}{n.isGhost ? ' (loop)' : ''} · hop {Math.abs(n.column)}</title>
              </rect>
              <text
                className="sankey__label mono"
                x={isFirst ? n.x - 5 : isLast ? n.x + NODE_W + 5 : n.x + NODE_W / 2}
                y={isFirst || isLast ? mid : n.y0 - 3}
                textAnchor={isFirst ? 'end' : isLast ? 'start' : 'middle'}
                dominantBaseline={isFirst || isLast ? 'middle' : 'auto'}
              >
                {n.label}{n.isGhost ? ' ↺' : ''}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/components/SankeyCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/SankeyCanvas.tsx web/src/components/SankeyCanvas.test.tsx
git commit -m "feat(web): SankeyCanvas SVG renderer with hover focus-dim"
```

---

## Task 12: `FlowCsvExport.tsx` — CSV modal

**Files:**
- Create: `web/src/components/FlowCsvExport.tsx`

- [ ] **Step 1: Implement `web/src/components/FlowCsvExport.tsx`**

Model the modal shell on `MermaidExport.tsx` (overlay, Escape-to-close, copy + download). It wraps `flowToCsv`:

```tsx
import { useEffect } from 'react';
import type { FlowLayout } from '../graph/flow';
import { flowToCsv } from '../graph/flowCsv';

export function FlowCsvExport({ layout, filename, onClose }: { layout: FlowLayout; filename: string; onClose: () => void }) {
  const csv = flowToCsv(layout);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Flow CSV export">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <span className="overline">Export flow as CSV</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close">esc</button>
        </div>
        <pre className="modal__code mono"><code>{csv}</code></pre>
        <div className="modal__actions">
          <button className="exportbtn" onClick={() => navigator.clipboard?.writeText(csv)}>Copy</button>
          <button className="exportbtn" onClick={download}>Download {filename}</button>
        </div>
      </div>
    </div>
  );
}
```

Match the actual class names / markup in `MermaidExport.tsx` if they differ (reuse the same `modal*` classes so styling is inherited).

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/FlowCsvExport.tsx
git commit -m "feat(web): flow CSV export modal"
```

---

## Task 13: `FlowView.tsx` — view shell

**Files:**
- Create: `web/src/components/FlowView.tsx`
- Test: `web/src/components/FlowView.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/components/FlowView.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlowView } from './FlowView';
import { makeIndex } from '../test/fixtures';

describe('FlowView', () => {
  it('renders the focus and its downstream nodes', () => {
    render(<FlowView index={makeIndex()} rootId="a" onReroot={() => {}} />);
    expect(screen.getByTestId('flow-node-b')).toBeInTheDocument();
  });

  it('reroots when a node is clicked', async () => {
    const onReroot = vi.fn();
    render(<FlowView index={makeIndex()} rootId="a" onReroot={onReroot} />);
    await userEvent.click(screen.getByTestId('flow-node-b'));
    expect(onReroot).toHaveBeenCalledWith('b');
  });

  it('switches direction without crashing', async () => {
    render(<FlowView index={makeIndex()} rootId="c" onReroot={() => {}} />);
    await userEvent.click(screen.getByRole('tab', { name: /upstream/i }));
    expect(screen.getByTestId('flow-node-b')).toBeInTheDocument(); // b is upstream of c
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/components/FlowView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/components/FlowView.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Depth, MapMode } from '../types';
import { buildFlowLayout } from '../graph/flow';
import type { ColorScheme } from '../graph/flowColor';
import { legendFor } from '../graph/flowColor';
import { SankeyCanvas } from './SankeyCanvas';
import { MermaidExport } from './MermaidExport';
import { FlowCsvExport } from './FlowCsvExport';
import { toMermaidSankey } from '../graph/mermaid';
import { CodeIcon, TableIcon, DownstreamIcon, UpstreamIcon, BothIcon } from './icons';

const W = 1000;
const H = 560;

const MODES: { key: MapMode; label: string; Icon: typeof BothIcon }[] = [
  { key: 'dependencies', label: 'Downstream', Icon: DownstreamIcon },
  { key: 'dependants', label: 'Upstream', Icon: UpstreamIcon },
  { key: 'both', label: 'Both', Icon: BothIcon },
];
const DEPTHS: { key: Depth; label: string }[] = [
  { key: 1, label: '1 hop' }, { key: 2, label: '2 hops' }, { key: 0, label: 'All' },
];
const SCHEMES: { key: ColorScheme; label: string }[] = [
  { key: 'criticality', label: 'Criticality' },
  { key: 'interaction', label: 'Interaction' },
  { key: 'branch', label: 'Branch' },
];

export function FlowView({
  index, rootId, onReroot, onOpenDetail,
}: {
  index: CatalogIndex;
  rootId: string;
  onReroot: (id: string) => void;
  onOpenDetail?: (id: string) => void;
}) {
  const [mode, setMode] = useState<MapMode>('dependencies');
  const [depth, setDepth] = useState<Depth>(2);
  const [scheme, setScheme] = useState<ColorScheme>('criticality');
  const [exporting, setExporting] = useState<null | 'mermaid' | 'csv'>(null);

  const focus = index.byId.get(rootId);
  const layout = useMemo(
    () => buildFlowLayout(index, rootId, { mode, depth, width: W, height: H }),
    [index, rootId, mode, depth],
  );

  const downstreamEmpty = mode === 'dependencies' && layout.links.length === 0;
  const slug = (focus?.name ?? rootId).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="flow">
      <div className="flow__head">
        <div>
          <span className="overline">Dependency Flow</span>
          <h2 className="flow__title h-display">{focus?.name ?? rootId}</h2>
          <p className="flow__stats mono">
            {layout.nodes.length} nodes · {layout.links.length} links
            {layout.truncated > 0 ? ` · +${layout.truncated} hidden` : ''}
          </p>
        </div>
        <div className="flow__exports">
          <button className="exportbtn" onClick={() => setExporting('csv')} title="Export as CSV">
            <TableIcon width={15} height={15} /><span>Export CSV</span>
          </button>
          <button className="exportbtn" onClick={() => setExporting('mermaid')} title="Export as Mermaid">
            <CodeIcon width={15} height={15} /><span>Mermaid</span>
          </button>
        </div>
      </div>

      <div className="flow__controls">
        <select
          className="filter-select"
          value={rootId}
          onChange={(e) => onReroot(e.target.value)}
          aria-label="Focus service"
        >
          {index.services.map((s) => <option key={s.serviceId} value={s.serviceId}>{s.name}</option>)}
        </select>

        <div className="modeseg" role="tablist" aria-label="Direction">
          {MODES.map((m) => (
            <button
              key={m.key} role="tab" aria-selected={mode === m.key}
              className={`segbtn ${mode === m.key ? 'segbtn--on' : ''}`}
              onClick={() => setMode(m.key)}
            >
              <m.Icon width={15} height={15} /><span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="depthseg" role="group" aria-label="Depth">
          {DEPTHS.map((d) => (
            <button key={d.label} className={`depthbtn ${depth === d.key ? 'depthbtn--on' : ''}`} onClick={() => setDepth(d.key)}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="depthseg" role="group" aria-label="Color by">
          {SCHEMES.map((s) => (
            <button key={s.key} className={`depthbtn ${scheme === s.key ? 'depthbtn--on' : ''}`} onClick={() => setScheme(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flow__canvaswrap">
        {downstreamEmpty ? (
          <p className="flow__empty mono">
            {focus?.name ?? rootId} has no downstream dependencies — try Upstream or Both.
          </p>
        ) : (
          <SankeyCanvas layout={layout} colorScheme={scheme} onReroot={onReroot} width={W} height={H} />
        )}
        <div className="flow__legend">
          {legendFor(scheme).slice(0, 8).map((it) => (
            <span key={it.label} className="flow__legenditem mono">
              <span className="flow__swatch" style={{ background: it.color }} />{it.label}
            </span>
          ))}
        </div>
      </div>

      {exporting === 'mermaid' && (
        <MermaidExport
          title={`Dependency flow — ${focus?.name ?? rootId}`}
          filename={`flow-${slug}.mmd`}
          code={toMermaidSankey(layout)}
          onClose={() => setExporting(null)}
        />
      )}
      {exporting === 'csv' && (
        <FlowCsvExport layout={layout} filename={`flow-${slug}.csv`} onClose={() => setExporting(null)} />
      )}
    </div>
  );
}
```

Note: `DownstreamIcon` / `UpstreamIcon` / `BothIcon` / `CodeIcon` / `TableIcon` already exist (used by `MeshView`). If any name differs, use the exact exported names from `icons.tsx`. `onOpenDetail` is accepted for parity with the map but optional; wire it to a future label-click if desired (no behavior required for tests).

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/components/FlowView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/FlowView.tsx web/src/components/FlowView.test.tsx
git commit -m "feat(web): FlowView shell with direction/depth/color controls + exports"
```

---

## Task 14: `TopBar.tsx` — Flow tab

**Files:**
- Modify: `web/src/components/TopBar.tsx`

- [ ] **Step 1: Widen `View` and add the tab**

Change the exported type:

```ts
export type View = 'catalog' | 'mesh' | 'flow';
```

Import `FlowIcon` alongside the existing icon imports. After the Mesh `viewtab` button, add:

```tsx
        <button
          className={`viewtab ${view === 'flow' ? 'viewtab--on' : ''}`}
          onClick={() => onView('flow')}
        >
          <FlowIcon width={15} height={15} />
          Flow
        </button>
```

- [ ] **Step 2: Verify typecheck (expect App.tsx errors next task)**

Run: `npm run typecheck`
Expected: may FAIL in `App.tsx` where `onView`/`view` are still narrowed to `'catalog' | 'mesh'` — fixed in Task 15. `TopBar.tsx` itself should be consistent.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TopBar.tsx
git commit -m "feat(web): add Flow tab to top bar"
```

---

## Task 15: `App.tsx` — flow render branch, wiring, default hub

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add an `openFlow` callback and a busiest-hub helper**

Near the other `useCallback`s in `App`:

```tsx
  const openFlow = useCallback((id: string) => setView({ kind: 'flow', rootId: id }), []);
```

Add a helper above `export default function App` (or inside, memoized) to pick a default focus when needed:

```tsx
function busiestHub(index: CatalogIndex): string {
  let best = index.services[0]?.serviceId ?? '';
  let bestScore = -1;
  for (const s of index.services) {
    const score = index.dependencyCount(s.serviceId) + index.dependantCount(s.serviceId);
    if (score > bestScore) { bestScore = score; best = s.serviceId; }
  }
  return best;
}
```

(`CatalogIndex` is already imported via `deriveFacets`/`useCatalog`; add the type import if needed.)

- [ ] **Step 2: Update `lastTopView` to include `'flow'`**

Change the state type and effect:

```tsx
  const [lastTopView, setLastTopView] = useState<'catalog' | 'mesh' | 'flow'>('catalog');

  useEffect(() => {
    if (view.kind === 'catalog' || view.kind === 'mesh' || view.kind === 'flow') setLastTopView(view.kind);
  }, [view]);
```

And widen `changeTopView`:

```tsx
  const changeTopView = useCallback((v: 'catalog' | 'mesh' | 'flow') => {
    setView(v === 'flow' ? { kind: 'flow', rootId: busiestHub(index) } : { kind: v });
  }, [index]);
```

Note: `index` is in scope only after the `status` guards. If `changeTopView` is defined before `index` exists, instead compute the hub at click time by reading from `state` — keep `changeTopView` defined after the `const { index } = state;` line, or pass `index` through. Simplest: move the busiest-hub default into the render-time handler:

```tsx
        onView={(v) =>
          v === 'flow' ? setView({ kind: 'flow', rootId: busiestHub(index) }) : changeTopView(v)
        }
```

Use whichever fits the existing structure; the requirement is: clicking the Flow tab opens a flow rooted on the busiest hub.

- [ ] **Step 3: Compute a validated flow root and add the render branch**

After `const mapRootIds = …`, add:

```tsx
  const flowRootId =
    view.kind === 'flow'
      ? (index.byId.has(view.rootId) ? view.rootId : busiestHub(index))
      : '';
```

In the TopBar props, reflect the active tab:

```tsx
        view={view.kind === 'mesh' ? 'mesh' : view.kind === 'flow' ? 'flow' : 'catalog'}
        onView={changeTopView}
```

In the `<main>` render chain, add a branch (before the `mesh` branch, after the `map` branch):

```tsx
        ) : view.kind === 'flow' && flowRootId ? (
          <div className="detail" key={`flow-${flowRootId}`}>
            <div className="detail__bar">
              <button className="backbtn" onClick={goBack}>
                <ArrowRight width={14} height={14} className="backbtn__ico" />
                <span>{lastTopView === 'mesh' ? 'Mesh' : 'Catalog'}</span>
              </button>
              <span className="detail__crumb mono">/ flow / {flowRootId}</span>
            </div>
            <FlowView index={index} rootId={flowRootId} onReroot={openFlow} onOpenDetail={openDetail} />
          </div>
        ) : view.kind === 'mesh' ? (
```

Add the import at the top:

```tsx
import { FlowView } from './components/FlowView';
```

- [ ] **Step 4: Verify typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS (all suites green).

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```
Open the app, click **Flow** in the top bar → a Sankey rooted on the busiest hub renders. Click a node → reroots. Toggle Downstream/Upstream/Both, Depth, Color by. Refresh on `#/f/<id>` → same flow restored.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): wire Flow view into App (tab, route, default hub)"
```

---

## Task 16: Entry points from `ServiceCard` + `ServiceDetail`

**Files:**
- Modify: `web/src/components/ServiceCard.tsx`
- Modify: `web/src/components/ServiceDetail.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add an `onFlowView` action to `ServiceCard`**

In `ServiceCard.tsx`, add `onFlowView: (id: string) => void` to the props type, and next to the existing Map button (the `onMapView` icon button) add a parallel Flow button:

```tsx
          <button
            className="card__act"
            title="Dependency flow"
            onClick={(e) => { e.stopPropagation(); onFlowView(service.serviceId); }}
          >
            <FlowIcon width={15} height={15} />
          </button>
```

Import `FlowIcon` from `./icons`. Match the existing Map button's exact class names/markup so the styling is consistent.

- [ ] **Step 2: Thread `onFlowView` through `CatalogView` → `App`**

`CatalogView` passes `onMapView` to each `ServiceCard`; add a sibling `onFlowView` prop on `CatalogView` and forward it the same way. In `App.tsx`, pass `onFlowView={openFlow}` wherever `onMapView={reroot}` is passed to `CatalogView`.

- [ ] **Step 3: Add an `onOpenFlow` affordance to `ServiceDetail`**

In `ServiceDetail.tsx`, add optional `onOpenFlow?: (id: string) => void` to props. Near where the detail offers its map/reroot affordance, add a "View flow" button calling `onOpenFlow?.(service.serviceId)`. In `App.tsx`, the single-root map branch already renders `ServiceDetail`; pass `onOpenFlow={openFlow}` there. (The full `ServiceDetailPage` may also pass it through `onOpenMap`'s sibling — add `onOpenFlow={openFlow}` if that page renders the action.)

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS. If `ServiceCard.test.tsx` constructs props, add an `onFlowView: () => {}` to its render call.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ServiceCard.tsx web/src/components/ServiceDetail.tsx web/src/components/CatalogView.tsx web/src/App.tsx
git commit -m "feat(web): open Flow rooted from card + detail affordances"
```

---

## Task 17: Styling

**Files:**
- Modify: `web/src/app.css`

- [ ] **Step 1: Append Flow styles to `web/src/app.css`**

Reuse existing tokens (`--font-mono`, `--text-hi/-mid/-lo`, `--surface-*`, `--hairline`, `--signal-crit`). Mirror the `.mesh__*` block. Add:

```css
/* ---- Flow (Sankey) view ------------------------------------------------ */
.flow { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.flow__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 18px 22px 8px; }
.flow__title { margin: 2px 0 0; }
.flow__stats { color: var(--text-lo); font-size: 12px; margin: 4px 0 0; }
.flow__exports { display: flex; gap: 8px; flex-shrink: 0; }
.flow__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 4px 22px 12px; }
.flow__canvaswrap { position: relative; flex: 1; min-height: 0; overflow: auto; padding: 0 12px 12px; }
.flow__empty { color: var(--text-lo); padding: 40px; text-align: center; }
.flow__legend { position: absolute; bottom: 14px; left: 18px; display: flex; flex-wrap: wrap; gap: 10px; }
.flow__legenditem { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-mid); }
.flow__swatch { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }

.sankey { width: 100%; height: auto; display: block; }
.sankey__node { fill: var(--slate-600, #41526a); transition: fill 120ms ease; }
.sankey__node:hover { fill: var(--accent, #519ee6); }
.sankey__node--ghost { fill: var(--blue-300, #6cafe7); fill-opacity: 0.16; stroke: var(--blue-300, #6cafe7); stroke-width: 1; stroke-dasharray: 3 2; }
.sankey__node--ext { fill: var(--slate-500, #54657d); }
.sankey__label { fill: var(--text-mid); font-size: 9.5px; pointer-events: none; }
```

Adjust token names to the ones that actually exist in `theme.css` (e.g. `--slate-600`, `--blue-300`) — fall back to literal hex only where a token is missing.

- [ ] **Step 2: Manual visual check**

```bash
npm run dev
```
Confirm: columns read left→right, ghost nodes look faded/dashed, hover dims the rest, criticality coloring shows hot/muted bands, legend renders, the view scrolls if the graph is tall.

- [ ] **Step 3: Commit**

```bash
git add web/src/app.css
git commit -m "style(web): Flow view + Sankey canvas styling"
```

---

## Task 18: Full verification + acceptance

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — all suites, including the new `flow`, `flowColor`, `flowCsv`, `mermaid`, `routing`, `SankeyCanvas`, `FlowView` tests.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `tsc -b` + `vite build` succeed (this also runs `prebuild` → `build-catalog`).

- [ ] **Step 4: Acceptance walkthrough (`npm run dev`)**

Verify against the spec's Goals:
- Flow tab opens a rooted Sankey on the busiest hub.
- Columns fan by hop distance; downstream→right, upstream→left, Both centers the root.
- Band thickness varies with blast radius; a leaf band is thinnest.
- A cycle renders a faded `↺` ghost re-entry node one column further out; the closing band is dashed.
- Color defaults to criticality; toggle switches to interaction / branch.
- Direction (Downstream/Upstream/Both) and Depth (1/2/All, default 2) re-lay-out in place.
- Clicking a node (or ghost) reroots; clicking an external does nothing.
- Card + detail "Flow" affordance opens the flow rooted on that service.
- `#/f/<id>` is shareable/refresh-safe.
- Mermaid (`sankey-beta`) + CSV (edge list) exports open and download.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(web): dependency flow view acceptance pass"
```

---

## Self-review notes

- **Spec coverage:** rooted multi-hop layout (T3), flow-weight (T4), geometry (T5), caps (T6), ghost re-entry (T3), color schemes incl. default criticality (T7, T13), direction+depth controls default 2 (T13), reroot/hover (T11, T13), routing `#/f/<id>` (T1), top-level tab (T14), App wiring + default hub + validation + lastTopView (T15), card/detail entry points (T16), Mermaid + CSV export (T8, T9, T12, T13), empty/oversized states (T6, T13), tests across all pure modules + component smokes. All spec sections map to a task.
- **Heuristic, not conserved flow:** documented in T4's comment so implementers don't "fix" non-conservation.
- **Type consistency:** `FlowNode`/`FlowLink`/`FlowLayout`/`FlowOpts`/`ColorScheme` names are defined once (T3/T7) and reused verbatim in T5, T8, T9, T11, T12, T13.
- **Icon/control reuse:** `DownstreamIcon`/`UpstreamIcon`/`BothIcon`/`CodeIcon`/`TableIcon` are reused from `MeshView`; tasks instruct matching exact exported names if they differ.
