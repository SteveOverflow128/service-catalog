# Service Observatory

Internal web UI for the service catalog — browse, search, and filter every
catalogued service, and explore its **dependencies**, **dependants**, and the
combined **neighborhood** as an interactive map.

A dark, control-room ("observatory") interface anchored to the corporate brand
palette. Criticality tiers become a color-coded signal system; critical
dependency edges glow; external systems (Stripe, UPS, …) render as dashed
diamonds.

## Data source

The UI reads its data at load time from `/catalog.json` — the data is **not**
bundled into the JS. How that endpoint is produced depends on how you run it:

| Mode | `/catalog.json` is… | Picks up net-new / changed files? |
|------|---------------------|-----------------------------------|
| `npm run dev` | **scanned live** from [`../data`](../data) on every request by the `live-catalog` Vite plugin; `data/` is watched and the page **hot-reloads** the instant a file is added/changed/removed | ✅ instantly, no restart |
| `npm run preview` (serves the build) | **scanned live** by the same plugin | ✅ on reload |
| Pure static hosting of `dist/` (S3, GH Pages, nginx…) | the **prebuilt snapshot** `public/catalog.json`, generated at build time | ❌ — re-run `npm run catalog` (or rebuild) and redeploy |

So: drop a new `*.json` into `data/` (any depth) and it shows up live under
`dev`/`preview`. For a static deploy, regenerate the snapshot on demand:

```bash
npm run catalog     # rescan ../data -> public/catalog.json
```

The scan logic is shared (`scripts/scan-catalog.mjs`) between the CLI snapshot
and the live plugin, so both behave identically. Each input file is one entry
conforming to
[`../schema/service-catalog.schema.json`](../schema/service-catalog.schema.json);
files that fail to parse or lack a `serviceId` are skipped (logged as warnings),
never fatal. **Dependants are derived client-side** by reversing the
`dependencies` edges across the catalog — services don't declare them.

## Develop

```bash
npm install
npm run dev        # Vite on :5180, serving data/ live (see Data source)
```

## Build

```bash
npm run build      # tsc -b && vite build  ->  dist/
npm run preview
```

`vite.config.ts` uses a relative `base` so the built bundle works behind any
reverse-proxy path prefix.

## Views

| View | What it shows |
|------|---------------|
| **Catalog** | Searchable, faceted card list (criticality, lifecycle, data classification, team, product, value stream, interaction, framework). Sort by criticality / most-depended-on / most-dependencies / name. |
| **Service map** | Open a service → full metadata panel + dependency map. Toggle **Dependencies / Dependants / Both** and traversal depth (1 hop / 2 hops / All). Click any node to re-center on it. |
| **Mesh** | Force-directed map of the entire service graph. Node size scales with connection count; hover isolates a neighborhood. |

## Stack

React + TypeScript + Vite · [Cytoscape.js](https://js.cytoscape.org/)
(dagre for directional dependency flow, fCoSE for the mesh) · IBM Plex Sans /
Mono bundled via `@fontsource` (offline-capable). No runtime backend — it's a
static read-only lens over the catalog data.
