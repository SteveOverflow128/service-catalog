import { useCallback, useEffect, useState } from 'react';
import { useCatalog } from './data/useCatalog';
import { deriveFacets } from './data/catalog';
import { TopBar, type View } from './components/TopBar';
import { CatalogView } from './components/CatalogView';
import { MeshView } from './components/MeshView';
import { ServiceDetail } from './components/ServiceDetail';
import { DependencyMap } from './components/DependencyMap';
import { emptyFilters, type FilterState } from './components/Filters';
import { ArrowRight } from './components/icons';

/** Parse the URL hash into view + selected service for shareable deep links:
 *  `#/` catalog · `#/mesh` mesh · `#/s/<serviceId>` a service map. */
function readHash(): { view: View; selectedId: string | null } {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'mesh') return { view: 'mesh', selectedId: null };
  if (h.startsWith('s/')) return { view: 'catalog', selectedId: decodeURIComponent(h.slice(2)) };
  return { view: 'catalog', selectedId: null };
}

export default function App() {
  const state = useCatalog();
  const initial = readHash();
  const [view, setView] = useState<View>(initial.view);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);

  // state -> hash (replace, so the in-app back button drives navigation)
  useEffect(() => {
    const target = selectedId
      ? `#/s/${encodeURIComponent(selectedId)}`
      : view === 'mesh'
        ? '#/mesh'
        : '#/';
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [view, selectedId]);

  // hash -> state (browser back/forward, pasted links)
  useEffect(() => {
    const onHash = () => {
      const r = readHash();
      setView(r.view);
      setSelectedId(r.selectedId);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toggle = useCallback((group: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const next: FilterState = { ...prev, [group]: new Set(prev[group]) };
      const set = next[group] as Set<string>;
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(emptyFilters()), []);

  const open = useCallback((id: string) => setSelectedId(id), []);
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const changeView = useCallback((v: View) => {
    setView(v);
    setSelectedId(null);
  }, []);

  const handleQuery = useCallback((q: string) => {
    setQuery(q);
    if (q) {
      setView('catalog');
      setSelectedId(null);
    }
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="app">
        <div className="observatory-bg" />
        <div className="boot">
          <div className="boot__ring" />
          <span className="overline">Initialising observatory…</span>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="app">
        <div className="observatory-bg" />
        <div className="boot boot--error">
          <h1 className="h-display">Catalog unavailable</h1>
          <p className="mono">{state.error}</p>
          <p className="boot__hint">
            Run <code className="mono">npm run catalog</code> to (re)generate{' '}
            <code className="mono">public/catalog.json</code> from <code className="mono">../data</code>.
          </p>
        </div>
      </div>
    );
  }

  const { index } = state;
  const facets = deriveFacets(index.services); // O(n) over 57 entries — cheap
  const selected = selectedId ? index.byId.get(selectedId) : undefined;

  return (
    <div className="app">
      <div className="observatory-bg" />
      <TopBar
        query={query}
        onQuery={handleQuery}
        view={view}
        onView={changeView}
        serviceCount={index.services.length}
      />

      <main className="app__body">
        {selected ? (
          <div className="detail" key={selected.serviceId}>
            <div className="detail__bar">
              <button className="backbtn" onClick={closeDetail}>
                <ArrowRight width={14} height={14} className="backbtn__ico" />
                <span>{view === 'mesh' ? 'Mesh' : 'Catalog'}</span>
              </button>
              <span className="detail__crumb mono">
                / {selected.serviceId}
              </span>
            </div>
            <div className="detail__split">
              <ServiceDetail index={index} service={selected} onSelectNode={open} />
              <DependencyMap index={index} rootId={selected.serviceId} onSelectNode={open} />
            </div>
          </div>
        ) : view === 'catalog' ? (
          <CatalogView
            index={index}
            facets={facets}
            query={query}
            filters={filters}
            onToggle={toggle}
            onClear={clearFilters}
            onOpen={open}
          />
        ) : (
          <MeshView index={index} onSelectNode={open} />
        )}
      </main>
    </div>
  );
}
