import { useCallback, useEffect, useState } from 'react';
import type { Catalog } from '../types';
import { CatalogIndex } from './catalog';

type Status =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  // `index` is the full graph; `catalog` is the raw source the graph views
  // filter on demand (infra / critical) via composable transforms.
  | { status: 'ready'; index: CatalogIndex; catalog: Catalog };

// `refetch` re-reads catalog.json and rebuilds the index. The app calls it
// after a save so it sees its own writes immediately, rather than depending on
// the dev server's data/ file-watch reload (flaky across platforms, e.g. WSL2).
type State = Status & { refetch: () => void };

/** Fetches the generated catalog.json and builds the in-memory graph index. */
export function useCatalog(): State {
  const [state, setState] = useState<Status>({ status: 'loading' });

  const load = useCallback((signal?: AbortSignal) => {
    const url = `${import.meta.env.BASE_URL}catalog.json`;
    // no-store: the dev/preview server serves this live from data/, so never
    // hand back a stale cached copy.
    fetch(url, { cache: 'no-store', signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        return res.json() as Promise<Catalog>;
      })
      .then((catalog) => {
        if (signal?.aborted) return;
        setState({
          status: 'ready',
          index: new CatalogIndex(catalog),
          catalog,
        });
      })
      .catch((err: unknown) => {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const refetch = useCallback(() => load(), [load]);

  return { ...state, refetch };
}
