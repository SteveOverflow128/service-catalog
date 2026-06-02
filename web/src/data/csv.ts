import type { CatalogIndex } from './catalog';
import type { Service } from '../types';

// Column catalog for the mesh CSV export. `key` doubles as the CSV header.
// `list: true` columns collapse a multi-valued field into a single cell.
// Pure (no DOM/React) so it can be unit-tested in isolation.

export interface CsvField {
  key: string;
  default: boolean;
  /** Show in the primary Columns section without pre-checking it. */
  promoted?: boolean;
  list?: boolean;
  hint?: string;
  value: (s: Service, index: CatalogIndex) => string;
}

const LIST_SEP = '; ';

/** First resource that looks like a primary datastore (carries engine/instance info). */
const dbResource = (s: Service) =>
  (s.resources ?? []).find((r) => r.engine != null || r.primaryInstanceCount != null);

/** First resource that carries workload sizing fields. */
const workloadResource = (s: Service) =>
  (s.resources ?? []).find(
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
    value: (s) => (s.resources ?? []).map((r) => r.type).join(LIST_SEP),
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
    hint: 'DR strategies across all resources',
    value: (s) => (s.resources ?? []).map((r) => r.drStrategy ?? '').filter(Boolean).join(LIST_SEP),
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
    value: (s) => { const w = workloadResource(s); return w?.minReplicas != null ? String(w.minReplicas) : ''; },
  },
  {
    key: 'maxReplicas',
    default: false,
    hint: 'maximum replicas of the workload resource, when present',
    value: (s) => { const w = workloadResource(s); return w?.maxReplicas != null ? String(w.maxReplicas) : ''; },
  },
  {
    key: 'cpuRequest',
    default: false,
    hint: 'CPU request of the workload resource, when present',
    value: (s) => workloadResource(s)?.cpuRequest ?? '',
  },
  {
    key: 'memoryRequest',
    default: false,
    hint: 'memory request of the workload resource, when present',
    value: (s) => workloadResource(s)?.memoryRequest ?? '',
  },
  {
    key: 'cpuLimit',
    default: false,
    hint: 'CPU limit of the workload resource, when present',
    value: (s) => workloadResource(s)?.cpuLimit ?? '',
  },
  {
    key: 'memoryLimit',
    default: false,
    hint: 'memory limit of the workload resource, when present',
    value: (s) => workloadResource(s)?.memoryLimit ?? '',
  },
  {
    key: 'primaryInstanceCount',
    default: false,
    hint: 'primary instance count of the primary datastore resource, when present',
    value: (s) => { const r = dbResource(s); return r?.primaryInstanceCount != null ? String(r.primaryInstanceCount) : ''; },
  },
  {
    key: 'dbEngine',
    default: false,
    hint: 'engine of the primary datastore resource, when present',
    value: (s) => dbResource(s)?.engine ?? '',
  },
  {
    key: 'dbVersion',
    default: false,
    hint: 'version of the primary datastore resource, when present',
    value: (s) => dbResource(s)?.version ?? '',
  },
  {
    key: 'dbInstanceType',
    default: false,
    hint: 'instanceType of the primary datastore resource, when present',
    value: (s) => dbResource(s)?.instanceType ?? '',
  },
];

export const DEFAULT_CSV_FIELDS = CSV_FIELDS.filter((f) => f.default).map((f) => f.key);

/** RFC 4180 cell quoting. */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** One row per service (sorted by serviceId), columns in canonical order
 *  filtered to the selected keys. */
export function toCsv(index: CatalogIndex, services: Service[], selected: ReadonlySet<string>): string {
  const cols = CSV_FIELDS.filter((f) => selected.has(f.key));
  if (cols.length === 0) return '';
  const rows = [...services].sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  const lines = [cols.map((c) => csvCell(c.key)).join(',')];
  for (const s of rows) lines.push(cols.map((c) => csvCell(c.value(s, index))).join(','));
  return lines.join('\n');
}
