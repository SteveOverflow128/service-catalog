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
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const DATA_DIR = resolve(REPO_ROOT, 'data');
export const SCHEMA_PATH = resolve(REPO_ROOT, 'schema', 'service-catalog.schema.json');

// Compile the catalog schema once and reuse it. Mirrors the ajv config the dev
// save endpoint uses (vite.config.ts) so the read and write paths agree on what
// "valid" means.
let _validateSchema = null;
async function getSchemaValidator() {
  if (_validateSchema) return _validateSchema;
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  // ajv v8 ships no formats of its own; register ajv-formats so `uri`, `email`,
  // and `date` are actually validated instead of skipped with a console warning.
  const ajv = new Ajv({ strict: false, validateSchema: false, allErrors: true });
  addFormats(ajv);
  _validateSchema = ajv.compile(schema);
  return _validateSchema;
}

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
  const validateSchema = await getSchemaValidator();

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
    // Validate against the catalog schema. Invalid entries are kept (the viewer
    // degrades gracefully) but every violation is surfaced as a warning instead
    // of being silently ingested.
    if (!validateSchema(parsed)) {
      for (const e of validateSchema.errors ?? []) {
        warnings.push(`schema ${rel} ${e.instancePath || '(root)'}: ${e.message}`);
      }
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

  // Dangling dependencies: an internal (external=false) dependency whose target
  // serviceId isn't a known catalog entry — almost always a typo. external=true
  // targets are third parties and are expected to be unresolved, so skip them.
  for (const s of services) {
    const deps = Array.isArray(s.dependencies) ? s.dependencies : [];
    deps.forEach((dep, i) => {
      if (dep && dep.external !== true && typeof dep.serviceId === 'string' && !seen.has(dep.serviceId)) {
        warnings.push(
          `dangling dependency ${s._source} dependencies/${i}: "${dep.serviceId}" is not a known service and external=false`,
        );
      }
    });
  }

  const payload = {
    generatedFrom: relative(REPO_ROOT, dataDir),
    count: services.length,
    services,
  };
  return { payload, warnings };
}
