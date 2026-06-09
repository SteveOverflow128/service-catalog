import { useMemo, useState } from 'react';
import type { MapMode, Service } from '../types';
import type { CatalogIndex } from '../data/catalog';
import { buildMeshElements, buildSubgraphElements, fcoseLayout } from '../graph/build';
import { toMermaid } from '../graph/mermaid';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';
import { MermaidExport } from './MermaidExport';
import { CsvExport } from './CsvExport';
import { InfraToggle } from './InfraToggle';
import { CriticalToggle } from './CriticalToggle';
import { BothIcon, CodeIcon, DownstreamIcon, TableIcon, UpstreamIcon } from './icons';

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

// Neighborhood controls, mirroring the dependency map but seeded from the whole
// slice rather than a single root: direction of traversal + how many hops out.
const MODES: { key: MapMode; label: string; hint: string; Icon: typeof BothIcon }[] = [
  { key: 'dependencies', label: 'Dependencies', hint: 'what the slice calls', Icon: DownstreamIcon },
  { key: 'dependants', label: 'Dependants', hint: 'what calls into the slice', Icon: UpstreamIcon },
  { key: 'both', label: 'Both', hint: 'full neighborhood', Icon: BothIcon },
];

// How far the neighborhood reaches out from the slice. 'in' stays inside the
// group (services only — internal arrows, no external neighbors); the rest
// expand outward by hop count ('all' = unbounded).
type Reach = 'in' | 1 | 2 | 'all';

const REACHES: { key: Reach; label: string }[] = [
  { key: 'in', label: 'Services only' },
  { key: 1, label: '1 hop' },
  { key: 2, label: '2 hops' },
  { key: 'all', label: 'All' },
];

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
  showInfra,
  onToggleInfra,
  criticalOnly,
  onToggleCriticalOnly,
}: {
  index: CatalogIndex;
  onSelectNode: (id: string) => void;
  showInfra: boolean;
  onToggleInfra: () => void;
  criticalOnly: boolean;
  onToggleCriticalOnly: () => void;
}) {
  const [dim, setDim] = useState<GroupByDim | null>(null);
  const [dimValue, setDimValue] = useState<string | null>(null);
  // Neighborhood expansion from the slice — defaults reproduce the previous
  // "with deps" view: the slice plus what it directly calls (1 hop forward).
  const [mode, setMode] = useState<MapMode>('dependencies');
  const [reach, setReach] = useState<Reach>(1);
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

  // Grow the visible graph outward from every service in the slice, honoring the
  // direction (mode) + hop (depth) controls. Null when no slice is active, in
  // which case the full mesh is shown.
  const neighborhood = useMemo(() => {
    if (!isFiltered) return null;
    // "Services only": just the slice, with arrows between its members — nothing
    // outside the group. Otherwise expand outward by direction + hop count.
    if (reach === 'in') return index.induced(filteredServiceIds);
    return index.egoSet(filteredServiceIds, mode, reach === 'all' ? 0 : reach);
  }, [index, isFiltered, filteredServiceIds, mode, reach]);

  const visibleEdges = neighborhood ? neighborhood.edges : index.allEdges;

  // On the full-mesh path, `pruneIsolated` drops services left edgeless by the
  // critical filter from the canvas. Mirror that here so the exports + stats
  // match what's drawn. (Slice-active paths use the neighborhood set instead.)
  const fullMeshServices = useMemo(
    () =>
      criticalOnly
        ? index.services.filter(
            (s) => index.dependencyCount(s.serviceId) > 0 || index.dependantCount(s.serviceId) > 0,
          )
        : index.services,
    [index, criticalOnly],
  );

  // Catalog services within the visible neighborhood (externals have no record).
  const visibleServices = useMemo(() => {
    if (!neighborhood) return fullMeshServices;
    return [...neighborhood.nodes]
      .map((id) => index.byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [neighborhood, index, fullMeshServices]);

  const elements = useMemo(
    () =>
      neighborhood
        ? buildSubgraphElements(index, neighborhood.nodes, neighborhood.edges)
        : buildMeshElements(index, { pruneIsolated: criticalOnly }),
    [index, neighborhood, criticalOnly],
  );

  const layoutKey = `${dim ?? 'all'}-${dimValue ?? 'all'}-${mode}-${reach}`;

  const handleClick = (id: string) => {
    if (index.byId.has(id)) onSelectNode(id);
  };

  const getMermaidNodes = (): Set<string> => {
    if (neighborhood) return neighborhood.nodes;
    const ids = new Set<string>();
    if (criticalOnly) {
      for (const e of index.allEdges) {
        ids.add(e.from);
        ids.add(e.to);
      }
      return ids;
    }
    for (const s of index.services) ids.add(s.serviceId);
    for (const id of index.externals.keys()) ids.add(id);
    return ids;
  };

  // Direction is meaningless when staying in-group, so it drops out of the label.
  const scopeLabel =
    reach === 'in'
      ? 'services only'
      : `${mode} · ${reach === 'all' ? 'all hops' : `${reach} hop${reach === 1 ? '' : 's'}`}`;
  const scopeSlug =
    reach === 'in' ? 'services-only' : `${mode}-${reach === 'all' ? 'all' : reach + 'hop'}`;

  const mermaidTitle = isFiltered
    ? `${dimValue} (${DIM_LABELS[dim!]}) — ${scopeLabel}`
    : 'Full service mesh';

  const exportFilename = isFiltered
    ? `mesh-${dim}-${(dimValue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${scopeSlug}`
    : 'service-mesh';

  const statsLabel = isFiltered
    ? `${filteredServices.length} of ${index.services.length} services · ${visibleEdges.length} links`
    : `${fullMeshServices.length} services · ${index.allEdges.length} links`;

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
          <div className="mesh__neighborhood">
            <div
              className={`modeseg${reach === 'in' ? ' modeseg--off' : ''}`}
              role="tablist"
              aria-label="Neighborhood direction"
            >
              {MODES.map((m) => (
                <button
                  key={m.key}
                  role="tab"
                  aria-selected={mode === m.key}
                  disabled={reach === 'in'}
                  className={`segbtn ${mode === m.key ? 'segbtn--on' : ''}`}
                  onClick={() => setMode(m.key)}
                  title={reach === 'in' ? 'Direction applies once you reach beyond the group' : m.hint}
                >
                  <m.Icon width={15} height={15} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            <div className="depthseg" role="group" aria-label="Neighborhood reach">
              {REACHES.map((r) => (
                <button
                  key={r.label}
                  className={`depthbtn ${reach === r.key ? 'depthbtn--on' : ''}`}
                  onClick={() => setReach(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <InfraToggle on={showInfra} onToggle={onToggleInfra} />
          <CriticalToggle on={criticalOnly} onToggle={onToggleCriticalOnly} />
        </span>
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
          services={visibleServices}
          title={isFiltered ? `Export — ${dimValue} (${DIM_LABELS[dim!]})` : 'Export mesh as CSV'}
          filename={`${exportFilename}.csv`}
          onClose={() => setExportingCsv(false)}
        />
      )}
    </div>
  );
}
