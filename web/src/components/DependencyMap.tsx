import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Depth, MapMode } from '../types';
import { buildSubgraphElements, dagreLayout } from '../graph/build';
import { toMermaid } from '../graph/mermaid';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';
import { MermaidExport } from './MermaidExport';
import { CsvExport } from './CsvExport';
import { InfraToggle } from './InfraToggle';
import { BothIcon, CodeIcon, DownstreamIcon, TableIcon, UpstreamIcon } from './icons';

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
  rootIds,
  onReroot,
  onToggleRoot,
  showInfra,
  onToggleInfra,
}: {
  index: CatalogIndex;
  rootIds: string[];
  /** plain click on a node → make it the sole root */
  onReroot: (id: string) => void;
  /** ⌘/Ctrl+click on a node → add/remove it from the root set */
  onToggleRoot: (id: string) => void;
  showInfra: boolean;
  onToggleInfra: () => void;
}) {
  const [mode, setMode] = useState<MapMode>('both');
  const [depth, setDepth] = useState<Depth>(1);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const rootSet = useMemo(() => new Set(rootIds), [rootIds]);
  const ego = useMemo(() => index.egoSet(rootSet, mode, depth), [index, rootSet, mode, depth]);
  const elements = useMemo(
    () => buildSubgraphElements(index, ego.nodes, ego.edges, rootSet),
    [index, ego, rootSet],
  );

  const egoServices = useMemo(
    () => [...ego.nodes].map((id) => index.byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s),
    [ego, index],
  );

  const depthLabel = depth === 0 ? 'all hops' : `${depth} hop${depth === 1 ? '' : 's'}`;
  const rootLabel =
    rootIds.length === 1 ? index.byId.get(rootIds[0])?.name ?? rootIds[0] : `${rootIds.length} services`;
  const exportSlug =
    rootIds.length === 1 ? rootIds[0] : `${rootIds.length}roots`;

  const criticalEdges = ego.edges.filter((e) => e.dep.critical).length;
  const externalNodes = [...ego.nodes].filter((id) => !index.byId.has(id)).length;

  const handleNodeClick = (id: string, ev: MouseEvent) => {
    if (!index.byId.has(id)) return; // externals can't be roots
    if (ev && (ev.metaKey || ev.ctrlKey)) onToggleRoot(id);
    else onReroot(id);
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

        <InfraToggle on={showInfra} onToggle={onToggleInfra} />

        <div className="mapstats mono">
          <span><b>{ego.nodes.size}</b> nodes</span>
          <span><b>{ego.edges.length}</b> edges</span>
          {criticalEdges > 0 && <span className="mapstats__crit"><b>{criticalEdges}</b> critical</span>}
          {externalNodes > 0 && <span className="mapstats__ext"><b>{externalNodes}</b> external</span>}
        </div>

        <div className="mesh__exports">
          <button className="exportbtn" onClick={() => setExportingCsv(true)} title="Export the services in this map as a CSV">
            <TableIcon width={15} height={15} />
            <span>Export CSV</span>
          </button>
          <button className="exportbtn" onClick={() => setExporting(true)} title="Export this map as a Mermaid diagram">
            <CodeIcon width={15} height={15} />
            <span>Mermaid</span>
          </button>
        </div>
      </div>

      <div className="depmap__canvaswrap">
        {ego.edges.length === 0 ? (
          <div className="graph-empty">
            <div className="graph-empty__ring" />
            <p>
              No {mode === 'dependants' ? 'dependants' : mode === 'dependencies' ? 'dependencies' : 'connections'}{' '}
              recorded for {rootIds.length === 1 ? 'this service' : 'these services'}.
            </p>
            <span className="overline">tip: ⌘/Ctrl-click a node to add it as a root</span>
          </div>
        ) : (
          <GraphCanvas
            elements={elements}
            layout={dagreLayout}
            onNodeClick={handleNodeClick}
            layoutKey={`${rootIds.join(',')}:${mode}:${depth}`}
          />
        )}
        <Legend />
      </div>

      {exporting && (
        <MermaidExport
          title={`${rootLabel} · ${mode} · ${depthLabel}`}
          filename={`${exportSlug}-${mode}-${depth === 0 ? 'all' : depth + 'hop'}.mmd`}
          code={toMermaid(index, ego.nodes, ego.edges, {
            rootIds,
            title: `${rootLabel} — ${mode} · ${depthLabel}`,
          })}
          onClose={() => setExporting(false)}
        />
      )}

      {exportingCsv && (
        <CsvExport
          index={index}
          services={egoServices}
          title={`Export ${rootLabel} map as CSV`}
          filename={`${exportSlug}-${mode}-${depth === 0 ? 'all' : depth + 'hop'}.csv`}
          onClose={() => setExportingCsv(false)}
        />
      )}
    </div>
  );
}
