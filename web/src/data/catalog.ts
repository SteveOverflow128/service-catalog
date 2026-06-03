import type { Catalog, Depth, Edge, MapMode, Service } from '../types';

export interface ExternalNode {
  serviceId: string;
  name: string;
  isExternal: true;
  endpoint?: string;
  interactions: Set<string>;
}

export type GraphNode =
  | { kind: 'service'; service: Service }
  | { kind: 'external'; ext: ExternalNode };

export interface EgoGraph {
  rootId: string;
  nodes: Set<string>;
  edges: Edge[];
}

/** Prettify an unresolved/external serviceId into a display label. */
function titleize(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * In-memory graph over the catalog. Builds forward + reverse adjacency once,
 * synthesizes stub nodes for external/unresolved dependency targets, and serves
 * ego-network queries for the dependency map.
 */
export class CatalogIndex {
  readonly services: Service[];
  readonly byId = new Map<string, Service>();
  readonly externals = new Map<string, ExternalNode>();
  readonly allEdges: Edge[] = [];

  private readonly forwardAdj = new Map<string, Edge[]>();
  private readonly reverseAdj = new Map<string, Edge[]>();

  constructor(catalog: Catalog) {
    this.services = [...catalog.services].sort((a, b) => a.name.localeCompare(b.name));
    for (const svc of this.services) this.byId.set(svc.serviceId, svc);

    for (const svc of this.services) {
      for (const dep of svc.dependencies ?? []) {
        const edge: Edge = { from: svc.serviceId, to: dep.serviceId, dep };
        this.allEdges.push(edge);
        push(this.forwardAdj, svc.serviceId, edge);
        push(this.reverseAdj, dep.serviceId, edge);

        if (!this.byId.has(dep.serviceId)) {
          const ext = this.externals.get(dep.serviceId) ?? {
            serviceId: dep.serviceId,
            name: titleize(dep.serviceId),
            isExternal: true as const,
            endpoint: dep.endpoint,
            interactions: new Set<string>(),
          };
          ext.interactions.add(dep.interaction);
          if (dep.endpoint && !ext.endpoint) ext.endpoint = dep.endpoint;
          this.externals.set(dep.serviceId, ext);
        }
      }
    }
  }

  node(id: string): GraphNode | undefined {
    const svc = this.byId.get(id);
    if (svc) return { kind: 'service', service: svc };
    const ext = this.externals.get(id);
    if (ext) return { kind: 'external', ext };
    return undefined;
  }

  dependenciesOf(id: string): Edge[] {
    return this.forwardAdj.get(id) ?? [];
  }

  dependantsOf(id: string): Edge[] {
    return this.reverseAdj.get(id) ?? [];
  }

  dependencyCount(id: string): number {
    return this.forwardAdj.get(id)?.length ?? 0;
  }

  dependantCount(id: string): number {
    return this.reverseAdj.get(id)?.length ?? 0;
  }

  /** Discover the node set reachable from root under a mode + hop limit, then
   *  return the induced forward-edge subgraph among those nodes. */
  ego(rootId: string, mode: MapMode, depth: Depth): EgoGraph {
    const { nodes, edges } = this.neighborhood([rootId], mode, depth);
    return { rootId, nodes, edges };
  }

  /** Set-rooted variant of {@link ego}: grow the neighborhood outward from a
   *  whole set of seed services at once (e.g. every service in a mesh slice),
   *  under the same mode + hop semantics. Seeds count as hop 0, so depth 1
   *  yields the seeds plus their immediate neighbors. */
  egoSet(roots: Iterable<string>, mode: MapMode, depth: Depth): { nodes: Set<string>; edges: Edge[] } {
    return this.neighborhood(roots, mode, depth);
  }

  /** Induced forward-edge subgraph over exactly the given services — every
   *  dependency edge whose both endpoints are in the set, and nothing reaching
   *  outside it. Backs the mesh "services only" slice view (in-group arrows,
   *  no external neighbors). */
  induced(ids: Set<string>): { nodes: Set<string>; edges: Edge[] } {
    const nodes = new Set(ids);
    const edges = this.allEdges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
    return { nodes, edges };
  }

  /** Multi-source BFS shared by {@link ego} and {@link egoSet}. Grows the
   *  reachable set from the seed roots under a mode + hop limit, then returns
   *  the induced forward-edge subgraph among those nodes. No extra direction
   *  test is needed on the induced edges — `allEdges` are all forward edges and
   *  `visited` is grown by a single-direction BFS, so any induced edge is
   *  already consistent with the explored direction (and in 'both' mode every
   *  induced edge is relevant by definition). */
  private neighborhood(roots: Iterable<string>, mode: MapMode, depth: Depth): { nodes: Set<string>; edges: Edge[] } {
    const visited = new Set<string>(roots);
    let frontier: string[] = [...visited];
    let hop = 0;

    while (frontier.length > 0 && (depth === 0 || hop < depth)) {
      const next: string[] = [];
      for (const id of frontier) {
        const neighbors: string[] = [];
        if (mode === 'dependencies' || mode === 'both') {
          for (const e of this.forwardAdj.get(id) ?? []) neighbors.push(e.to);
        }
        if (mode === 'dependants' || mode === 'both') {
          for (const e of this.reverseAdj.get(id) ?? []) neighbors.push(e.from);
        }
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
      hop++;
    }

    const edges = this.allEdges.filter((e) => visited.has(e.from) && visited.has(e.to));
    return { nodes: visited, edges };
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

// ---- Facet derivation for the filter rail -------------------------------

export interface Facets {
  teams: string[];
  products: string[];
  valueStreams: string[];
  trains: string[];
  lifecycles: string[];
  tiers: string[];
  classifications: string[];
  runtimes: string[];
  frameworks: string[];
  resourceTypes: string[];
  providers: string[];
  regions: string[];
}

export function deriveFacets(services: Service[]): Facets {
  const teams = new Set<string>();
  const products = new Set<string>();
  const valueStreams = new Set<string>();
  const trains = new Set<string>();
  const lifecycles = new Set<string>();
  const tiers = new Set<string>();
  const classifications = new Set<string>();
  const runtimes = new Set<string>();
  const frameworks = new Set<string>();
  const resourceTypes = new Set<string>();
  const providers = new Set<string>();
  const regions = new Set<string>();

  for (const s of services) {
    if (s.team) teams.add(s.team);
    if (s.product) products.add(s.product);
    if (s.valueStream) valueStreams.add(s.valueStream);
    if (s.train) trains.add(s.train);
    if (s.lifecycle) lifecycles.add(s.lifecycle);
    tiers.add(String(s.criticalityTier));
    if (s.dataClassification) classifications.add(s.dataClassification);
    if (s.runtime) runtimes.add(s.runtime);
    if (s.softwareFramework) frameworks.add(s.softwareFramework);
    for (const r of s.resources ?? []) resourceTypes.add(r.type);
    for (const r of s.resources ?? []) providers.add(r.provider);
    for (const r of s.resources ?? []) if (r.region) regions.add(r.region);
  }

  const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b));
  return {
    teams: sorted(teams),
    products: sorted(products),
    valueStreams: sorted(valueStreams),
    trains: sorted(trains),
    lifecycles: sorted(lifecycles),
    tiers: [...tiers].sort(),
    classifications: sorted(classifications),
    runtimes: sorted(runtimes),
    frameworks: sorted(frameworks),
    resourceTypes: sorted(resourceTypes),
    providers: sorted(providers),
    regions: sorted(regions),
  };
}
