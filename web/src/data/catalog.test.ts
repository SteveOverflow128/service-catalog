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
