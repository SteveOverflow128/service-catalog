import type { CatalogIndex } from '../data/catalog';
import type { Depth, Edge, MapMode } from '../types';

export const NODE_W = 13;

export interface FlowNode {
  id: string;        // serviceId, or `${realId}__ghost@${column}` for ghosts
  realId: string;    // serviceId this node/ghost represents (reroot target)
  label: string;
  column: number;    // 0 = focus, +n downstream, -n upstream
  isExternal: boolean;
  isGhost: boolean;
  x: number; y0: number; y1: number;
}

export interface FlowLink {
  source: string; target: string;
  edge: Edge;
  weight: number;
  branch: string;
  isBackEdge: boolean;
  sy0: number; sy1: number; ty0: number; ty1: number;
}

export interface FlowColumn { column: number; nodes: FlowNode[]; }

export interface FlowLayout {
  rootId: string;
  columns: FlowColumn[];
  nodes: FlowNode[];
  links: FlowLink[];
  truncated: number;
}

export interface FlowOpts {
  mode: MapMode;
  depth: Depth;
  width: number;
  height: number;
  nodeCap?: number;
}

const GAP = 10;
const PAD = 28;
const DEFAULT_CAP = 24;

/** BFS outward from the root in the active direction(s); returns signed
 *  shortest-hop columns and the first-hop branch each node descends from. */
function assignColumns(index: CatalogIndex, rootId: string, mode: MapMode, depth: Depth) {
  const limit = depth === 0 ? Infinity : depth;
  const col = new Map<string, number>([[rootId, 0]]);
  const branch = new Map<string, string>([[rootId, '']]);

  const bfs = (sign: number, neighborsOf: (id: string) => string[]) => {
    const visited = new Set<string>([rootId]);
    let frontier = [rootId];
    let hop = 0;
    while (frontier.length && hop < limit) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of neighborsOf(id)) {
          if (visited.has(n)) continue;
          visited.add(n);
          if (!col.has(n)) {
            col.set(n, sign * (hop + 1));
            branch.set(n, hop === 0 ? n : branch.get(id) ?? id);
          }
          next.push(n);
        }
      }
      frontier = next;
      hop++;
    }
  };

  if (mode === 'dependencies' || mode === 'both')
    bfs(+1, (id) => index.dependenciesOf(id).map((e) => e.to));
  if (mode === 'dependants' || mode === 'both')
    bfs(-1, (id) => index.dependantsOf(id).map((e) => e.from));

  return { col, branch };
}

/** Label for a node id: catalog name, or titleized external/ghost. */
function labelFor(index: CatalogIndex, id: string): string {
  return index.node(id)?.kind === 'service'
    ? index.byId.get(id)!.name
    : index.externals.get(id)?.name ?? id;
}

/** Build FlowNodes + FlowLinks, introducing ghost re-entry nodes for any
 *  edge that doesn't go strictly left→right (target column ≤ source column). */
function classify(index: CatalogIndex, col: Map<string, number>, branch: Map<string, string>, _rootId: string) {
  const nodes = new Map<string, FlowNode>();
  const ensureReal = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id, realId: id, label: labelFor(index, id), column: col.get(id)!,
        isExternal: index.node(id)?.kind !== 'service', isGhost: false,
        x: 0, y0: 0, y1: 0,
      });
    }
    return nodes.get(id)!;
  };
  // every assigned service/external becomes a node
  for (const id of col.keys()) ensureReal(id);

  const links: FlowLink[] = [];
  for (const e of index.allEdges) {
    const cf = col.get(e.from);
    const ct = col.get(e.to);
    if (cf === undefined || ct === undefined) continue; // edge leaves the scope
    const fartherIsTarget = Math.abs(ct) >= Math.abs(cf);
    const farther = fartherIsTarget ? e.to : e.from;
    const branchOf = branch.get(farther) || branch.get(e.from) || e.from;

    if (cf <= ct) {
      links.push({
        source: e.from, target: e.to, edge: e, weight: 1, branch: branchOf,
        isBackEdge: false, sy0: 0, sy1: 0, ty0: 0, ty1: 0,
      });
    } else {
      // back-edge / same-layer / cycle -> ghost terminal at source.column + 1
      const ghostCol = cf + 1;
      const ghostId = `${e.to}__ghost@${ghostCol}`;
      if (!nodes.has(ghostId)) {
        nodes.set(ghostId, {
          id: ghostId, realId: e.to, label: labelFor(index, e.to), column: ghostCol,
          isExternal: index.node(e.to)?.kind !== 'service', isGhost: true,
          x: 0, y0: 0, y1: 0,
        });
      }
      links.push({
        source: e.from, target: ghostId, edge: e, weight: 1, branch: branch.get(e.from) || e.from,
        isBackEdge: true, sy0: 0, sy1: 0, ty0: 0, ty1: 0,
      });
    }
  }

  return { nodes: [...nodes.values()], links };
}

function groupByColumn(nodes: FlowNode[]): FlowColumn[] {
  const by = new Map<number, FlowNode[]>();
  for (const n of nodes) {
    const arr = by.get(n.column);
    if (arr) arr.push(n);
    else by.set(n.column, [n]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([column, ns]) => ({ column, nodes: ns }));
}

/** Flow weight = blast radius of the endpoint FARTHER from the root: the count
 *  of distinct services reachable continuing away from the root. Leaves/ghosts
 *  weigh 1. Computed on the post-ghost DAG (|column| strictly increases along
 *  the away direction → acyclic), memoized. */
function computeWeights(nodes: FlowNode[], links: FlowLink[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // awayAdj[n] = farther neighbors reached by stepping away from the root.
  const awayAdj = new Map<string, string[]>();
  for (const n of nodes) awayAdj.set(n.id, []);
  for (const l of links) {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    const nearer = Math.abs(s.column) < Math.abs(t.column) ? s : t;
    const farther = nearer === s ? t : s;
    if (Math.abs(farther.column) > Math.abs(nearer.column)) {
      awayAdj.get(nearer.id)!.push(farther.id);
    }
  }
  const memo = new Map<string, Set<string>>();
  const reach = (id: string): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const acc = new Set<string>([byId.get(id)!.realId]);
    memo.set(id, acc); // set before recursing; DAG guarantees no self-cycle
    for (const m of awayAdj.get(id)!) for (const r of reach(m)) acc.add(r);
    return acc;
  };
  for (const l of links) {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    const farther = Math.abs(t.column) >= Math.abs(s.column) ? t : s;
    l.weight = Math.max(1, reach(farther.id).size);
  }
}

/** STUB — filled in Task 6. */
function applyCaps(nodes: FlowNode[], links: FlowLink[], _cap: number): { nodes: FlowNode[]; links: FlowLink[]; truncated: number } {
  return { nodes, links, truncated: 0 };
}

/** STUB — filled in Task 5. */
function layout(_columns: FlowColumn[], _links: FlowLink[], _width: number, _height: number): void {
  void GAP; void PAD; /* geometry filled in Task 5 */
}

export function buildFlowLayout(index: CatalogIndex, rootId: string, opts: FlowOpts): FlowLayout {
  const { col, branch } = assignColumns(index, rootId, opts.mode, opts.depth);
  const { nodes: allNodes, links: allLinks } = classify(index, col, branch, rootId);
  computeWeights(allNodes, allLinks);
  const { nodes, links, truncated } = applyCaps(allNodes, allLinks, opts.nodeCap ?? DEFAULT_CAP);
  const columns = groupByColumn(nodes);
  layout(columns, links, opts.width, opts.height);
  return { rootId, columns, nodes, links, truncated };
}
