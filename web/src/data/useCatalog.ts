import { useEffect, useState } from 'react';
import type { Catalog } from '../types';
import { CatalogIndex, withoutInfrastructure } from './catalog';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  // `index` is the full graph; `indexNoInfra` drops ambient infrastructure
  // nodes (and edges to them). The graph views switch between them via the
  // shared "show infrastructure" toggle.
  | { status: 'ready'; index: CatalogIndex; indexNoInfra: CatalogIndex };

/** Fetches the generated catalog.json and builds the in-memory graph index. */
export function useCatalog(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const url = `${import.meta.env.BASE_URL}catalog.json`;
    // no-store: the dev/preview server serves this live from data/, so never
    // hand back a stale cached copy.
    fetch(url, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        return res.json() as Promise<Catalog>;
      })
      .then((catalog) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          index: new CatalogIndex(catalog),
          indexNoInfra: new CatalogIndex(withoutInfrastructure(catalog)),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
