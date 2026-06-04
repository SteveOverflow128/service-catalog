import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Depth, MapMode } from '../types';
import { buildFlowLayout } from '../graph/flow';
import type { ColorScheme } from '../graph/flowColor';
import { legendFor } from '../graph/flowColor';
import { SankeyCanvas } from './SankeyCanvas';
import { MermaidExport } from './MermaidExport';
import { FlowCsvExport } from './FlowCsvExport';
import { InfraToggle } from './InfraToggle';
import { toMermaidSankey } from '../graph/mermaid';
import { CodeIcon, TableIcon, DownstreamIcon, UpstreamIcon, BothIcon } from './icons';

// Base viewport; the actual canvas grows with content so large graphs aren't
// cramped at fit — zoom/pan then navigates the bigger figure.
const BASE_W = 1000;
const BASE_H = 560;

const MODES: { key: MapMode; label: string; Icon: typeof BothIcon }[] = [
  { key: 'dependencies', label: 'Downstream', Icon: DownstreamIcon },
  { key: 'dependants', label: 'Upstream', Icon: UpstreamIcon },
  { key: 'both', label: 'Both', Icon: BothIcon },
];
const DEPTHS: { key: Depth; label: string }[] = [
  { key: 1, label: '1 hop' }, { key: 2, label: '2 hops' }, { key: 0, label: 'All' },
];
const SCHEMES: { key: ColorScheme; label: string }[] = [
  { key: 'criticality', label: 'Criticality' },
  { key: 'interaction', label: 'Interaction' },
  { key: 'branch', label: 'Branch' },
];

export function FlowView({
  index, rootId, onReroot, showInfra, onToggleInfra,
}: {
  index: CatalogIndex;
  rootId: string;
  onReroot: (id: string) => void;
  showInfra: boolean;
  onToggleInfra: () => void;
}) {
  const [mode, setMode] = useState<MapMode>('dependencies');
  const [depth, setDepth] = useState<Depth>(2);
  const [scheme, setScheme] = useState<ColorScheme>('criticality');
  const [exporting, setExporting] = useState<null | 'mermaid' | 'csv'>(null);

  const focus = index.byId.get(rootId);
  // First pass at base size to learn the graph's shape (column count + tallest
  // column are independent of the canvas dimensions), then size the canvas to
  // the content and re-lay-out only if it needs to be bigger.
  const probe = useMemo(
    () => buildFlowLayout(index, rootId, { mode, depth, width: BASE_W, height: BASE_H }),
    [index, rootId, mode, depth],
  );
  const W = Math.max(BASE_W, probe.columns.length * 190);
  const H = Math.max(BASE_H, Math.max(1, ...probe.columns.map((c) => c.nodes.length)) * 26 + 80);
  const layout = useMemo(
    () =>
      W === BASE_W && H === BASE_H
        ? probe
        : buildFlowLayout(index, rootId, { mode, depth, width: W, height: H }),
    [index, rootId, mode, depth, W, H, probe],
  );

  const downstreamEmpty = mode === 'dependencies' && layout.links.length === 0;
  const slug = (focus?.name ?? rootId).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="flow">
      <div className="flow__head">
        <div>
          <span className="overline">Dependency Flow</span>
          <h2 className="flow__title h-display">{focus?.name ?? rootId}</h2>
          <p className="flow__stats mono">
            {layout.nodes.length} nodes · {layout.links.length} links
            {layout.truncated > 0 ? ` · +${layout.truncated} hidden` : ''}
          </p>
        </div>
        <div className="flow__exports">
          <button className="exportbtn" onClick={() => setExporting('csv')} title="Export as CSV">
            <TableIcon width={15} height={15} /><span>Export CSV</span>
          </button>
          <button className="exportbtn" onClick={() => setExporting('mermaid')} title="Export as Mermaid">
            <CodeIcon width={15} height={15} /><span>Mermaid</span>
          </button>
        </div>
      </div>

      <div className="flow__controls">
        <select
          className="filter-select"
          value={rootId}
          onChange={(e) => onReroot(e.target.value)}
          aria-label="Focus service"
        >
          {index.services.map((s) => <option key={s.serviceId} value={s.serviceId}>{s.name}</option>)}
        </select>

        <div className="modeseg" role="tablist" aria-label="Direction">
          {MODES.map((m) => (
            <button
              key={m.key} role="tab" aria-selected={mode === m.key}
              className={`segbtn ${mode === m.key ? 'segbtn--on' : ''}`}
              onClick={() => setMode(m.key)}
            >
              <m.Icon width={15} height={15} /><span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="depthseg" role="group" aria-label="Depth">
          {DEPTHS.map((d) => (
            <button key={d.label} className={`depthbtn ${depth === d.key ? 'depthbtn--on' : ''}`} onClick={() => setDepth(d.key)}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="depthseg" role="group" aria-label="Color by">
          {SCHEMES.map((s) => (
            <button key={s.key} className={`depthbtn ${scheme === s.key ? 'depthbtn--on' : ''}`} onClick={() => setScheme(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        <InfraToggle on={showInfra} onToggle={onToggleInfra} />
      </div>

      <div className="flow__canvaswrap">
        {downstreamEmpty ? (
          <p className="flow__empty mono">
            {focus?.name ?? rootId} has no downstream dependencies — try Upstream or Both.
          </p>
        ) : (
          <SankeyCanvas layout={layout} colorScheme={scheme} onReroot={onReroot} width={W} height={H} key={`${rootId}-${mode}-${depth}`} />
        )}
        <div className="flow__legend">
          {legendFor(scheme).slice(0, 8).map((it) => (
            <span key={it.label} className="flow__legenditem mono">
              <span className="flow__swatch" style={{ background: it.color }} />{it.label}
            </span>
          ))}
        </div>
      </div>

      {exporting === 'mermaid' && (
        <MermaidExport
          title={`Dependency flow — ${focus?.name ?? rootId}`}
          filename={`flow-${slug}.mmd`}
          code={toMermaidSankey(layout)}
          onClose={() => setExporting(null)}
        />
      )}
      {exporting === 'csv' && (
        <FlowCsvExport layout={layout} filename={`flow-${slug}.csv`} onClose={() => setExporting(null)} />
      )}
    </div>
  );
}
