import type { CatalogIndex } from '../data/catalog';
import { tierStyle } from '../design/tokens';
import { CloseIcon } from './icons';

/** Left panel for a multi-root map: one removable row per seeding service. */
export function RootsSidebar({
  index,
  rootIds,
  onRemove,
  onOpenDetail,
}: {
  index: CatalogIndex;
  rootIds: string[];
  onRemove: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div className="rootsbar scrolly">
      <div className="rootsbar__head">
        <span className="overline">{rootIds.length} roots</span>
      </div>
      <div className="rootsbar__list">
        {rootIds.map((id) => {
          const svc = index.byId.get(id);
          const name = svc?.name ?? id;
          const color = svc ? tierStyle(svc.criticalityTier).color : 'var(--accent)';
          return (
            <div className="rootrow" key={id}>
              <button
                className="rootrow__open"
                onClick={() => onOpenDetail(id)}
                aria-label={`Open ${name}`}
                title="Open detail page"
              >
                <span className="rootrow__dot" style={{ background: color }} />
                <span className="rootrow__name">{name}</span>
                <code className="rootrow__id mono">{id}</code>
              </button>
              <button
                className="rootrow__rm"
                onClick={() => onRemove(id)}
                aria-label={`Remove ${name}`}
                title="Remove from map"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
