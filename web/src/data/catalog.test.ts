import { describe, it, expect } from 'vitest';
import { makeIndex, makeService } from '../test/fixtures';
import { CatalogIndex, withoutInfrastructure } from './catalog';
import type { Catalog, Dependency } from '../types';

function dep(serviceId: string): Dependency {
  return { serviceId, interaction: 'sync-http', critical: false, purpose: 'test', external: false };
}

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

describe('withoutInfrastructure', () => {
  // a -> b (infra), a -> c, b -> c.  Removing the infra node b must also remove
  // both edges touching it, leaving only a -> c.
  function infraCatalog(): Catalog {
    const services = [
      makeService({ serviceId: 'a', dependencies: [dep('b'), dep('c')] }),
      makeService({ serviceId: 'b', infrastructure: true, dependencies: [dep('c')] }),
      makeService({ serviceId: 'c' }),
    ];
    return { generatedFrom: 'test', count: services.length, services };
  }

  it('drops infra services and re-counts', () => {
    const pruned = withoutInfrastructure(infraCatalog());
    expect(pruned.services.map((s) => s.serviceId).sort()).toEqual(['a', 'c']);
    expect(pruned.count).toBe(2);
  });

  it('strips dependency edges that pointed at the removed infra node', () => {
    const index = new CatalogIndex(withoutInfrastructure(infraCatalog()));
    const a = index.dependenciesOf('a');
    expect(a.map((e) => e.to).sort()).toEqual(['c']); // a -> b is gone
    expect(index.allEdges).toHaveLength(1); // only a -> c survives
  });

  it('leaves no phantom external stub for the removed infra node', () => {
    const index = new CatalogIndex(withoutInfrastructure(infraCatalog()));
    expect(index.byId.has('b')).toBe(false);
    expect(index.externals.has('b')).toBe(false);
  });

  it('treats a missing flag as non-infra and returns the catalog unchanged', () => {
    const catalog = infraCatalog();
    catalog.services[1] = makeService({ serviceId: 'b', dependencies: [dep('c')] }); // no flag
    const pruned = withoutInfrastructure(catalog);
    expect(pruned).toBe(catalog); // same reference — nothing flagged
    expect(pruned.services).toHaveLength(3);
  });
});
