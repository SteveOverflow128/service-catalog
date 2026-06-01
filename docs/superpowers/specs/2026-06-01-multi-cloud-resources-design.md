# Design: Multi-cloud + on-prem `resources` model

- **Date:** 2026-06-01
- **Status:** Approved (pending spec review)
- **Topic:** Generalize the catalog's AWS-only infra model to support AWS, Azure, and on-prem.

## Context

The catalog schema is AWS-centric. A single top-level `awsServices` array models every
piece of provisioned infrastructure a service uses (RDS, S3, SQS, OpenSearch, SES, Glue, …),
and that concept is woven through the schema, the TypeScript types, both service-detail views,
the filter facets, the mesh group-by dimensions, the CSV exporter, the validator tests, the
examples, the docs, and the throwaway sample-data generator.

The org now runs services on **Azure** and **on-prem** as well as AWS. The catalog can't
describe them. A secondary ask ("Azure DevOps") turned out to be unscoped and is deferred.

## Goals

- Describe provisioned resources across **AWS, Azure, and on-prem** in one model.
- Keep one code path end-to-end (no per-provider duplication).
- Make a resource's provider a first-class, filterable, groupable dimension.

## Non-goals (explicitly out of scope)

- **GCP** — not in play today. The model absorbs it later with one enum value; we don't add it now.
- **Azure DevOps structured fields** — the existing `repository` URI already accepts an ADO repo
  URL. No schema change. Deferred until a concrete need exists.
- **`dependencies[].interaction` enum** — still carries AWS-flavored values (`s3`, `dms`, `fdw`).
  Known wart, separate concern, left untouched.
- **Backward compatibility / migration shim** — `data/*.json` is throwaway generated sample data
  (see project memory). We do a clean break and regenerate, not a migration.

## Decision

Replace the top-level `awsServices` array with a single provider-agnostic **`resources`** array.
Each item gains a **required `provider`** discriminator (`aws | azure | on-prem`). All existing
fields are retained (they are already provider-neutral); the one AWS-specific field name
(`rdsPrimaryInstanceCount`) is generalized to `primaryInstanceCount`.

**Why `resources` (not `infrastructure`):** the array already holds items that aren't
infrastructure in the strict sense (SES = email, CloudWatch = observability, Glue = ETL jobs),
and that trend grows (serverless, API gateways, CDNs, ML endpoints). Both AWS and Azure
officially call these things "resources." Scope creep is fenced by the schema shape
(required `provider`/`type`/`purpose`, `additionalProperties: false`), not by the field name.
The UI section may still be labeled "Resources" for SRE readability — field name and display
label are decoupled.

## Schema changes (`schema/service-catalog.schema.json`)

Rename `awsServices` → `resources`. New item shape:

```jsonc
"resources": {
  "type": "array",
  "description": "Provider-managed resources and on-prem equivalents this service provisions or runs on.",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["provider", "type", "purpose"],
    "properties": {
      "provider":     { "enum": ["aws", "azure", "on-prem"] },   // NEW, required
      "type":         { "type": "string", "minLength": 1 },       // free-form: rds, azure-sql, vm, ...
      "purpose":      { "type": "string", "minLength": 1 },
      "engine":       { "type": "string" },
      "version":      { "type": "string" },
      "instanceType": { "type": "string" },
      "drStrategy":   { "enum": ["none","startEmpty","startRestoreFromBackup","startWithReplicatedData","activeActive","unknown"] },
      "primaryInstanceCount": { "type": "integer", "minimum": 0 },  // renamed from rdsPrimaryInstanceCount
      "minReplicas":  { "type": "integer", "minimum": 0 },
      "maxReplicas":  { "type": "integer", "minimum": 0 },
      "cpuRequest":   { "type": "string" },
      "memoryRequest":{ "type": "string" },
      "cpuLimit":     { "type": "string" },
      "memoryLimit":  { "type": "string" }
    }
  }
}
```

- `type` stays free-form (no enum) — too many resource types across three providers to enumerate.
- Update the schema-level `title`/`description` wording: drop "AWS", e.g.
  `"Identity, ownership, operational, resource, data, and dependency metadata for one service."`
- `provider` is **required** so every row is self-describing and filterable.

## TypeScript types (`web/src/types.ts`)

- `interface AwsService` → `interface Resource` (add `provider: Provider`, rename
  `rdsPrimaryInstanceCount` → `primaryInstanceCount`).
- Add `export type Provider = 'aws' | 'azure' | 'on-prem' | string;` — the trailing `string`
  fallback matches this file's existing "viewer never breaks on schema evolution" convention.
- `Service.awsServices?: AwsService[]` → `Service.resources?: Resource[]`.

## Web explorer

| File | Change |
|------|--------|
| `components/ServiceDetail.tsx` | "AWS" section → "Resources"; add a per-item provider badge (tag) alongside type/drStrategy. |
| `components/ServiceDetailPage.tsx` | "AWS Services" section → "Resources"; stat label "AWS services" → "Resources"; per-item provider badge. |
| `components/Filters.tsx` | Rename `awsTypes` facet → `resourceTypes` (label "Resource Type"); add a new `providers` facet (label "Provider"). |
| `data/catalog.ts` | Rename `awsTypes` facet builder → `resourceTypes`; add a `providers` facet. |
| `components/MeshView.tsx` | Rename group-by dim `awsService.type` → `resource.type` (label "Resource Type"); add new `resource.provider` dim (label "Provider"). |
| `data/csv.ts` | Rename column keys/headers/hints `awsServices.*` → `resources.*`; add a `resources.providers` column (distinct providers). Generalize helpers (see below). |

### `csv.ts` helper generalization

- `findAws(s, t)` → `findResource(s, t)` — find first resource whose `type` matches (case-insensitive).
- `rdsAws` (matched `type === 'RDS'`) → `dbResource(s)` — match the first resource that has an
  `engine` (or `primaryInstanceCount`) set, so Azure SQL / on-prem DBs populate the same columns.
- `workloadAws` (resource carrying sizing fields) → `workloadResource(s)` — unchanged logic,
  renamed. Columns for replicas/cpu/memory now provider-agnostic.
- Column header/`hint` text loses "AWS"/"RDS" framing in favor of "resource"/"primary datastore".

## Validator (TDD — `validator/`)

The validator is schema-driven (`schema_check.py`, `cross_field.py`, `catalog_check.py` contain
**no** AWS-specific logic), so the schema edit does most of the work.

- **Write tests first** for the new contract in `validator/tests/test_schema_check.py`:
  - a `resources` item missing `provider` is rejected;
  - a `resources` item with `provider` outside the enum is rejected;
  - a valid multi-provider `resources` array passes.
- Update the existing resource-level DR-enum test: `awsServices[].drStrategy` →
  `resources[].drStrategy`.
- No changes to `cross_field.py` / `catalog_check.py`.

## Examples & invalid fixtures (`examples/`)

- `service.example.json` — convert `awsServices` → `resources`, showing **all three providers**
  (an aws + azure + on-prem item) so it reads as a real multi-cloud reference.
- `invalid/bad-dr-strategy-enum.json` — rename `awsServices` → `resources` (still trips the
  resource-level DR enum); add a valid `provider` so the DR enum is the only failure.
- **New** `invalid/missing-resource-provider.json` — a `resources` item with no `provider`.
- **New** `invalid/bad-resource-provider-enum.json` — a `resources` item with `provider: "gcp"`.

## Docs & sample data

- `docs/service-repo-quickstart.md` — two `awsServices` mentions → `resources`.
- `web/README.md` — CSV-column docs: `awsServices.type` → `resources.type`; generalize the
  RDS/instanceType note to "primary datastore resource".
- `scripts/generate_sample_data.py` (untracked, throwaway) — rename the `aws=` param →
  `resources=`, set a `provider` on each item, and sprinkle some `azure` / `on-prem` entries so
  the demo data exercises the new model. Regenerate `data/*.json` and `web/public/catalog.json`.

## Migration / compatibility

Clean break. No dual-read of `awsServices`. Sample data is regenerated. The dev-only
`PUT /api/services/:id` write path edits throwaway configs and needs no special handling.

## Testing strategy

- **Validator:** pytest, TDD — new `provider` required/enum tests + the renamed DR-enum test.
- **Web:** no test suite exists (no `test` script, no `*.test.*` files). Verify via
  `tsc --noEmit` (or the build) + running `web/scripts/scan-catalog.mjs`, which ajv-validates
  every catalog file against the updated schema, + a manual smoke of detail view / filters /
  mesh / CSV export.

## Blast-radius checklist (every touchpoint)

1. `schema/service-catalog.schema.json` — array rename + `provider` + `primaryInstanceCount` + title/description.
2. `web/src/types.ts` — `Resource`/`Provider` types, `Service.resources`.
3. `web/src/components/ServiceDetail.tsx` — section + provider badge.
4. `web/src/components/ServiceDetailPage.tsx` — section + stat + provider badge.
5. `web/src/components/Filters.tsx` — `resourceTypes` + new `providers` facet.
6. `web/src/data/catalog.ts` — facet builders.
7. `web/src/components/MeshView.tsx` — `resource.type` + new `resource.provider` dim.
8. `web/src/data/csv.ts` — columns + helper generalization + `providers` column.
9. `validator/tests/test_schema_check.py` — renamed + new provider tests.
10. `examples/service.example.json` — multi-provider conversion.
11. `examples/invalid/bad-dr-strategy-enum.json` — rename + valid provider.
12. `examples/invalid/missing-resource-provider.json` — NEW.
13. `examples/invalid/bad-resource-provider-enum.json` — NEW.
14. `docs/service-repo-quickstart.md` — wording.
15. `web/README.md` — CSV-column docs.
16. `scripts/generate_sample_data.py` + regenerated `data/*.json`, `web/public/catalog.json`.
</content>
</invoke>
