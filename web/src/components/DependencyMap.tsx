import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Depth, MapMode } from '../types';
import { buildEgoElements, dagreLayout } from '../graph/build';
import { toMermaid } from '../graph/mermaid';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';
import { MermaidExport } from './MermaidExport';
import { BothIcon, CodeIcon, DownstreamIcon, UpstreamIcon } from './icons';

const MODES: { key: MapMode; label: string; hint: string; Icon: typeof BothIcon }[] = [
  { key: 'dependencies', label: 'Dependencies', hint: 'what this calls', Icon: DownstreamIcon },
  { key: 'dependants', label: 'Dependants', hint: 'what calls this', Icon: UpstreamIcon },
  { key: 'both', label: 'Both', hint: 'full neighborhood', Icon: BothIcon },
];

const DEPTHS: { key: Depth; label: string }[] = [
  { key: 1, label: '1 hop' },
  { key: 2, label: '2 hops' },
  { key: 0, label: 'All' },
];

export function DependencyMap({
  index,
  rootId,
  onSelectNode,
}: {
  index: CatalogIndex;
  rootId: string;
  onSelectNode: (id: string) => void;
}) {
  const [mode, setMode] = useState<MapMode>('both');
  // Depth 1 (immediate neighborhood) keeps the default map readable even for
  // services wired to mega-hubs like auth-service (49 dependants); 2/All expand.
  const [depth, setDepth] = useState<Depth>(1);
  const [exporting, setExporting] = useState(false);

  const ego = useMemo(() => index.ego(rootId, mode, depth), [index, rootId, mode, depth]);
  const elements = useMemo(() => buildEgoElements(index, ego), [index, ego]);

  const depthLabel = depth === 0 ? 'all hops' : `${depth} hop${depth === 1 ? '' : 's'}`;
  const mermaid = () =>
    toMermaid(index, ego.nodes, ego.edges, {
      rootId,
      title: `${index.byId.get(rootId)?.name ?? rootId} — ${mode} · ${depthLabel}`,
    });

  const criticalEdges = ego.edges.filter((e) => e.dep.critical).length;
  const externalNodes = [...ego.nodes].filter((id) => !index.byId.has(id)).length;

  const handleNodeClick = (id: string) => {
    if (index.byId.has(id)) onSelectNode(id);
  };

  return (
    <div className="depmap">
      <div className="mapbar">
        <div className="modeseg" role="tablist" aria-label="Map mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={mode === m.key}
              className={`segbtn ${mode === m.key ? 'segbtn--on' : ''}`}
              onClick={() => setMode(m.key)}
              title={m.hint}
            >
              <m.Icon width={15} height={15} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="depthseg" role="group" aria-label="Traversal depth">
          {DEPTHS.map((d) => (
            <button
              key={d.label}
              className={`depthbtn ${depth === d.key ? 'depthbtn--on' : ''}`}
              onClick={() => setDepth(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="mapstats mono">
          <span>
            <b>{ego.nodes.size}</b> nodes
          </span>
          <span>
            <b>{ego.edges.length}</b> edges
          </span>
          {criticalEdges > 0 && (
            <span className="mapstats__crit">
              <b>{criticalEdges}</b> critical
            </span>
          )}
          {externalNodes > 0 && (
            <span className="mapstats__ext">
              <b>{externalNodes}</b> external
            </span>
          )}
        </div>

        <button className="exportbtn" onClick={() => setExporting(true)} title="Export this map as a Mermaid diagram">
          <CodeIcon width={15} height={15} />
          <span>Mermaid</span>
        </button>
      </div>

      <div className="depmap__canvaswrap">
        {ego.edges.length === 0 ? (
          <div className="graph-empty">
            <div className="graph-empty__ring" />
            <p>
              No {mode === 'dependants' ? 'dependants' : mode === 'dependencies' ? 'dependencies' : 'connections'}{' '}
              recorded for this service.
            </p>
            <span className="overline">a leaf node in the mesh</span>
          </div>
        ) : (
          <GraphCanvas
            elements={elements}
            layout={dagreLayout}
            onNodeClick={handleNodeClick}
            layoutKey={`${rootId}:${mode}:${depth}`}
          />
        )}
        <Legend />
      </div>

      {exporting && (
        <MermaidExport
          title={`${index.byId.get(rootId)?.name ?? rootId} · ${mode} · ${depthLabel}`}
          filename={`${rootId}-${mode}-${depth === 0 ? 'all' : depth + 'hop'}.mmd`}
          code={mermaid()}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  );
}
