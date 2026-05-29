// Shared catalog scanner. Walks the repo's data/ tree (recursively) and returns
// the aggregated catalog payload. Used two ways:
//   - build-catalog.mjs   -> writes a static public/catalog.json snapshot
//   - vite-plugin (config) -> serves /catalog.json live, scanning per request
//
// Files that fail to parse or lack a serviceId are skipped (collected as
// warnings) rather than aborting — the explorer is a read-only viewer and
// should degrade gracefully.

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const DATA_DIR = resolve(REPO_ROOT, 'data');

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

/** Scan `dataDir` and return { payload, warnings }. */
export async function scanCatalog(dataDir = DATA_DIR) {
  const files = (await walk(dataDir)).sort();
  const services = [];
  const warnings = [];

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      warnings.push(`skip ${rel}: invalid JSON (${err.message})`);
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      warnings.push(`skip ${rel}: not an object`);
      continue;
    }
    if (typeof parsed.serviceId !== 'string' || !parsed.serviceId) {
      warnings.push(`skip ${rel}: missing serviceId`);
      continue;
    }
    services.push({ ...parsed, _source: rel });
  }

  // Deterministic order for stable diffs / stable layout seeds.
  services.sort((a, b) => a.serviceId.localeCompare(b.serviceId));

  const seen = new Map();
  for (const s of services) {
    if (seen.has(s.serviceId)) {
      warnings.push(`duplicate serviceId "${s.serviceId}" (${s._source} vs ${seen.get(s.serviceId)})`);
    } else {
      seen.set(s.serviceId, s._source);
    }
  }

  const payload = {
    generatedFrom: relative(REPO_ROOT, dataDir),
    count: services.length,
    services,
  };
  return { payload, warnings };
}
