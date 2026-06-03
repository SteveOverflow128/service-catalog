import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { interactionStyle, tierStyle } from '../design/tokens';
import { ClassificationBadge, LifecycleBadge, TierBadge, VerifiedBadge } from './Badges';
import {
  ArrowRight,
  CloudIcon,
  DatabaseIcon,
  ExternalIcon,
  FlowIcon,
  LayersIcon,
  ShieldIcon,
  WarnIcon,
} from './icons';

function Section({
  label,
  icon,
  children,
  count,
}: {
  label: string;
  icon?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="metablock">
      <header className="metablock__head">
        {icon}
        <span className="overline">{label}</span>
        {count !== undefined && <span className="metablock__count mono">{count}</span>}
      </header>
      {children}
    </section>
  );
}

function KV({ k, v, mono }: { k: string; v?: React.ReactNode; mono?: boolean }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className={`kv__v ${mono ? 'mono' : ''}`}>{v}</span>
    </div>
  );
}

function DepRow({
  index,
  targetId,
  interaction,
  critical,
  external,
  purpose,
  direction,
  onSelect,
}: {
  index: CatalogIndex;
  targetId: string;
  interaction: string;
  critical: boolean;
  external: boolean;
  purpose?: string;
  direction: 'out' | 'in';
  onSelect: (id: string) => void;
}) {
  const svc = index.byId.get(targetId);
  const label = svc?.name ?? index.externals.get(targetId)?.name ?? targetId;
  const tier = svc ? tierStyle(svc.criticalityTier) : null;
  const clickable = !!svc;
  return (
    <button
      className={`deprow ${clickable ? '' : 'deprow--ext'}`}
      onClick={() => clickable && onSelect(targetId)}
      disabled={!clickable}
      title={purpose}
    >
      <span className="deprow__dir mono">{direction === 'out' ? '→' : '←'}</span>
      <span className="deprow__dot" style={{ background: tier ? tier.color : 'var(--accent)' }} />
      <span className="deprow__name">
        {label}
        {external && <ExternalIcon width={12} height={12} className="deprow__extico" />}
      </span>
      <span className="deprow__interaction mono">{interactionStyle(interaction).label}</span>
      {critical && <span className="deprow__crit mono">CRIT</span>}
      {clickable && <ArrowRight width={13} height={13} className="deprow__go" />}
    </button>
  );
}

export function ServiceDetail({
  index,
  service,
  onSelectNode,
  onOpenDetail,
  onOpenFlow,
}: {
  index: CatalogIndex;
  service: Service;
  onSelectNode: (id: string) => void;
  onOpenDetail?: (id: string) => void;
  onOpenFlow?: (id: string) => void;
}) {
  const deps = service.dependencies ?? [];
  const dependants = index.dependantsOf(service.serviceId);
  const restricted = service.dataClassification === 'RESTRICTED' || service.dataClassification === 'CONFIDENTIAL';
  const phi = service.tags?.phi === 'true';

  return (
    <div className="detail-panel scrolly">
      <div className="detail-panel__hero">
        <div className="detail-panel__badges">
          <TierBadge tier={service.criticalityTier} />
          <LifecycleBadge lifecycle={service.lifecycle} />
          <ClassificationBadge value={service.dataClassification} />
          <VerifiedBadge verificationDate={service.verificationDate} />
        </div>
        <h1 className="detail-panel__name h-display">{service.name}</h1>
        <code
          className={`detail-panel__id mono${onOpenDetail ? ' detail-panel__id--link' : ''}`}
          onClick={() => onOpenDetail?.(service.serviceId)}
          title={onOpenDetail ? 'Open full detail page' : undefined}
        >
          {service.serviceId}
        </code>
        {service.description && <p className="detail-panel__desc">{service.description}</p>}

        {(restricted || phi) && (
          <div className="sensbar">
            <ShieldIcon width={14} height={14} />
            {phi ? 'Handles PHI' : 'Sensitive data'} · {service.dataClassification}
          </div>
        )}

        <div className="detail-panel__counts">
          <div className="countbox">
            <span className="countbox__n mono">{deps.length}</span>
            <span className="countbox__l">dependencies</span>
          </div>
          <div className="countbox countbox--in">
            <span className="countbox__n mono">{dependants.length}</span>
            <span className="countbox__l">dependants</span>
          </div>
        </div>

        {onOpenFlow && (
          <button
            className="svc-card__open"
            onClick={() => onOpenFlow(service.serviceId)}
            aria-label={`View ${service.name} flow`}
          >
            <FlowIcon width={13} height={13} /> flow
          </button>
        )}
      </div>

      <Section label="Ownership">
        <div className="kvgrid">
          <KV k="Team" v={service.team} />
          <KV k="Contact" v={<a href={`mailto:${service.teamEmail}`}>{service.teamEmail}</a>} mono />
          <KV k="Product" v={service.product} />
          <KV k="Value Stream" v={service.valueStream} />
          <KV k="Train" v={service.train} />
          <KV k="Finance Product" v={service.financeProduct} />
          <KV k="Catalog Group" v={service.catalogGroup} />
          <KV k="DR Strategy" v={service.drStrategy} mono />
        </div>
      </Section>

      <Section label="Runtime">
        <div className="kvgrid">
          <KV k="Runtime" v={service.runtime} mono />
          <KV k="Framework" v={service.softwareFramework} mono />
          <KV
            k="Repository"
            v={
              service.repository ? (
                <a href={service.repository} target="_blank" rel="noreferrer">
                  {service.repository.replace(/^https?:\/\//, '')}
                </a>
              ) : undefined
            }
            mono
          />
          <KV
            k="Provisioner Repo"
            v={
              service.provisionerRepoURL ? (
                <a href={service.provisionerRepoURL} target="_blank" rel="noreferrer">
                  {service.provisionerRepoURL.replace(/^https?:\/\//, '')}
                </a>
              ) : undefined
            }
            mono
          />
        </div>
      </Section>

      {deps.length > 0 && (
        <Section label="Depends on" count={deps.length} icon={<ArrowRight width={13} height={13} />}>
          <div className="deplist">
            {deps.map((d, i) => (
              <DepRow
                key={`${d.serviceId}-${i}`}
                index={index}
                targetId={d.serviceId}
                interaction={d.interaction}
                critical={d.critical}
                external={d.external}
                purpose={d.purpose}
                direction="out"
                onSelect={onSelectNode}
              />
            ))}
          </div>
        </Section>
      )}

      {dependants.length > 0 && (
        <Section label="Depended on by" count={dependants.length}>
          <div className="deplist">
            {dependants.map((e, i) => (
              <DepRow
                key={`${e.from}-${i}`}
                index={index}
                targetId={e.from}
                interaction={e.dep.interaction}
                critical={e.dep.critical}
                external={false}
                purpose={e.dep.purpose}
                direction="in"
                onSelect={onSelectNode}
              />
            ))}
          </div>
        </Section>
      )}

      {service.datastores && service.datastores.length > 0 && (
        <Section label="Datastores" count={service.datastores.length} icon={<DatabaseIcon width={13} height={13} />}>
          <div className="cardlist">
            {service.datastores.map((d, i) => (
              <div className="ministore" key={i}>
                <div className="ministore__top">
                  <span className="mono ministore__name">{d.name}</span>
                  <span className="tag tag--type mono">{d.type}</span>
                </div>
                <div className="ministore__meta mono">
                  {d.engine && <span>{d.engine}{d.version ? ` ${d.version}` : ''}</span>}
                  <span>retain {d.retention}</span>
                  {d.critical && <span className="tag tag--crit">critical</span>}
                  {d.restrictedData && (
                    <span className="tag tag--restricted">
                      <WarnIcon width={11} height={11} /> restricted
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {service.resources && service.resources.length > 0 && (
        <Section label="Resources" count={service.resources.length} icon={<CloudIcon width={13} height={13} />}>
          <div className="cardlist">
            {service.resources.map((r, i) => (
              <div className="ministore" key={i}>
                <div className="ministore__top">
                  <span className="mono ministore__name">{r.type}</span>
                  {r.provider && <span className="tag tag--type mono">{r.provider}</span>}
                  {r.region && <span className="tag tag--type mono">{r.region}</span>}
                  {r.drStrategy && <span className="tag tag--type mono">{r.drStrategy}</span>}
                </div>
                <div className="ministore__meta">{r.purpose}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {service.features && service.features.length > 0 && (
        <Section label="Features" count={service.features.length} icon={<LayersIcon width={13} height={13} />}>
          <div className="chiprow">
            {service.features.map((f, i) => (
              <span className="chip mono" key={i} title={f.description}>
                {f.name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {service.tags && Object.keys(service.tags).length > 0 && (
        <Section label="Tags">
          <div className="chiprow">
            {Object.entries(service.tags).map(([k, v]) => (
              <span className="chip chip--tag mono" key={k}>
                <span className="chip__k">{k}</span>
                {v}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
