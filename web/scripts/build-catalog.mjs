// Writes a static public/catalog.json snapshot from the repo's data/ tree.
// Runs automatically before `build` (so the produced dist/ is self-contained
// for pure static hosting), or on demand via `npm run catalog`.
//
// NOTE: the dev and preview servers serve /catalog.json LIVE via the Vite
// plugin in vite.config.ts — this snapshot is the fallback for static hosting,
// where a directory can't be scanned per request.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCatalog, REPO_ROOT } from './scan-catalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, '..', 'public', 'catalog.json');

const { payload, warnings } = await scanCatalog();
await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`[build-catalog] wrote ${payload.count} services -> ${relative(REPO_ROOT, OUT_FILE)}`);
for (const w of warnings) console.warn(`[build-catalog] ${w}`);
