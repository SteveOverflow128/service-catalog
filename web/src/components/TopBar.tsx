import { FlowIcon, GraphIcon, ListIcon, SearchIcon } from './icons';

export type View = 'catalog' | 'mesh' | 'flow';

export function TopBar({
  query,
  onQuery,
  view,
  onView,
  serviceCount,
}: {
  query: string;
  onQuery: (q: string) => void;
  view: View;
  onView: (v: View) => void;
  serviceCount: number;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__glyph" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="4.2" fill="#519ee6" />
            <circle cx="5" cy="7" r="2" fill="#6cafe7" />
            <circle cx="27" cy="9" r="2" fill="#FF9F45" />
            <circle cx="7" cy="26" r="2" fill="#4FD6A0" />
            <circle cx="26" cy="25" r="2" fill="#FF4D5E" />
            <path
              d="M16 16 5 7M16 16 27 9M16 16 7 26M16 16 26 25"
              stroke="#3E6FA8"
              strokeWidth="1.1"
              opacity="0.8"
            />
          </svg>
        </span>
        <div className="brand__text">
          <span className="brand__name">Service Observatory</span>
          <span className="brand__sub overline">Internal Service Catalog</span>
        </div>
      </div>

      <label className="search">
        <SearchIcon className="search__icon" width={17} height={17} />
        <input
          className="search__input"
          type="search"
          placeholder="Search services, teams, features, tags…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          spellCheck={false}
          aria-label="Search services"
        />
        {query && (
          <button className="search__clear" onClick={() => onQuery('')} aria-label="Clear search">
            esc
          </button>
        )}
      </label>

      <nav className="views" aria-label="View">
        <button
          className={`viewtab ${view === 'catalog' ? 'viewtab--on' : ''}`}
          onClick={() => onView('catalog')}
        >
          <ListIcon width={15} height={15} />
          Catalog
        </button>
        <button className={`viewtab ${view === 'mesh' ? 'viewtab--on' : ''}`} onClick={() => onView('mesh')}>
          <GraphIcon width={15} height={15} />
          Mesh
        </button>
        <button
          className={`viewtab ${view === 'flow' ? 'viewtab--on' : ''}`}
          onClick={() => onView('flow')}
        >
          <FlowIcon width={15} height={15} />
          Flow
        </button>
        <span className="views__count mono" title="services catalogued">
          {serviceCount}
        </span>
      </nav>
    </header>
  );
}
