# Multi-cloud + On-Prem `resources` Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AWS-only `awsServices` array with a provider-agnostic `resources` array (each item carries a required `provider: aws|azure|on-prem`), end-to-end across schema, validator, web explorer, examples, docs, and sample data.

**Architecture:** One unified array with a `provider` discriminator. All existing infra fields are retained (they're already provider-neutral); `rdsPrimaryInstanceCount` is renamed to the provider-neutral `primaryInstanceCount`. Clean break — sample data is throwaway and is regenerated, not migrated. The schema is the source of truth; the Python validator and the web `ajv` scanner both validate against it.

**Tech Stack:** JSON Schema (draft 2020-12), Python `jsonschema` (pytest), React + TypeScript + Vite, Node `ajv`/`ajv-formats`.

**Reference spec:** `docs/superpowers/specs/2026-06-01-multi-cloud-resources-design.md`

**Conventions for every commit message:** end with the trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 1: Schema contract + validator tests + fixtures (TDD, Python)

Foundation. The validator suite must stay green at commit, so the schema flip, the example conversion, and the fixtures land together.

**Files:**
- Modify: `schema/service-catalog.schema.json` (lines 5, 41–65)
- Modify: `validator/tests/test_schema_check.py`
- Modify: `examples/service.example.json` (lines 37–41)
- Modify: `examples/invalid/bad-dr-strategy-enum.json`
- Create: `examples/invalid/missing-resource-provider.json`
- Create: `examples/invalid/bad-resource-provider-enum.json`

**Setup (once, if not already):** from `validator/` run `pip install -e '.[dev]'`.

- [ ] **Step 1: Create the two new invalid fixtures (test inputs)**

`examples/invalid/missing-resource-provider.json`:
```json
{
  "serviceId": "broken",
  "name": "Broken",
  "team": "T",
  "teamEmail": "x@example.com",
  "lifecycle": "prod",
  "criticalityTier": 3,
  "repository": "https://example.com",
  "dataClassification": "INTERNAL",
  "resources": [
    { "type": "rds", "purpose": "x" }
  ]
}
```

`examples/invalid/bad-resource-provider-enum.json`:
```json
{
  "serviceId": "broken",
  "name": "Broken",
  "team": "T",
  "teamEmail": "x@example.com",
  "lifecycle": "prod",
  "criticalityTier": 3,
  "repository": "https://example.com",
  "dataClassification": "INTERNAL",
  "resources": [
    { "provider": "gcp", "type": "gke", "purpose": "x" }
  ]
}
```

- [ ] **Step 2: Add the failing tests**

In `validator/tests/test_schema_check.py`, append:
```python
def test_missing_resource_provider_returns_error(schema):
    data = load_invalid("missing-resource-provider.json")
    errors = check_against_schema(data, schema)
    assert any("provider" in e for e in errors), errors


def test_bad_resource_provider_enum_returns_error(schema):
    data = load_invalid("bad-resource-provider-enum.json")
    errors = check_against_schema(data, schema)
    assert any("provider" in e for e in errors), errors
```

Also update the stale docstring on `test_bad_top_level_dr_strategy_enum_returns_error` (line 63):
```python
    """Top-level drStrategy has a different enum from resources[].drStrategy."""
```

- [ ] **Step 3: Run the new tests — verify they FAIL**

Run (from `validator/`): `pytest tests/test_schema_check.py -k resource_provider -v`
Expected: both FAIL — the schema still defines `awsServices`, so a doc with `resources` is rejected by root `additionalProperties:false` (the error mentions `additional`/`resources`, not `provider`).

- [ ] **Step 4: Flip the schema to `resources`**

In `schema/service-catalog.schema.json`, change the title-block description (line 5):
```json
  "description": "Identity, ownership, operational, resource, data, and dependency metadata for one service.",
```
Replace the entire `awsServices` property (lines 41–65) with:
```jsonc
    "resources": {
      "type": "array",
      "description": "Provider-managed resources and on-prem equivalents this service provisions or runs on.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["provider", "type", "purpose"],
        "properties": {
          "provider":     { "enum": ["aws", "azure", "on-prem"] },
          "type":         { "type": "string", "minLength": 1 },
          "purpose":      { "type": "string", "minLength": 1 },
          "engine":       { "type": "string" },
          "version":      { "type": "string" },
          "instanceType": { "type": "string" },
          "drStrategy": {
            "enum": ["none", "startEmpty", "startRestoreFromBackup", "startWithReplicatedData", "activeActive", "unknown"]
          },
          "primaryInstanceCount": { "type": "integer", "minimum": 0 },
          "minReplicas":    { "type": "integer", "minimum": 0 },
          "maxReplicas":    { "type": "integer", "minimum": 0 },
          "cpuRequest":     { "type": "string" },
          "memoryRequest":  { "type": "string" },
          "cpuLimit":       { "type": "string" },
          "memoryLimit":    { "type": "string" }
        }
      }
    },
```

- [ ] **Step 5: Convert the canonical example and the DR-enum fixture**

In `examples/service.example.json`, replace the `awsServices` block (lines 37–41) with a multi-provider `resources` block:
```json
  "resources": [
    { "provider": "aws",     "type": "rds",          "purpose": "Primary OLTP store for tasks and assignments", "engine": "postgres", "version": "16.2", "drStrategy": "startRestoreFromBackup" },
    { "provider": "aws",     "type": "sqs",          "purpose": "Async task-event queue for notifications",      "drStrategy": "startEmpty" },
    { "provider": "azure",   "type": "blob-storage", "purpose": "Task attachment storage",                       "drStrategy": "startWithReplicatedData" },
    { "provider": "on-prem", "type": "vm",           "purpose": "Legacy batch reconciliation worker",            "instanceType": "8c/32g" }
  ],
```

In `examples/invalid/bad-dr-strategy-enum.json`, rename `awsServices` → `resources` and add a valid `provider` (so the bad `drStrategy` stays the only failure):
```json
  "resources": [
    { "provider": "aws", "type": "rds", "purpose": "x", "drStrategy": "activeactive" }
  ]
```

- [ ] **Step 6: Run the full validator suite — verify all PASS**

Run (from `validator/`): `pytest -v`
Expected: PASS — including `test_canonical_example_has_no_schema_errors`, `test_bad_dr_strategy_enum_returns_error`, and the two new provider tests.

- [ ] **Step 7: Commit**

```bash
git add schema/service-catalog.schema.json validator/tests/test_schema_check.py examples/service.example.json examples/invalid/
git commit -m "feat(schema,validator): replace awsServices with provider-agnostic resources array

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Sample-data generator + regenerate data (throwaway, gated by validator)

`scripts/generate_sample_data.py` is untracked throwaway, but the explorer reads its output, so regenerate so the schema and the demo data agree.

**Files:**
- Modify: `scripts/generate_sample_data.py`
- Regenerate (untracked): `data/*.json`, `web/public/catalog.json`

- [ ] **Step 1: Rename the `aws` plumbing in the `svc()` helper**

In `scripts/generate_sample_data.py`, change the signature param `aws=None` → `resources=None`, and the body:
```python
    if resources:
        obj["resources"] = resources
```

- [ ] **Step 2: Convert every caller**

Every `svc(... aws=[ {…}, … ] …)` becomes `resources=[ {…}, … ]`, and **every dict in that list MUST gain a `provider`**. Default `provider="aws"`; for demo realism change a few services to other providers. Examples:

Before:
```python
        aws=[{"type": "RDS", "purpose": "Token store", "engine": "postgres", ...}],
```
After:
```python
        resources=[{"provider": "aws", "type": "RDS", "purpose": "Token store", "engine": "postgres", ...}],
```
For realism, set `provider="azure"` on ~3 services (e.g. give one a `{"provider": "azure", "type": "azure-sql", ...}`) and `provider="on-prem"` on ~1 (e.g. `{"provider": "on-prem", "type": "vm", "purpose": "...", "instanceType": "16c/64g"}`). Also rename any `rdsPrimaryInstanceCount` key in the data → `primaryInstanceCount`.

- [ ] **Step 3: Regenerate the data tree and the static snapshot**

```bash
python scripts/generate_sample_data.py
cd web && node scripts/build-catalog.mjs
```
Expected: `build-catalog` prints `wrote N services` with **no** `schema …` warnings.

- [ ] **Step 4: Validate the regenerated tree (real gate)**

Run (from repo root): `service-catalog-validate data/`
Expected: exit 0, no errors. (If the console-script isn't on PATH, run `python -m service_catalog_validator.cli data/` from `validator/src`.)

- [ ] **Step 5: Commit the generator**

```bash
git add scripts/generate_sample_data.py
git commit -m "chore(scripts): emit provider-tagged resources in sample data

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Data files under `data/` and `web/public/catalog.json` are gitignored throwaway — do not commit them.)

---

## Task 3: Web — rename `awsServices` → `resources` end-to-end (+ provider on cards)

Pure rename plus surfacing `provider` on each resource card. Ends green on `tsc`. No new facet/dimension yet (Task 4).

**Files:**
- Modify: `web/src/types.ts` (lines 40–54, 103)
- Modify: `web/src/components/ServiceDetail.tsx` (lines 241–256)
- Modify: `web/src/components/ServiceDetailPage.tsx` (lines 427–432, 556–570)
- Modify: `web/src/data/csv.ts` (lines 20–29, 43–47, 102–106, 116–174)
- Modify: `web/src/data/catalog.ts` (lines 151, 164, 176, 190)
- Modify: `web/src/components/Filters.tsx` (lines 15, 27, 116, 193–198, 213)
- Modify: `web/src/components/MeshView.tsx` (lines 12–23, 33–35, 47)

- [ ] **Step 1: `types.ts` — replace the `AwsService` interface**

Replace lines 40–54 with:
```ts
export type Provider = 'aws' | 'azure' | 'on-prem' | string;

export interface Resource {
  provider: Provider;
  type: string;
  purpose: string;
  engine?: string;
  version?: string;
  instanceType?: string;
  drStrategy?: string;
  primaryInstanceCount?: number;
  minReplicas?: number;
  maxReplicas?: number;
  cpuRequest?: string;
  memoryRequest?: string;
  cpuLimit?: string;
  memoryLimit?: string;
}
```
And change line 103 `awsServices?: AwsService[];` → `resources?: Resource[];`.

- [ ] **Step 2: `ServiceDetail.tsx` — rename section + provider badge**

Replace the block at lines 241–256 with:
```tsx
      {service.resources && service.resources.length > 0 && (
        <Section label="Resources" count={service.resources.length} icon={<CloudIcon width={13} height={13} />}>
          <div className="cardlist">
            {service.resources.map((r, i) => (
              <div className="ministore" key={i}>
                <div className="ministore__top">
                  <span className="mono ministore__name">{r.type}</span>
                  <span className="tag tag--type mono">{r.provider}</span>
                  {r.drStrategy && <span className="tag tag--type mono">{r.drStrategy}</span>}
                </div>
                <div className="ministore__meta">{r.purpose}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
```

- [ ] **Step 3: `ServiceDetailPage.tsx` — rename stat + section + provider badge**

Replace the stat block (lines 427–432):
```tsx
              {(service.resources?.length ?? 0) > 0 && (
                <div className="svc-page__stat">
                  <span className="svc-page__stat-n mono">{service.resources!.length}</span>
                  <span className="svc-page__stat-l">resources</span>
                </div>
              )}
```
Replace the section block (lines 556–570):
```tsx
          {service.resources && service.resources.length > 0 && (
            <Section label="Resources" count={service.resources.length} icon={<CloudIcon width={13} height={13} />}>
              <div className="svc-page__cardgrid">
                {service.resources.map((r, i) => (
                  <div className="ministore" key={i}>
                    <div className="ministore__top">
                      <span className="mono ministore__name">{r.type}</span>
                      <span className="tag tag--type mono">{r.provider}</span>
                      {r.drStrategy && <span className="tag tag--type mono">{r.drStrategy}</span>}
                    </div>
                    <div className="ministore__meta">{r.purpose}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
```

- [ ] **Step 4: `csv.ts` — generalize helpers and rename columns**

Replace the helpers (lines 20–29) with:
```ts
/** First resource that looks like a primary datastore (carries engine/instance info). */
const dbResource = (s: Service) =>
  (s.resources ?? []).find((r) => r.engine != null || r.primaryInstanceCount != null);

/** First resource that carries workload sizing fields. */
const workloadResource = (s: Service) =>
  (s.resources ?? []).find(
    (r) => r.minReplicas != null || r.maxReplicas != null || r.cpuRequest != null || r.memoryRequest != null,
  );
```
Rename the `awsServices.type` column (lines 43–47):
```ts
  {
    key: 'resources.type',
    default: true,
    list: true,
    hint: 'list of resource types',
    value: (s) => (s.resources ?? []).map((r) => r.type).join(LIST_SEP),
  },
```
Rename the `awsServices.drStrategy` column (lines 102–106):
```ts
  {
    key: 'resources.drStrategy',
    default: false,
    list: true,
    hint: 'DR strategies across all resources',
    value: (s) => (s.resources ?? []).map((r) => r.drStrategy ?? '').filter(Boolean).join(LIST_SEP),
  },
```
Replace the workload columns (lines 116–150) — same logic, `workloadResource`, hint text "workload resource":
```ts
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
```
Replace the RDS columns (lines 151–174) with provider-agnostic db columns:
```ts
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
```

- [ ] **Step 5: `catalog.ts` — rename the facet**

Line 151: `awsTypes: string[];` → `resourceTypes: string[];`
Line 164: `const awsTypes = new Set<string>();` → `const resourceTypes = new Set<string>();`
Line 176: `for (const a of s.awsServices ?? []) awsTypes.add(a.type);` → `for (const r of s.resources ?? []) resourceTypes.add(r.type);`
Line 190: `awsTypes: sorted(awsTypes),` → `resourceTypes: sorted(resourceTypes),`

- [ ] **Step 6: `Filters.tsx` — rename the facet (label "Resource Type")**

Line 15: `awsTypes: Set<string>;` → `resourceTypes: Set<string>;`
Line 27: `awsTypes: new Set(),` → `resourceTypes: new Set(),`
Line 116: `awsTypes: tally(services, (s) => (s.awsServices ?? []).map((a) => a.type)),` → `resourceTypes: tally(services, (s) => (s.resources ?? []).map((r) => r.type)),`
Lines 192–198 FacetGroup:
```tsx
      <FacetGroup
        title="Resource Type"
        options={opts(facets.resourceTypes, counts.resourceTypes)}
        selected={state.resourceTypes}
        onToggle={(v) => onToggle('resourceTypes', v)}
        defaultOpen={false}
      />
```
Line 213 predicate:
```tsx
  if (f.resourceTypes.size && !(s.resources ?? []).some((r) => f.resourceTypes.has(r.type))) return false;
```

- [ ] **Step 7: `MeshView.tsx` — rename the dimension (label "Resource Type")**

Line 12: replace `'awsService.type'` with `'resource.type'` in the `GroupByDim` union.
Line 14: replace `'awsService.type'` with `'resource.type'` in `DIM_ORDER`.
Line 22: replace `'awsService.type': 'AWS Service',` with `'resource.type': 'Resource Type',`.
Lines 33–35:
```ts
    else if (dim === 'resource.type') {
      for (const r of s.resources ?? []) vals.add(r.type);
    }
```
Line 47:
```ts
    if (dim === 'resource.type') return (s.resources ?? []).some((r) => r.type === value);
```

- [ ] **Step 8: Typecheck + build — verify green**

```bash
cd web && npx tsc --noEmit && npm run build
```
Expected: no TS errors; build succeeds. (Grep sanity: `grep -rn "awsServices\|AwsService\|awsTypes\|awsService\." src` returns nothing.)

- [ ] **Step 9: Commit**

```bash
git add web/src/
git commit -m "feat(web): rename awsServices to resources and show provider on cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Web — provider as a first-class filter / group / export dimension

**Files:**
- Modify: `web/src/data/catalog.ts` (Facets interface + `deriveFacets`)
- Modify: `web/src/components/Filters.tsx` (FilterState, emptyFilters, counts, FacetGroup, predicate)
- Modify: `web/src/components/MeshView.tsx` (GroupByDim, DIM_ORDER, DIM_LABELS, getDimValues, filterByDim)
- Modify: `web/src/data/csv.ts` (new `resources.providers` column)

- [ ] **Step 1: `catalog.ts` — add a `providers` facet**

In the `Facets` interface add `providers: string[];`. In `deriveFacets`, add `const providers = new Set<string>();`, inside the loop `for (const r of s.resources ?? []) providers.add(r.provider);`, and in the returned object `providers: sorted(providers),`.

- [ ] **Step 2: `Filters.tsx` — add the Provider facet**

Add `providers: Set<string>;` to `FilterState`; `providers: new Set(),` to `emptyFilters`; in `counts` add `providers: tally(services, (s) => (s.resources ?? []).map((r) => r.provider)),`. Add a FacetGroup just above the "Resource Type" group:
```tsx
      <FacetGroup
        title="Provider"
        options={opts(facets.providers, counts.providers)}
        selected={state.providers}
        onToggle={(v) => onToggle('providers', v)}
        defaultOpen={false}
      />
```
Add to `matchesFilters` (before the `return true;`):
```tsx
  if (f.providers.size && !(s.resources ?? []).some((r) => f.providers.has(r.provider))) return false;
```

- [ ] **Step 3: `MeshView.tsx` — add the `resource.provider` dimension**

Add `'resource.provider'` to the `GroupByDim` union and to `DIM_ORDER` (e.g. after `'resource.type'`). Add to `DIM_LABELS`: `'resource.provider': 'Provider',`. In `getDimValues` add:
```ts
    else if (dim === 'resource.provider') {
      for (const r of s.resources ?? []) vals.add(r.provider);
    }
```
In `filterByDim` add:
```ts
    if (dim === 'resource.provider') return (s.resources ?? []).some((r) => r.provider === value);
```

- [ ] **Step 4: `csv.ts` — add a providers column**

Add immediately after the `resources.type` column:
```ts
  {
    key: 'resources.providers',
    default: false,
    list: true,
    hint: 'distinct providers across all resources',
    value: (s) => [...new Set((s.resources ?? []).map((r) => r.provider))].sort().join(LIST_SEP),
  },
```

- [ ] **Step 5: Typecheck + build — verify green**

```bash
cd web && npx tsc --noEmit && npm run build
```
Expected: no TS errors; build succeeds.

- [ ] **Step 6: Manual smoke**

```bash
cd web && npm run dev
```
Confirm: the **Provider** filter lists aws/azure/on-prem and filters; service detail cards show a provider badge; MeshView offers a **Provider** group-by; CSV export's `resources.providers` column populates. (Requires Task 2's regenerated `catalog.json`.)

- [ ] **Step 7: Commit**

```bash
git add web/src/
git commit -m "feat(web): add provider as a filter, mesh dimension, and CSV column

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Docs

**Files:**
- Modify: `docs/service-repo-quickstart.md` (lines 18, 47)
- Modify: `web/README.md` (lines 81–85)

- [ ] **Step 1: `service-repo-quickstart.md`**

Line 18: replace `` `awsServices` `` with `` `resources` `` in the optional-sections list.
Line 47: replace `` `awsServices`, `datastores`, or `dependencies` `` with `` `resources`, `datastores`, or `dependencies` ``.

- [ ] **Step 2: `web/README.md` — CSV-column docs**

Update the CSV-column description (lines 81–85): replace `awsServices.type` with `resources.type` ("the service's resource types"), and generalize the RDS/`instanceType` note to "instanceType of the service's primary datastore resource, blank when it has none" (column key `dbInstanceType`).

- [ ] **Step 3: Commit**

```bash
git add docs/service-repo-quickstart.md web/README.md
git commit -m "docs: update awsServices references to the resources model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (completed during authoring)

**Spec coverage:** every blast-radius item (1–16) in the spec maps to a task — schema/title (T1), validator tests+fixtures (T1), examples (T1), sample data (T2), types/detail-views/csv/catalog/filters/mesh rename (T3), provider facet+dim+csv column (T4), quickstart+web README (T5). Azure DevOps / GCP / interaction-enum are spec non-goals and intentionally absent.

**Type consistency:** `Resource`/`Provider` (T3) are used consistently; facet key `resourceTypes` and filter group `resourceTypes` match (T3); new facet/group/dim `providers` / `resource.provider` match across catalog.ts, Filters.tsx, MeshView.tsx (T4); CSV keys `resources.type`, `resources.providers`, `resources.drStrategy`, `primaryInstanceCount`, `db*` are internally consistent; helper names `dbResource`/`workloadResource` match their call sites.

**Placeholders:** none — every code step shows complete code; the only rule-based step (T2 caller conversion) is throwaway untracked generator data with concrete before/after examples and a real validation gate.
</content>
