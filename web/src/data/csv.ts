import type { CatalogIndex } from './catalog';
import type { Service } from '../types';

// Column catalog for the mesh CSV export. `key` doubles as the CSV header.
// `list: true` columns collapse a multi-valued field into a single cell.
// Pure (no DOM/React) so it can be unit-tested in isolation.
//
// Region-scoped export: when `toCsv` is called with `explodeByRegion`, each
// service emits one row per distinct resource region, and resource-derived
// value functions receive that region and scope to it. The optional third
// `region` argument is `undefined` in normal mode (aggregate over all
// resources) and a single region string (possibly '') in per-region mode.

export interface CsvField {
  key: string;
  default: boolean;
  /** Show in the primary Columns section without pre-checking it. */
  promoted?: boolean;
  list?: boolean;
  hint?: string;
  value: (s: Service, index: CatalogIndex, region?: string) => string;
}

const LIST_SEP = '; ';

/** Resources of `s`, optionally scoped to one region. '' selects resources that
 *  carry no region. `undefined` returns every resource (normal, non-split mode). */
const resourcesIn = (s: Service, region?: string) => {
  const rs = s.resources ?? [];
  return region === undefined ? rs : rs.filter((r) => (r.region ?? '') === region);
};

/** Distinct regions across a service's resources ('' buckets region-less ones).
 *  A service with no resources yields a single '' bucket so it is never dropped
 *  from a per-region export. */
const regionsOf = (s: Service): string[] => {
  const rs = s.resources ?? [];
  if (rs.length === 0) return [''];
  return [...new Set(rs.map((r) => r.region ?? ''))].sort();
};

/** First resource that looks like a primary datastore (carries engine/instance info). */
const dbResource = (s: Service, region?: string) =>
  resourcesIn(s, region).find((r) => r.engine != null || r.dbInstanceCount != null);

/** First resource that carries workload sizing fields. */
const workloadResource = (s: Service, region?: string) =>
  resourcesIn(s, region).find(
    (r) => r.minReplicas != null || r.maxReplicas != null || r.cpuRequest != null || r.memoryRequest != null,
  );

export const CSV_FIELDS: CsvField[] = [
  { key: 'name', default: false, promoted: true, value: (s) => s.name },
  { key: 'serviceId', default: true, value: (s) => s.serviceId },
  { key: 'catalogGroup', default: true, hint: 'freeform catalog grouping', value: (s) => s.catalogGroup ?? '' },
  { key: 'valueStream', default: true, value: (s) => s.valueStream ?? '' },
  { key: 'train', default: true, value: (s) => s.train ?? '' },
  { key: 'jiraPrefix', default: true, hint: 'Jira project key prefix', value: (s) => s.jiraPrefix ?? '' },
  { key: 'product', default: true, value: (s) => s.product ?? '' },
  { key: 'team', default: true, value: (s) => s.team },
  { key: 'teamEmail', default: true, value: (s) => s.teamEmail },
  { key: 'criticalityTier', default: true, value: (s) => String(s.criticalityTier) },
  {
    key: 'resources.type',
    default: true,
    list: true,
    hint: 'list of resource types',
    value: (s, _index, region) => resourcesIn(s, region).map((r) => r.type).join(LIST_SEP),
  },
  {
    key: 'resources.provider',
    default: false,
    list: true,
    hint: 'distinct providers across the (region-scoped) resources',
    value: (s, _index, region) =>
      [...new Set(resourcesIn(s, region).map((r) => r.provider))].sort().join(LIST_SEP),
  },
  {
    key: 'region',
    default: false,
    list: true,
    hint: 'resource region(s); a single region per row when "one row per region" is on',
    value: (s, _index, region) =>
      region !== undefined
        ? region
        : [...new Set((s.resources ?? []).map((r) => r.region).filter((x): x is string => !!x))]
            .sort()
            .join(LIST_SEP),
  },
  {
    key: 'primaryDependents',
    default: true,
    list: true,
    hint: 'services that directly depend on this one',
    value: (s, index) => [...new Set(index.dependantsOf(s.serviceId).map((e) => e.from))].sort().join(LIST_SEP),
  },
  // Off by default:

  { key: 'lifecycle', default: false, value: (s) => s.lifecycle },
  { key: 'description', default: false, value: (s) => s.description ?? '' },
  { key: 'repository', default: false, value: (s) => s.repository },
  { key: 'runtime', default: false, value: (s) => s.runtime ?? '' },
  { key: 'softwareFramework', default: false, value: (s) => s.softwareFramework ?? '' },
  { key: 'dataClassification', default: false, value: (s) => s.dataClassification },
  { key: 'financeProduct', default: false, value: (s) => s.financeProduct ?? '' },
  { key: 'drStrategy', default: false, hint: 'top-level service DR posture', value: (s) => s.drStrategy ?? '' },
  { key: 'lastUpdatedDate', default: false, hint: 'date the entry was last updated', value: (s) => s.lastUpdatedDate ?? '' },
  { key: 'verifiedBy', default: false, hint: 'who last verified the entry', value: (s) => s.verifiedBy ?? '' },
  { key: 'verificationDate', default: false, hint: 'date the entry was last verified', value: (s) => s.verificationDate ?? '' },
  {
    key: 'processingModesSupported',
    default: false,
    list: true,
    value: (s) => (s.processingModesSupported ?? []).join(LIST_SEP),
  },
  {
    key: 'dependencies.count',
    default: false,
    hint: 'number of outbound dependencies',
    value: (s) => String(s.dependencies?.length ?? 0),
  },
  {
    key: 'dependencies',
    default: false,
    list: true,
    hint: 'serviceIds this service depends on',
    value: (s) => (s.dependencies ?? []).map((d) => d.serviceId).join(LIST_SEP),
  },
  {
    key: 'dependencyList',
    default: false,
    list: true,
    hint: 'display names of direct (1-hop) dependencies; falls back to serviceId for externals',
    value: (s, index) =>
      (s.dependencies ?? [])
        .map((d) => index.byId.get(d.serviceId)?.name ?? d.serviceId)
        .join(LIST_SEP),
  },
  {
    key: 'excludedDependencies.count',
    default: false,
    hint: 'number of excluded dependencies',
    value: (s) => String(s.excludedDependencies?.length ?? 0),
  },
  {
    key: 'resources.drStrategy',
    default: false,
    list: true,
    hint: 'DR strategies across the (region-scoped) resources',
    value: (s, _index, region) =>
      resourcesIn(s, region).map((r) => r.drStrategy ?? '').filter(Boolean).join(LIST_SEP),
  },
  {
    key: 'datastores',
    default: false,
    list: true,
    hint: 'datastore names',
    value: (s) => (s.datastores ?? []).map((d) => d.name).join(LIST_SEP),
  },
  {
    key: 'minReplicas',
    default: false,
    hint: 'minimum replicas of the workload resource, when present',
    value: (s, _index, region) => { const w = workloadResource(s, region); return w?.minReplicas != null ? String(w.minReplicas) : ''; },
  },
  {
    key: 'maxReplicas',
    default: false,
    hint: 'maximum replicas of the workload resource, when present',
    value: (s, _index, region) => { const w = workloadResource(s, region); return w?.maxReplicas != null ? String(w.maxReplicas) : ''; },
  },
  {
    key: 'cpuRequest',
    default: false,
    hint: 'CPU request of the workload resource, when present',
    value: (s, _index, region) => workloadResource(s, region)?.cpuRequest ?? '',
  },
  {
    key: 'memoryRequest',
    default: false,
    hint: 'memory request of the workload resource, when present',
    value: (s, _index, region) => workloadResource(s, region)?.memoryRequest ?? '',
  },
  {
    key: 'cpuLimit',
    default: false,
    hint: 'CPU limit of the workload resource, when present',
    value: (s, _index, region) => workloadResource(s, region)?.cpuLimit ?? '',
  },
  {
    key: 'memoryLimit',
    default: false,
    hint: 'memory limit of the workload resource, when present',
    value: (s, _index, region) => workloadResource(s, region)?.memoryLimit ?? '',
  },
  {
    key: 'dbInstanceCount',
    default: false,
    hint: 'instance count of the primary datastore resource, when present',
    value: (s, _index, region) => { const r = dbResource(s, region); return r?.dbInstanceCount != null ? String(r.dbInstanceCount) : ''; },
  },
  {
    key: 'dbEngine',
    default: false,
    hint: 'engine of the primary datastore resource, when present',
    value: (s, _index, region) => dbResource(s, region)?.engine ?? '',
  },
  {
    key: 'dbVersion',
    default: false,
    hint: 'version of the primary datastore resource, when present',
    value: (s, _index, region) => dbResource(s, region)?.version ?? '',
  },
  {
    key: 'dbInstanceType',
    default: false,
    hint: 'instanceType of the primary datastore resource, when present',
    value: (s, _index, region) => dbResource(s, region)?.instanceType ?? '',
  },
];

export const DEFAULT_CSV_FIELDS = CSV_FIELDS.filter((f) => f.default).map((f) => f.key);

/** RFC 4180 cell quoting. */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** Number of rows a given export will produce (header excluded). */
export function csvRowCount(services: Service[], explodeByRegion: boolean): number {
  if (!explodeByRegion) return services.length;
  return services.reduce((n, s) => n + regionsOf(s).length, 0);
}

/** One row per service (sorted by serviceId), columns in canonical order
 *  filtered to the selected keys. When `explodeByRegion` is set, each service
 *  emits one row per distinct resource region and resource columns scope to it. */
export function toCsv(
  index: CatalogIndex,
  services: Service[],
  selected: ReadonlySet<string>,
  explodeByRegion = false,
): string {
  const cols = CSV_FIELDS.filter((f) => selected.has(f.key));
  if (cols.length === 0) return '';
  const rows = [...services].sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  const lines = [cols.map((c) => csvCell(c.key)).join(',')];
  for (const s of rows) {
    const regions: (string | undefined)[] = explodeByRegion ? regionsOf(s) : [undefined];
    for (const region of regions) {
      lines.push(cols.map((c) => csvCell(c.value(s, index, region))).join(','));
    }
  }
  return lines.join('\n');
}
