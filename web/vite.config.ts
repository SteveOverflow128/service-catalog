import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { scanCatalog, DATA_DIR } from './scripts/scan-catalog.mjs';

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

// Relative base so the built bundle works when served from any subpath
// (internal tools frequently live behind a reverse-proxy prefix).
export default defineConfig({
  base: './',
  plugins: [react(), liveCatalog()],
  server: {
    port: 5180,
    host: true,
  },
});
