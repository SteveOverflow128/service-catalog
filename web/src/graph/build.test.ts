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
