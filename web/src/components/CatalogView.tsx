import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { Filters, matchesFilters, matchesQuery, type FilterState } from './Filters';
import { ServiceCard } from './ServiceCard';
import { CsvExport } from './CsvExport';
import { TableIcon } from './icons';
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
}: {
  index: CatalogIndex;
  facets: Facets;
  query: string;
  filters: FilterState;
  onToggle: (group: keyof FilterState, value: string) => void;
  onClear: () => void;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<Sort>('criticality');
  const [exportingCsv, setExportingCsv] = useState(false);

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
          <button className="exportbtn" onClick={() => setExportingCsv(true)} title="Export current results as CSV">
            <TableIcon width={15} height={15} />
            <span>CSV</span>
          </button>
        </div>

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
