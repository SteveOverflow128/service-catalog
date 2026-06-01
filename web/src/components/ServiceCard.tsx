import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { tierStyle } from '../design/tokens';
import { ClassificationBadge, LifecycleBadge, TierBadge } from './Badges';
import { ArrowRight, ShieldIcon } from './icons';

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
  const phi = service.tags?.phi === 'true';
  const sensitive = service.dataClassification === 'RESTRICTED';

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
        {(sensitive || phi) && (
          <span className="svc-card__shield" title={phi ? 'Handles PHI' : 'Restricted data'}>
            <ShieldIcon width={13} height={13} />
          </span>
        )}
      </div>

      <h3 className="svc-card__name">{service.name}</h3>
      <code className="svc-card__id mono">{service.serviceId}</code>

      {service.description && <p className="svc-card__desc">{service.description}</p>}

      <div className="svc-card__foot">
        <div className="svc-card__owner mono">
          <span className="svc-card__team">{service.team}</span>
          {service.product && <span className="svc-card__product">{service.product}</span>}
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
