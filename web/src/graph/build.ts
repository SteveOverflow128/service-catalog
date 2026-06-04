import type { ElementDefinition, LayoutOptions } from 'cytoscape';
import type { CatalogIndex } from '../data/catalog';
import type { Edge } from '../types';
import { edgeColors, interactionStyle, tierStyle } from '../design/tokens';

function degree(index: CatalogIndex, id: string): number {
  return index.dependencyCount(id) + index.dependantCount(id);
}

function nodeSize(deg: number, isRoot: boolean): number {
  const base = 24 + Math.min(26, Math.sqrt(deg) * 6);
  return isRoot ? Math.max(46, base + 8) : base;
}

function buildNode(index: CatalogIndex, id: string, roots: ReadonlySet<string>): ElementDefinition {
  const node = index.node(id);
  const isRoot = roots.has(id);
  const deg = degree(index, id);

  if (node?.kind === 'service') {
    const s = node.service;
    return {
      group: 'nodes',
      data: {
        id,
        label: s.name,
        kind: 'service',
        isRoot,
        infra: s.infrastructure ?? false,
        color: tierStyle(s.criticalityTier).color,
        size: nodeSize(deg, isRoot),
        tier: String(s.criticalityTier),
        lifecycle: s.lifecycle,
      },
    };
  }

  const name = node?.kind === 'external' ? node.ext.name : id;
  return {
    group: 'nodes',
    data: {
      id,
      label: `${name} ↗`,
      kind: 'external',
      isRoot,
      color: edgeColors.external,
      size: nodeSize(deg, isRoot) * 0.9,
    },
  };
}

function buildEdge(e: Edge, i: number): ElementDefinition {
  const interaction = interactionStyle(e.dep.interaction);
  const external = e.dep.external || false;
  const critical = e.dep.critical;
  const color = critical ? edgeColors.critical : external ? edgeColors.external : edgeColors.normal;
  const dash = external ? [7, 5] : interaction.dash;
  const width = critical ? 2.4 : 1.3;

  return {
    group: 'edges',
    data: {
      id: `e${i}:${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      critical,
      external,
      interaction: e.dep.interaction,
      purpose: e.dep.purpose,
      color,
      width,
      hlWidth: width + 1.3,
      opacity: critical ? 0.85 : 0.5,
      lineStyle: dash.length ? 'dashed' : 'solid',
      dash: dash.length ? dash : [1, 0],
    },
  };
}

const NO_ROOTS: ReadonlySet<string> = new Set();

/** Render an explicit node-id set + edge list into cytoscape elements. Ids in
 *  `roots` get the enlarged "root" treatment; pass an empty set for rootless
 *  subgraphs like the full mesh. */
export function buildSubgraphElements(
  index: CatalogIndex,
  nodeIds: Set<string>,
  edges: Edge[],
  roots: ReadonlySet<string> = NO_ROOTS,
): ElementDefinition[] {
  const nodes = [...nodeIds].map((id) => buildNode(index, id, roots));
  return [...nodes, ...edges.map((e, i) => buildEdge(e, i))];
}

/** Full, unfiltered mesh: every catalogued service + external stub, all edges. */
export function buildMeshElements(index: CatalogIndex): ElementDefinition[] {
  const ids = new Set<string>();
  for (const s of index.services) ids.add(s.serviceId);
  for (const id of index.externals.keys()) ids.add(id);
  return buildSubgraphElements(index, ids, index.allEdges);
}

export const dagreLayout = (): LayoutOptions =>
  ({
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: 26,
    rankSep: 96,
    edgeSep: 12,
    ranker: 'network-simplex',
    animate: true,
    animationDuration: 480,
    animationEasing: 'ease-out',
    fit: true,
    padding: 48,
  }) as unknown as LayoutOptions;

export const fcoseLayout = (): LayoutOptions =>
  ({
    name: 'fcose',
    quality: 'default',
    randomize: true,
    animate: true,
    animationDuration: 700,
    fit: true,
    padding: 50,
    nodeRepulsion: () => 9000,
    idealEdgeLength: () => 95,
    edgeElasticity: () => 0.45,
    gravity: 0.25,
    gravityRange: 3.2,
    packComponents: true,
    nodeDimensionsIncludeLabels: true,
  }) as unknown as LayoutOptions;
