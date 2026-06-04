import { useCallback, useEffect, useState } from 'react';
import { useCatalog } from './data/useCatalog';
import { deriveFacets, type CatalogIndex } from './data/catalog';
import { parseHash, viewToHash, type AppView } from './data/routing';
import { TopBar } from './components/TopBar';
import { CatalogView } from './components/CatalogView';
import { MeshView } from './components/MeshView';
import { ServiceDetail } from './components/ServiceDetail';
import { ServiceDetailPage } from './components/ServiceDetailPage';
import { DependencyMap } from './components/DependencyMap';
import { RootsSidebar } from './components/RootsSidebar';
import { FlowView } from './components/FlowView';
import { emptyFilters, type FilterState } from './components/Filters';
import { ArrowRight } from './components/icons';

function busiestHub(index: CatalogIndex): string {
  let best = index.services[0]?.serviceId ?? '';
  let bestScore = -1;
  for (const s of index.services) {
    const score = index.dependencyCount(s.serviceId) + index.dependantCount(s.serviceId);
    if (score > bestScore) { bestScore = score; best = s.serviceId; }
  }
  return best;
}

export default function App() {
  const state = useCatalog();
  const [view, setView] = useState<AppView>(() => parseHash(window.location.hash));
  const [lastTopView, setLastTopView] = useState<'catalog' | 'mesh' | 'flow'>('catalog');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  // Shared across map/mesh/flow: whether ambient infrastructure nodes are shown.
  // Hidden by default — almost everything links to them, so they otherwise
  // drown out the real topology. Lifting it here makes the choice stick as the
  // user moves between the three graph views.
  const [showInfrastructure, setShowInfrastructure] = useState(false);

  // Remember the last top-level view so "back" from a map/detail returns there.
  useEffect(() => {
    if (view.kind === 'catalog' || view.kind === 'mesh' || view.kind === 'flow') setLastTopView(view.kind);
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
  const toggleInfra = useCallback(() => setShowInfrastructure((v) => !v), []);

  const openDetail = useCallback((id: string) => setView({ kind: 'detail', id }), []);
  const openFlow = useCallback((id: string) => setView({ kind: 'flow', rootId: id }), []);
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
  const goBack = useCallback(
    () => setView(lastTopView === 'flow' ? { kind: 'catalog' } : { kind: lastTopView }),
    [lastTopView],
  );

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

  const { index, indexNoInfra } = state;
  const facets = deriveFacets(index.services);

  const detailService = view.kind === 'detail' ? index.byId.get(view.id) : undefined;
  // Only catalogued ids can seed a map.
  const mapRootIds = view.kind === 'map' ? view.rootIds.filter((id) => index.byId.has(id)) : [];
  // Validated flow root: fall back to busiest hub if the stored id is not in the catalog.
  const flowRootId =
    view.kind === 'flow'
      ? (index.byId.has(view.rootId) ? view.rootId : busiestHub(index))
      : '';

  // The graph the three views traverse: the infra-pruned index unless the user
  // has toggled infrastructure on. Root guard: a map/flow focused on an infra
  // service must use the full index so its own focus node is never pruned away.
  const isInfra = (id: string): boolean => !!index.byId.get(id)?.infrastructure;
  const meshIndex = showInfrastructure ? index : indexNoInfra;
  const mapIndex = showInfrastructure || mapRootIds.some(isInfra) ? index : indexNoInfra;
  const flowIndex = showInfrastructure || isInfra(flowRootId) ? index : indexNoInfra;

  return (
    <div className="app">
      <div className="observatory-bg" />
      <TopBar
        query={query}
        onQuery={handleQuery}
        view={view.kind === 'mesh' ? 'mesh' : view.kind === 'flow' ? 'flow' : 'catalog'}
        onView={(v) =>
          v === 'flow' ? setView({ kind: 'flow', rootId: busiestHub(index) }) : changeTopView(v)
        }
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
            onOpenFlow={openFlow}
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
                  onOpenFlow={openFlow}
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
                index={mapIndex}
                rootIds={mapRootIds}
                onReroot={reroot}
                onToggleRoot={toggleRoot}
                showInfra={showInfrastructure}
                onToggleInfra={toggleInfra}
              />
            </div>
          </div>
        ) : view.kind === 'flow' && flowRootId ? (
          <div className="detail" key={`flow-${flowRootId}`}>
            <div className="detail__bar">
              <button className="backbtn" onClick={goBack}>
                <ArrowRight width={14} height={14} className="backbtn__ico" />
                <span>{lastTopView === 'mesh' ? 'Mesh' : 'Catalog'}</span>
              </button>
              <span className="detail__crumb mono">/ flow / {flowRootId}</span>
            </div>
            <FlowView
              index={flowIndex}
              rootId={flowRootId}
              onReroot={openFlow}
              showInfra={showInfrastructure}
              onToggleInfra={toggleInfra}
            />
          </div>
        ) : view.kind === 'mesh' ? (
          <MeshView
            index={meshIndex}
            onSelectNode={reroot}
            showInfra={showInfrastructure}
            onToggleInfra={toggleInfra}
          />
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
            onFlowView={openFlow}
            onMapSelected={openMap}
          />
        )}
      </main>
    </div>
  );
}
