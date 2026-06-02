import { useMemo, useState } from 'react';
import type { Service } from '../types';
import type { CatalogIndex } from '../data/catalog';
import { buildMeshElements, fcoseLayout } from '../graph/build';
import { toMermaid } from '../graph/mermaid';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';
import { MermaidExport } from './MermaidExport';
import { CsvExport } from './CsvExport';
import { CodeIcon, TableIcon } from './icons';

type GroupByDim = 'product' | 'catalogGroup' | 'train' | 'resource.type' | 'resource.provider' | 'resource.region' | 'criticalityTier' | 'team';

const DIM_ORDER: GroupByDim[] = ['train', 'catalogGroup', 'product', 'team', 'criticalityTier', 'resource.type', 'resource.provider', 'resource.region'];

const DIM_LABELS: Record<GroupByDim, string> = {
  train: 'Train',
  catalogGroup: 'Catalog Group',
  product: 'Product',
  team: 'Team',
  criticalityTier: 'Criticality Tier',
  'resource.type': 'Resource Type',
  'resource.provider': 'Provider',
  'resource.region': 'Region',
};

function getDimValues(services: Service[], dim: GroupByDim): string[] {
  const vals = new Set<string>();
  for (const s of services) {
    if (dim === 'product' && s.product) vals.add(s.product);
    else if (dim === 'catalogGroup' && s.catalogGroup) vals.add(s.catalogGroup);
    else if (dim === 'train' && s.train) vals.add(s.train);
    else if (dim === 'criticalityTier') vals.add(String(s.criticalityTier));
    else if (dim === 'team' && s.team) vals.add(s.team);
    else if (dim === 'resource.type') {
      for (const r of s.resources ?? []) vals.add(r.type);
    }
    else if (dim === 'resource.provider') {
      for (const r of s.resources ?? []) vals.add(r.provider);
    }
    else if (dim === 'resource.region') {
      for (const r of s.resources ?? []) if (r.region) vals.add(r.region);
    }
  }
  return [...vals].sort((a, b) => a.localeCompare(b));
}

function filterByDim(services: Service[], dim: GroupByDim, value: string): Service[] {
  return services.filter((s) => {
    if (dim === 'product') return s.product === value;
    if (dim === 'catalogGroup') return s.catalogGroup === value;
    if (dim === 'train') return s.train === value;
    if (dim === 'criticalityTier') return String(s.criticalityTier) === value;
    if (dim === 'team') return s.team === value;
    if (dim === 'resource.type') return (s.resources ?? []).some((r) => r.type === value);
    if (dim === 'resource.provider') return (s.resources ?? []).some((r) => r.provider === value);
    if (dim === 'resource.region') return (s.resources ?? []).some((r) => r.region === value);
    return false;
  });
}

export function MeshView({
  index,
  onSelectNode,
}: {
  index: CatalogIndex;
  onSelectNode: (id: string) => void;
}) {
  const [dim, setDim] = useState<GroupByDim | null>(null);
  const [dimValue, setDimValue] = useState<string | null>(null);
  const [showDeps, setShowDeps] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const handleDimChange = (newDim: GroupByDim | null) => {
    setDim(newDim);
    if (newDim) {
      const vals = getDimValues(index.services, newDim);
      setDimValue(vals[0] ?? null);
    } else {
      setDimValue(null);
    }
  };

  const dimValues = useMemo(
    () => (dim ? getDimValues(index.services, dim) : []),
    [index.services, dim],
  );

  const isFiltered = dim !== null && dimValue !== null;

  const filteredServices = useMemo(() => {
    if (!isFiltered) return index.services;
    return filterByDim(index.services, dim!, dimValue!);
  }, [index.services, dim, dimValue, isFiltered]);

  const filteredServiceIds = useMemo(
    () => new Set(filteredServices.map((s) => s.serviceId)),
    [filteredServices],
  );

  const visibleEdges = useMemo(() => {
    if (!isFiltered) return index.allEdges;
    if (!showDeps) return [];
    return index.allEdges.filter((e) => filteredServiceIds.has(e.from));
  }, [index.allEdges, isFiltered, showDeps, filteredServiceIds]);

  const elements = useMemo(
    () =>
      buildMeshElements(
        index,
        isFiltered ? { serviceIds: filteredServiceIds, showDeps } : undefined,
      ),
    [index, isFiltered, filteredServiceIds, showDeps],
  );

  const layoutKey = `${dim ?? 'all'}-${dimValue ?? 'all'}-${showDeps}`;

  const handleClick = (id: string) => {
    if (index.byId.has(id)) onSelectNode(id);
  };

  const getMermaidNodes = (): Set<string> => {
    if (!isFiltered) {
      const ids = new Set<string>();
      for (const s of index.services) ids.add(s.serviceId);
      for (const id of index.externals.keys()) ids.add(id);
      return ids;
    }
    if (!showDeps) return new Set(filteredServiceIds);
    const ids = new Set<string>(filteredServiceIds);
    for (const e of visibleEdges) ids.add(e.to);
    return ids;
  };

  const mermaidTitle = isFiltered
    ? `${dimValue} (${DIM_LABELS[dim!]})`
    : 'Full service mesh';

  const exportFilename = isFiltered
    ? `mesh-${dim}-${(dimValue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : 'service-mesh';

  const statsLabel = isFiltered
    ? `${filteredServices.length} of ${index.services.length} services · ${visibleEdges.length} links`
    : `${index.services.length} services · ${index.allEdges.length} links`;

  return (
    <div className="mesh">
      <div className="mesh__head">
        <div>
          <span className="overline">Service Mesh</span>
          <h2 className="mesh__title h-display">{statsLabel}</h2>
        </div>
        <div className="mesh__headright">
          <p className="mesh__hint">
            {isFiltered
              ? `Showing ${filteredServices.length} service${filteredServices.length !== 1 ? 's' : ''} in ${DIM_LABELS[dim!]}: ${dimValue}.`
              : 'Force-directed map of every catalogued service. Hubs grow with connection count — hover to isolate a neighborhood, click to open a service.'}
          </p>
          <div className="mesh__exports">
            <button className="exportbtn" onClick={() => setExportingCsv(true)} title="Export as CSV">
              <TableIcon width={15} height={15} />
              <span>Export CSV</span>
            </button>
            <button className="exportbtn" onClick={() => setExporting(true)} title="Export as Mermaid diagram">
              <CodeIcon width={15} height={15} />
              <span>Mermaid</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mesh__filter">
        <span className="overline" style={{ flexShrink: 0 }}>Slice by</span>
        <select
          className="filter-select"
          value={dim ?? ''}
          onChange={(e) => handleDimChange((e.target.value as GroupByDim) || null)}
        >
          <option value="">— All services —</option>
          {DIM_ORDER.map((d) => (
            <option key={d} value={d}>{DIM_LABELS[d]}</option>
          ))}
        </select>

        {dim && dimValues.length > 0 && (
          <select
            className="filter-select"
            value={dimValue ?? ''}
            onChange={(e) => setDimValue(e.target.value)}
          >
            {dimValues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

        {isFiltered && (
          <div className="modeseg" style={{ marginLeft: 'auto' }}>
            <button
              className={`segbtn${showDeps ? ' segbtn--on' : ''}`}
              onClick={() => setShowDeps(true)}
            >
              With deps
            </button>
            <button
              className={`segbtn${!showDeps ? ' segbtn--on' : ''}`}
              onClick={() => setShowDeps(false)}
            >
              Services only
            </button>
          </div>
        )}
      </div>

      <div className="mesh__canvaswrap">
        <GraphCanvas
          elements={elements}
          layout={fcoseLayout}
          onNodeClick={handleClick}
          layoutKey={layoutKey}
        />
        <Legend />
      </div>

      {exporting && (
        <MermaidExport
          title={mermaidTitle}
          filename={`${exportFilename}.mmd`}
          code={toMermaid(index, getMermaidNodes(), visibleEdges, {
            title: mermaidTitle,
            direction: 'LR',
          })}
          onClose={() => setExporting(false)}
        />
      )}

      {exportingCsv && (
        <CsvExport
          index={index}
          services={filteredServices}
          title={isFiltered ? `Export — ${dimValue} (${DIM_LABELS[dim!]})` : 'Export mesh as CSV'}
          filename={`${exportFilename}.csv`}
          onClose={() => setExportingCsv(false)}
        />
      )}
    </div>
  );
}
