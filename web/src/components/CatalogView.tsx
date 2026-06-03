import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { Filters, matchesFilters, matchesQuery, type FilterState } from './Filters';
import { ServiceCard } from './ServiceCard';
import { CsvExport } from './CsvExport';
import { CheckIcon, TableIcon } from './icons';
import type { Facets } from '../data/catalog';

type Sort = 'criticality' | 'name' | 'dependants' | 'dependencies';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'criticality', label: 'Criticality' },
  { key: 'dependants', label: 'Most depended-on' },
  { key: 'dependencies', label: 'Most dependencies' },
  { key: 'name', label: 'A–Z' },
];

function tierRank(t: Service['criticalityTier']): number {
  const n = Number(t);
  return Number.isFinite(n) ? n : 99;
}

export function CatalogView({
  index,
  facets,
  query,
  filters,
  onToggle,
  onClear,
  onOpen,
  onMapView,
  onFlowView,
  onMapSelected,
}: {
  index: CatalogIndex;
  facets: Facets;
  query: string;
  filters: FilterState;
  onToggle: (group: keyof FilterState, value: string) => void;
  onClear: () => void;
  onOpen: (id: string) => void;
  onMapView: (id: string) => void;
  onFlowView: (id: string) => void;
  onMapSelected: (ids: string[]) => void;
}) {
  const [sort, setSort] = useState<Sort>('criticality');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectMode = () =>
    setSelectMode((on) => {
      if (on) setSelected(new Set()); // turning off clears the selection
      return !on;
    });

  const results = useMemo(() => {
    const filtered = index.services.filter((s) => matchesFilters(s, filters) && matchesQuery(s, query));
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'dependants':
          return index.dependantCount(b.serviceId) - index.dependantCount(a.serviceId);
        case 'dependencies':
          return (b.dependencies?.length ?? 0) - (a.dependencies?.length ?? 0);
        case 'criticality':
        default:
          return tierRank(a.criticalityTier) - tierRank(b.criticalityTier) || a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [index, filters, query, sort]);

  return (
    <div className="catalog">
      <Filters facets={facets} services={index.services} state={filters} onToggle={onToggle} onClear={onClear} />

      <div className="results scrolly">
        <div className="results__head">
          <div className="results__count">
            <span className="results__n mono">{results.length}</span>
            <span className="results__label">
              service{results.length === 1 ? '' : 's'}
              <span className="results__total mono"> / {index.services.length}</span>
            </span>
          </div>
          <div className="sortseg">
            {SORTS.map((s) => (
              <button
                key={s.key}
                className={`sortbtn ${sort === s.key ? 'sortbtn--on' : ''}`}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="results__actions">
            <button
              className={`exportbtn${selectMode ? ' exportbtn--on' : ''}`}
              onClick={toggleSelectMode}
              aria-pressed={selectMode}
              title="Select multiple services to map together"
            >
              <CheckIcon width={15} height={15} />
              <span>Select multiple</span>
            </button>
            <button className="exportbtn" onClick={() => setExportingCsv(true)} title="Export current results as CSV">
              <TableIcon width={15} height={15} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {selectMode && (
          <div className="selbar">
            <span className="selbar__count mono">{selected.size} selected</span>
            <button
              className="selbar__cta"
              disabled={selected.size === 0}
              onClick={() => onMapSelected([...selected])}
            >
              Map selected →
            </button>
            <button className="selbar__clear" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <span className="selbar__hint mono">checks persist across filters</span>
          </div>
        )}

        {results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__ring" />
            <p>No services match the current search and filters.</p>
            <button className="ghost-btn" onClick={onClear}>
              Reset filters
            </button>
          </div>
        ) : (
          <div className="cardgrid">
            {results.map((s, i) => (
              <ServiceCard
                key={s.serviceId}
                service={s}
                index={index}
                onOpen={onOpen}
                onMapView={onMapView}
                onFlowView={onFlowView}
                selectMode={selectMode}
                selected={selected.has(s.serviceId)}
                onToggleSelect={toggleSelect}
                style={{ animationDelay: `${Math.min(i * 24, 480)}ms` }}
              />
            ))}
          </div>
        )}
      </div>
      {exportingCsv && (
        <CsvExport
          index={index}
          services={results}
          title="Export catalog results as CSV"
          filename="service-catalog.csv"
          onClose={() => setExportingCsv(false)}
        />
      )}
    </div>
  );
}
