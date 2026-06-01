import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { tierStyle } from '../design/tokens';
import { ClassificationBadge, LifecycleBadge, TierBadge, VerifiedBadge } from './Badges';
import { ArrowRight } from './icons';

/** "YYYY-MM-DD" → "MM-DD-YY", or "unknown" when absent/unparseable. */
function fmtUpdated(date?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return 'unknown';
  const [, y, mo, d] = m;
  return `${mo}-${d}-${y.slice(2)}`;
}

export function ServiceCard({
  service,
  index,
  onOpen,
  onMapView,
  style,
}: {
  service: Service;
  index: CatalogIndex;
  onOpen: (id: string) => void;
  onMapView: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const depCount = service.dependencies?.length ?? 0;
  const dependantCount = index.dependantCount(service.serviceId);
  const tier = tierStyle(service.criticalityTier);

  return (
    <div
      className="svc-card"
      style={{ ...style, ['--tier' as string]: tier.color, ['--glow' as string]: tier.glow }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(service.serviceId)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(service.serviceId); }}
    >
      <span className="svc-card__edge" />
      <div className="svc-card__top">
        <TierBadge tier={service.criticalityTier} size="sm" />
        <LifecycleBadge lifecycle={service.lifecycle} />
        <VerifiedBadge verificationDate={service.verificationDate} className="svc-card__verified" />
      </div>

      <h3 className="svc-card__name">{service.name}</h3>
      <code className="svc-card__id mono">{service.serviceId}</code>

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
        <button
          className="svc-card__open"
          onClick={(e) => { e.stopPropagation(); onMapView(service.serviceId); }}
          tabIndex={0}
          aria-label={`View ${service.name} in mesh`}
        >
          map <ArrowRight width={13} height={13} />
        </button>
      </div>
    </div>
  );
}
