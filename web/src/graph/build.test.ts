import { describe, it, expect } from 'vitest';
import type { ElementDefinition } from 'cytoscape';
import { buildSubgraphElements, buildMeshElements } from './build';
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

describe('buildMeshElements pruneIsolated', () => {
  it('includes the edgeless service by default', () => {
    const els = buildMeshElements(makeIndex());
    expect(nodeById(els, 'd')).toBeDefined(); // 'd' has no edges but still shows
  });

  it('drops zero-degree service nodes when pruneIsolated is set', () => {
    const els = buildMeshElements(makeIndex(), { pruneIsolated: true });
    expect(nodeById(els, 'd')).toBeUndefined(); // 'd' has no edges -> pruned
    expect(nodeById(els, 'a')).toBeDefined();   // 'a' still has the a -> b edge
    expect(nodeById(els, 'c')).toBeDefined();     // mid/leaf chain node kept via edges
    expect(nodeById(els, 'ext-x')).toBeDefined(); // external included via its edge endpoint
  });
});
