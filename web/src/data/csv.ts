import type { CatalogIndex } from './catalog';
import type { Service } from '../types';

// Column catalog for the mesh CSV export. `key` doubles as the CSV header.
// `list: true` columns collapse a multi-valued field into a single cell.
// Pure (no DOM/React) so it can be unit-tested in isolation.

export interface CsvField {
  key: string;
  default: boolean;
  list?: boolean;
  hint?: string;
  value: (s: Service, index: CatalogIndex) => string;
}

const LIST_SEP = '; ';

/** First RDS entry in the service's awsServices (case-insensitive type match). */
const rdsAws = (s: Service) => (s.awsServices ?? []).find((a) => a.type.toUpperCase() === 'RDS');

export const CSV_FIELDS: CsvField[] = [
  { key: 'serviceId', default: true, value: (s) => s.serviceId },
  { key: 'valueStream', default: true, value: (s) => s.valueStream ?? '' },
  { key: 'train', default: true, value: (s) => s.train ?? '' },
  { key: 'product', default: true, value: (s) => s.product ?? '' },
  { key: 'team', default: true, value: (s) => s.team },
  { key: 'teamEmail', default: true, value: (s) => s.teamEmail },
  { key: 'criticalityTier', default: true, value: (s) => String(s.criticalityTier) },
  {
    key: 'awsServices.type',
    default: true,
    list: true,
    hint: 'list of AWS service types',
    value: (s) => (s.awsServices ?? []).map((a) => a.type).join(LIST_SEP),
  },
  {
    key: 'primaryDependents',
    default: true,
    list: true,
    hint: 'services that directly depend on this one',
    value: (s, index) => [...new Set(index.dependantsOf(s.serviceId).map((e) => e.from))].sort().join(LIST_SEP),
  },
  // Off by default:
  {
    key: 'rdsEngine',
    default: false,
    hint: 'engine of the RDS awsService, when present',
    value: (s) => rdsAws(s)?.engine ?? '',
  },
  {
    key: 'rdsVersion',
    default: false,
    hint: 'version of the RDS awsService, when present',
    value: (s) => rdsAws(s)?.version ?? '',
  },
  { key: 'name', default: false, value: (s) => s.name },
  { key: 'runtime', default: false, value: (s) => s.runtime ?? '' },
  { key: 'softwareFramework', default: false, value: (s) => s.softwareFramework ?? '' },
  { key: 'dataClassification', default: false, value: (s) => s.dataClassification },
  { key: 'financeProduct', default: false, value: (s) => s.financeProduct ?? '' },
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
