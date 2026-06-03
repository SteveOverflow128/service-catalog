import { useCallback, useEffect, useState } from 'react';
import { useCatalog } from './data/useCatalog';
import { deriveFacets } from './data/catalog';
import { parseHash, viewToHash, type AppView } from './data/routing';
import { TopBar } from './components/TopBar';
import { CatalogView } from './components/CatalogView';
import { MeshView } from './components/MeshView';
import { ServiceDetail } from './components/ServiceDetail';
import { ServiceDetailPage } from './components/ServiceDetailPage';
import { DependencyMap } from './components/DependencyMap';
import { RootsSidebar } from './components/RootsSidebar';
import { emptyFilters, type FilterState } from './components/Filters';
import { ArrowRight } from './components/icons';

export default function App() {
  const state = useCatalog();
  const [view, setView] = useState<AppView>(() => parseHash(window.location.hash));
  const [lastTopView, setLastTopView] = useState<'catalog' | 'mesh'>('catalog');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);

  // Remember the last top-level view so "back" from a map/detail returns there.
  useEffect(() => {
    if (view.kind === 'catalog' || view.kind === 'mesh') setLastTopView(view.kind);
  }, [view]);

  // state -> hash
  useEffect(() => {
    const target = viewToHash(view);
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [view]);

  // hash -> state
  useEffect(() => {
    const onHash = () => setView(parseHash(window.location.hash));
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

  const openDetail = useCallback((id: string) => setView({ kind: 'detail', id }), []);
  const openMap = useCallback((ids: string[]) => {
    if (ids.length) setView({ kind: 'map', rootIds: ids });
  }, []);
  const reroot = useCallback((id: string) => setView({ kind: 'map', rootIds: [id] }), []);
  const toggleRoot = useCallback((id: string) => {
    setView((v) => {
      if (v.kind !== 'map') return { kind: 'map', rootIds: [id] };
      const has = v.rootIds.includes(id);
      const rootIds = has ? v.rootIds.filter((r) => r !== id) : [...v.rootIds, id];
      return rootIds.length ? { kind: 'map', rootIds } : { kind: 'catalog' };
    });
  }, []);
  const removeRoot = useCallback((id: string) => {
    setView((v) => {
      if (v.kind !== 'map') return v;
      const rootIds = v.rootIds.filter((r) => r !== id);
      return rootIds.length ? { kind: 'map', rootIds } : { kind: 'catalog' };
    });
  }, []);
  const goBack = useCallback(() => setView({ kind: lastTopView }), [lastTopView]);

  const changeTopView = useCallback((v: 'catalog' | 'mesh') => setView({ kind: v }), []);

  const handleQuery = useCallback((q: string) => {
    setQuery(q);
    if (q) setView({ kind: 'catalog' });
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
  const facets = deriveFacets(index.services);

  const detailService = view.kind === 'detail' ? index.byId.get(view.id) : undefined;
  // Only catalogued ids can seed a map.
  const mapRootIds = view.kind === 'map' ? view.rootIds.filter((id) => index.byId.has(id)) : [];

  return (
    <div className="app">
      <div className="observatory-bg" />
      <TopBar
        query={query}
        onQuery={handleQuery}
        view={view.kind === 'mesh' ? 'mesh' : 'catalog'}
        onView={changeTopView}
        serviceCount={index.services.length}
      />

      <main className="app__body">
        {view.kind === 'detail' && detailService ? (
          <ServiceDetailPage
            key={detailService.serviceId}
            service={detailService}
            index={index}
            onBack={goBack}
            onOpenMap={reroot}
            onSelectNode={openDetail}
          />
        ) : view.kind === 'map' && mapRootIds.length > 0 ? (
          <div className="detail" key={mapRootIds.join(',')}>
            <div className="detail__bar">
              <button className="backbtn" onClick={goBack}>
                <ArrowRight width={14} height={14} className="backbtn__ico" />
                <span>{lastTopView === 'mesh' ? 'Mesh' : 'Catalog'}</span>
              </button>
              <span className="detail__crumb mono">
                / {mapRootIds.length === 1 ? mapRootIds[0] : `${mapRootIds.length} roots`}
              </span>
            </div>
            <div className="detail__split">
              {mapRootIds.length === 1 ? (
                <ServiceDetail
                  index={index}
                  service={index.byId.get(mapRootIds[0])!}
                  onSelectNode={reroot}
                  onOpenDetail={openDetail}
                />
              ) : (
                <RootsSidebar
                  index={index}
                  rootIds={mapRootIds}
                  onRemove={removeRoot}
                  onOpenDetail={openDetail}
                />
              )}
              <DependencyMap
                index={index}
                rootIds={mapRootIds}
                onReroot={reroot}
                onToggleRoot={toggleRoot}
              />
            </div>
          </div>
        ) : view.kind === 'mesh' ? (
          <MeshView index={index} onSelectNode={reroot} />
        ) : (
          <CatalogView
            index={index}
            facets={facets}
            query={query}
            filters={filters}
            onToggle={toggle}
            onClear={clearFilters}
            onOpen={openDetail}
            onMapView={reroot}
            onMapSelected={openMap}
          />
        )}
      </main>
    </div>
  );
}
