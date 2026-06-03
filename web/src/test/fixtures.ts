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
