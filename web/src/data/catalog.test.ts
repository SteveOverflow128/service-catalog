import { describe, it, expect } from 'vitest';
import { makeIndex, makeService } from '../test/fixtures';
import { CatalogIndex, withoutInfrastructure, withoutNonCritical } from './catalog';
import type { Catalog, Dependency } from '../types';

function dep(serviceId: string): Dependency {
  return { serviceId, interaction: 'sync-http', critical: false, purpose: 'test', external: false };
}

function critDep(serviceId: string): Dependency {
  return { serviceId, interaction: 'sync-http', critical: true, purpose: 'test', external: false };
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
