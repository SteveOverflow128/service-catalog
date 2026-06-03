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
