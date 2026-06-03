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

  it('includes exactly two hops at depth 2', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 2, ...OPTS });
    expect(node(layout, 'b')).toBeTruthy();      // hop 1
    expect(node(layout, 'c')).toBeTruthy();      // hop 2
    expect(node(layout, 'ext-x')).toBeUndefined(); // hop 3, excluded
  });

  it('places the root at column 0 in both mode', () => {
    const layout = buildFlowLayout(makeIndex(), 'b', { mode: 'both', depth: 1, ...OPTS });
    expect(node(layout, 'b')!.column).toBe(0);
    expect(node(layout, 'a')!.column).toBe(-1); // a depends on b -> upstream
    expect(node(layout, 'c')!.column).toBe(1);  // b depends on c -> downstream
  });

  it('emits links on both sides of the focus in both mode', () => {
    const layout = buildFlowLayout(makeIndex(), 'b', { mode: 'both', depth: 1, ...OPTS });
    expect(layout.links.find((l) => l.source === 'a' && l.target === 'b')).toBeTruthy(); // upstream into focus
    expect(layout.links.find((l) => l.source === 'b' && l.target === 'c')).toBeTruthy(); // downstream from focus
  });
});

describe('buildFlowLayout — ghosting', () => {
  it('breaks a cycle into a terminal ghost', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    const ghost = layout.nodes.find((n) => n.isGhost && n.realId === 'a')!;
    expect(ghost).toBeTruthy();
    expect(ghost.realId).toBe('a');           // b -> a loops back to root
    expect(ghost.column).toBe(2);             // placed at source(b=1).column + 1
    // ghost is terminal: no link leaves it
    expect(layout.links.some((l) => l.source === ghost.id)).toBe(false);
    // the closing link is flagged
    const closing = layout.links.find((l) => l.target === ghost.id);
    expect(closing!.isBackEdge).toBe(true);
  });

  it('ghosts a same-layer edge instead of drawing a same-column band', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    // b and c are both at hop 1; b->c does not go strictly left->right, so it
    // becomes a ghost re-entry rather than a degenerate same-column band.
    const intoRealC = layout.links.filter((l) => l.target === 'c');
    expect(intoRealC.length).toBe(1);                 // only a->c is a real forward band
    expect(intoRealC[0].isBackEdge).toBe(false);
    const ghostC = layout.nodes.find((n) => n.isGhost && n.realId === 'c');
    expect(ghostC).toBeTruthy();
    const bToGhostC = layout.links.find((l) => l.source === 'b' && l.target === ghostC!.id);
    expect(bToGhostC!.isBackEdge).toBe(true);
  });

  it('tags each link with its first-hop branch', () => {
    const layout = buildFlowLayout(makeIndex(), 'a', { mode: 'dependencies', depth: 0, ...OPTS });
    expect(layout.links.find((l) => l.source === 'a' && l.target === 'b')!.branch).toBe('b');
    expect(layout.links.find((l) => l.source === 'b' && l.target === 'c')!.branch).toBe('b');
  });
});

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

  it('keeps the heaviest node when a column is capped to 1', () => {
    const layout = buildFlowLayout(makeCyclicIndex(), 'a', { mode: 'dependencies', depth: 1, ...OPTS, nodeCap: 1 });
    const col1 = layout.columns.find((c) => c.column === 1)!;
    expect(col1.nodes.length).toBe(1);
    expect(col1.nodes[0].id).toBe('b'); // b (weight 3) kept over c (weight 1)
    expect(layout.truncated).toBeGreaterThanOrEqual(1);
  });
});
