import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { tierStyle } from '../design/tokens';
import { ClassificationBadge, LifecycleBadge, TierBadge, VerifiedBadge } from './Badges';
import { ArrowRight, FlowIcon } from './icons';

/** Normalize to "YYYY-MM-DD", or "unknown" when absent/unparseable. */
function fmtUpdated(date?: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(date ?? '');
  return m ? m[1] : 'unknown';
}

export function ServiceCard({
  service,
  index,
  onOpen,
  onMapView,
  onFlowView,
  style,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  service: Service;
  index: CatalogIndex;
  onOpen: (id: string) => void;
  onMapView: (id: string) => void;
  onFlowView: (id: string) => void;
  style?: React.CSSProperties;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const depCount = service.dependencies?.length ?? 0;
  const dependantCount = index.dependantCount(service.serviceId);
  const tier = tierStyle(service.criticalityTier);

  // In select mode the whole card toggles selection; otherwise it opens detail.
  const primary = () => (selectMode ? onToggleSelect?.(service.serviceId) : onOpen(service.serviceId));

  return (
    <div
      className={`svc-card${selectMode ? ' svc-card--select' : ''}${selected ? ' svc-card--selected' : ''}`}
      style={{ ...style, ['--tier' as string]: tier.color, ['--glow' as string]: tier.glow }}
      role="button"
      tabIndex={0}
      onClick={primary}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') primary(); }}
    >
      <span className="svc-card__edge" />
      {selectMode && (
        <span
          className={`svc-card__check${selected ? ' svc-card__check--on' : ''}`}
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${service.name}`}
        />
      )}
      <div className="svc-card__top">
        <TierBadge tier={service.criticalityTier} size="sm" />
        <LifecycleBadge lifecycle={service.lifecycle} />
        <VerifiedBadge verificationDate={service.verificationDate} className="svc-card__verified" />
      </div>

      <h3 className="svc-card__name">{service.name}</h3>
      <code
        className={`svc-card__id mono${selectMode ? ' svc-card__id--link' : ''}`}
        onClick={selectMode ? (e) => { e.stopPropagation(); onOpen(service.serviceId); } : undefined}
        title={selectMode ? 'Open detail page' : undefined}
      >
        {service.serviceId}
      </code>

      {service.description && <p className="svc-card__desc">{service.description}</p>}

      <div className="svc-card__foot">
        <div className="svc-card__owner mono">
          <span className="svc-card__team">{service.team}</span>
          <span className="svc-card__product">Updated: {fmtUpdated(service.lastUpdatedDate)}</span>
        </div>
        <ClassificationBadge value={service.dataClassification} />
      </div>

      <div className="svc-card__stats">
        <span className="depstat">
          <b className="mono">{depCount}</b> deps
        </span>
        <span className="depstat depstat--in">
          <b className="mono">{dependantCount}</b> dependants
        </span>
        {!selectMode && (
          <>
            <button
              className="svc-card__open"
              onClick={(e) => { e.stopPropagation(); onMapView(service.serviceId); }}
              tabIndex={0}
              aria-label={`View ${service.name} in mesh`}
            >
              map <ArrowRight width={13} height={13} />
            </button>
            <button
              className="svc-card__open"
              onClick={(e) => { e.stopPropagation(); onFlowView(service.serviceId); }}
              tabIndex={0}
              aria-label={`View ${service.name} flow`}
            >
              <FlowIcon width={13} height={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
