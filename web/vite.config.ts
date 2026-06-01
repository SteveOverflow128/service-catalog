import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { scanCatalog, DATA_DIR, REPO_ROOT } from './scripts/scan-catalog.mjs';
import { resolve } from 'node:path';

// Serves /catalog.json by scanning data/ LIVE on every request, so net-new
// files and edits show up on reload — no rebuild, no restart. In dev it also
// watches data/ and triggers a full reload the instant a file is added,
// changed, or removed. Registered for both the dev server and `vite preview`
// (the served build). Pure static hosting still works via the prebuilt
// public/catalog.json snapshot.
function liveCatalog(): Plugin {
  const isCatalogReq = (url?: string) => !!url && url.replace(/\?.*$/, '').endsWith('/catalog.json');

  const handle: Connect.NextHandleFunction = (req, res, next) => {
    if (!isCatalogReq(req.url)) return next();
    scanCatalog()
      .then(({ payload }) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(payload));
      })
      .catch(() => next()); // fall back to the static snapshot if the scan fails
  };

  const isDataJson = (file: string) => {
    const p = file.replace(/\\/g, '/');
    return p.startsWith(DATA_DIR.replace(/\\/g, '/')) && p.endsWith('.json');
  };

  return {
    name: 'live-catalog',
    configureServer(server) {
      server.middlewares.use(handle); // pre-middleware: wins over public/ static
      server.watcher.add(DATA_DIR);
      const reload = (file: string) => {
        if (!isDataJson(file)) return;
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('change', reload);
      server.watcher.on('unlink', reload);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

// Validates an edited service JSON against the schema and writes it back to
// data/<serviceId>.json. Only registered in the dev server (not preview/build).
function saveService(): Plugin {
  const SCHEMA_PATH = resolve(REPO_ROOT, 'schema', 'service-catalog.schema.json');
  const route = /^\/api\/services\/([^/?#]+)/;

  const handle: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'PUT' || !route.test(req.url ?? '')) return next();
    const match = route.exec(req.url ?? '');
    if (!match) return next();
    const serviceId = decodeURIComponent(match[1]);

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString('utf8');

        let parsed: Record<string, unknown>;
        try {
          const raw = JSON.parse(body);
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('must be a JSON object');
          parsed = raw as Record<string, unknown>;
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, errors: [`JSON parse error: ${(e as Error).message}`] }));
          return;
        }

        if (parsed.serviceId !== serviceId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, errors: [`serviceId in body ("${parsed.serviceId}") does not match URL ("${serviceId}")`] }));
          return;
        }

        // Strip _source — it's injected by the scanner, not part of the schema.
        delete parsed._source;

        let schema: object;
        try {
          schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
        } catch {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, errors: ['Server could not load schema file'] }));
          return;
        }

        const ajv = new Ajv({ strict: false, validateSchema: false, allErrors: true });
        const validate = ajv.compile(schema);
        if (!validate(parsed)) {
          const errors = (validate.errors ?? []).map((e) => {
            const path = e.instancePath || '(root)';
            return `${path}: ${e.message ?? 'invalid'}`;
          });
          res.statusCode = 422;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, errors }));
          return;
        }

        await writeFile(
          resolve(DATA_DIR, `${serviceId}.json`),
          JSON.stringify(parsed, null, 2) + '\n',
          'utf8',
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      })();
    });
    req.on('error', () => next());
  };

  return {
    name: 'save-service',
    configureServer(server) {
      server.middlewares.use(handle);
    },
  };
}

// Relative base so the built bundle works when served from any subpath
// (internal tools frequently live behind a reverse-proxy prefix).
export default defineConfig({
  base: './',
  plugins: [react(), liveCatalog(), saveService()],
  server: {
    port: 5180,
    host: true,
  },
});
