import { useMemo, useState } from 'react';
import type { Service } from '../types';
import type { Facets } from '../data/catalog';
import { classificationStyles, lifecycleStyles, tierStyle } from '../design/tokens';

export interface FilterState {
  trains: Set<string>;
  lifecycles: Set<string>;
  tiers: Set<string>;
  classifications: Set<string>;
  teams: Set<string>;
  products: Set<string>;
  valueStreams: Set<string>;
  frameworks: Set<string>;
  awsTypes: Set<string>;
}

export const emptyFilters = (): FilterState => ({
  trains: new Set(),
  lifecycles: new Set(),
  tiers: new Set(),
  classifications: new Set(),
  teams: new Set(),
  products: new Set(),
  valueStreams: new Set(),
  frameworks: new Set(),
  awsTypes: new Set(),
});

export function countActive(f: FilterState): number {
  return (Object.values(f) as Set<string>[]).reduce((n, s) => n + s.size, 0);
}

type GroupKey = keyof FilterState;

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
  colorFor,
  labelFor,
  defaultOpen = true,
}: {
  title: string;
  options: { value: string; count: number }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  colorFor?: (v: string) => string | undefined;
  labelFor?: (v: string) => string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (options.length === 0) return null;
  return (
    <div className={`facet ${open ? '' : 'facet--closed'}`}>
      <button className="facet__head" onClick={() => setOpen((o) => !o)}>
        <span className="overline">{title}</span>
        <span className="facet__chev">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="facet__opts">
          {options.map((o) => {
            const on = selected.has(o.value);
            const c = colorFor?.(o.value);
            return (
              <button
                key={o.value}
                className={`facet-chip ${on ? 'facet-chip--on' : ''}`}
                onClick={() => onToggle(o.value)}
                aria-pressed={on}
              >
                {c && <span className="facet-chip__dot" style={{ background: c }} />}
                <span className="facet-chip__label">{labelFor ? labelFor(o.value) : o.value}</span>
                <span className="facet-chip__count mono">{o.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function tally(services: Service[], pick: (s: Service) => string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of services) {
    for (const v of pick(s)) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

export function Filters({
  facets,
  services,
  state,
  onToggle,
  onClear,
}: {
  facets: Facets;
  services: Service[];
  state: FilterState;
  onToggle: (group: GroupKey, value: string) => void;
  onClear: () => void;
}) {
  const counts = useMemo(
    () => ({
      trains: tally(services, (s) => (s.train ? [s.train] : [])),
      lifecycles: tally(services, (s) => [s.lifecycle]),
      tiers: tally(services, (s) => [String(s.criticalityTier)]),
      classifications: tally(services, (s) => [s.dataClassification]),
      teams: tally(services, (s) => (s.team ? [s.team] : [])),
      products: tally(services, (s) => (s.product ? [s.product] : [])),
      valueStreams: tally(services, (s) => (s.valueStream ? [s.valueStream] : [])),
      frameworks: tally(services, (s) => (s.softwareFramework ? [s.softwareFramework] : [])),
      awsTypes: tally(services, (s) => (s.awsServices ?? []).map((a) => a.type)),
    }),
    [services],
  );

  const opts = (vals: string[], c: Map<string, number>) =>
    vals.map((v) => ({ value: v, count: c.get(v) ?? 0 })).filter((o) => o.count > 0);

  const active = countActive(state);

  return (
    <aside className="rail scrolly">
      <div className="rail__head">
        <span className="overline">Filter</span>
        {active > 0 && (
          <button className="rail__clear" onClick={onClear}>
            clear {active}
          </button>
        )}
      </div>

      <FacetGroup
        title="Train"
        options={opts(facets.trains, counts.trains)}
        selected={state.trains}
        onToggle={(v) => onToggle('trains', v)}
      />
      <FacetGroup
        title="Criticality"
        options={opts(facets.tiers, counts.tiers)}
        selected={state.tiers}
        onToggle={(v) => onToggle('tiers', v)}
        colorFor={(v) => tierStyle(v).color}
        labelFor={(v) => tierStyle(v).label.replace(/ ·.*/, '')}
      />
      <FacetGroup
        title="Lifecycle"
        options={opts(facets.lifecycles, counts.lifecycles)}
        selected={state.lifecycles}
        onToggle={(v) => onToggle('lifecycles', v)}
        colorFor={(v) => lifecycleStyles[v]?.color}
      />
      <FacetGroup
        title="Data Classification"
        options={opts(facets.classifications, counts.classifications)}
        selected={state.classifications}
        onToggle={(v) => onToggle('classifications', v)}
        colorFor={(v) => classificationStyles[v]?.color}
      />
      <FacetGroup
        title="Team"
        options={opts(facets.teams, counts.teams)}
        selected={state.teams}
        onToggle={(v) => onToggle('teams', v)}
      />
      <FacetGroup
        title="Product"
        options={opts(facets.products, counts.products)}
        selected={state.products}
        onToggle={(v) => onToggle('products', v)}
        defaultOpen={false}
      />
      <FacetGroup
        title="Value Stream"
        options={opts(facets.valueStreams, counts.valueStreams)}
        selected={state.valueStreams}
        onToggle={(v) => onToggle('valueStreams', v)}
        defaultOpen={false}
      />
      <FacetGroup
        title="Framework"
        options={opts(facets.frameworks, counts.frameworks)}
        selected={state.frameworks}
        onToggle={(v) => onToggle('frameworks', v)}
        defaultOpen={false}
      />
      <FacetGroup
        title="AWS Service"
        options={opts(facets.awsTypes, counts.awsTypes)}
        selected={state.awsTypes}
        onToggle={(v) => onToggle('awsTypes', v)}
        defaultOpen={false}
      />
    </aside>
  );
}

/** Pure predicate used by the list view. */
export function matchesFilters(s: Service, f: FilterState): boolean {
  if (f.trains.size && !(s.train && f.trains.has(s.train))) return false;
  if (f.lifecycles.size && !f.lifecycles.has(s.lifecycle)) return false;
  if (f.tiers.size && !f.tiers.has(String(s.criticalityTier))) return false;
  if (f.classifications.size && !f.classifications.has(s.dataClassification)) return false;
  if (f.teams.size && !(s.team && f.teams.has(s.team))) return false;
  if (f.products.size && !(s.product && f.products.has(s.product))) return false;
  if (f.valueStreams.size && !(s.valueStream && f.valueStreams.has(s.valueStream))) return false;
  if (f.frameworks.size && !(s.softwareFramework && f.frameworks.has(s.softwareFramework))) return false;
  if (f.awsTypes.size && !(s.awsServices ?? []).some((a) => f.awsTypes.has(a.type))) return false;
  return true;
}

export function matchesQuery(s: Service, q: string): boolean {
  if (!q) return true;
  const hay = [
    s.name,
    s.serviceId,
    s.description,
    s.team,
    s.product,
    s.valueStream,
    s.runtime,
    s.softwareFramework,
    ...(s.features ?? []).map((f) => f.name),
    ...Object.entries(s.tags ?? {}).map(([k, v]) => `${k}:${v}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}
