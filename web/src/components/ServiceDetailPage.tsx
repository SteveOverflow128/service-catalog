import { useRef, useMemo, useState, useEffect } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { interactionStyle, tierStyle } from '../design/tokens';
import { ClassificationBadge, LifecycleBadge, TierBadge, VerifiedBadge } from './Badges';
import {
  ArrowRight,
  CheckIcon,
  CloseIcon,
  CloudIcon,
  DatabaseIcon,
  ExternalIcon,
  LayersIcon,
  ShieldIcon,
  WarnIcon,
} from './icons';

/** Today's date as YYYY-MM-DD in local time. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Strip the scanner-injected `_source` field before sending a service back. */
function withoutSource(service: Service): Omit<Service, '_source'> {
  const { _source, ...rest } = service as Service & { _source?: string };
  void _source;
  return rest;
}

// ---- Shared sub-components -----------------------------------------------

function KV({ k, v, mono }: { k: string; v?: React.ReactNode; mono?: boolean }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className={`kv__v${mono ? ' mono' : ''}`}>{v}</span>
    </div>
  );
}

/** Human "12d ago" / "3mo ago" suffix for a YYYY-MM-DD date, or null. */
function relAge(date?: string): string | null {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 60) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** A date with a relative-age suffix, e.g. "2026-05-20 · 12d ago". */
function withAge(date?: string): string | undefined {
  if (!date) return undefined;
  const age = relAge(date);
  return age ? `${date} · ${age}` : date;
}

/** External link for a KV value, or undefined when the URL is absent. */
function extLink(href?: string, label?: string): React.ReactNode | undefined {
  if (!href) return undefined;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {label ?? href.replace(/^https?:\/\//, '')}
    </a>
  );
}

function Section({
  label,
  count,
  icon,
  children,
}: {
  label: string;
  count?: number;
  icon?: React.ReactNode;
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
      className={`deprow${clickable ? '' : ' deprow--ext'}`}
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

// ---- JSON Editor ---------------------------------------------------------

function JsonEditor({ service }: { service: Service }) {
  const clean = useMemo(() => JSON.stringify(withoutSource(service), null, 2), [service]);

  const [text, setText] = useState(clean);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setSchemaErrors([]);
    try {
      JSON.parse(val);
      setSyntaxError(null);
    } catch (err) {
      setSyntaxError((err as Error).message);
    }
  };

  const save = async () => {
    if (syntaxError) return;
    setSaving(true);
    setSchemaErrors([]);
    // Editing a service stamps lastUpdatedDate to today; reflect it in the editor.
    let body = text;
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      obj.lastUpdatedDate = todayISO();
      body = JSON.stringify(obj, null, 2);
      setText(body);
    } catch {
      setSaving(false);
      return; // the syntaxError guard should keep us from reaching here
    }
    try {
      const res = await fetch(`/api/services/${service.serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = (await res.json()) as { ok: boolean; errors?: string[] };
      if (data.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setSchemaErrors(data.errors ?? ['Unknown validation error']);
      }
    } catch {
      setSchemaErrors(['Network error — is the dev server running?']);
    }
    setSaving(false);
  };

  return (
    <div className="json-editor">
      <div className="json-editor__wrap">
        <textarea
          className={`json-editor__ta mono${syntaxError ? ' json-editor__ta--err' : ''}`}
          value={text}
          onChange={handleChange}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        {syntaxError && <p className="json-editor__syntax mono">{syntaxError}</p>}
      </div>
      {schemaErrors.length > 0 && (
        <ul className="json-editor__errors">
          {schemaErrors.map((e, i) => (
            <li key={i} className="mono">{e}</li>
          ))}
        </ul>
      )}
      <div className="json-editor__foot">
        <span className="json-editor__hint overline">
          {saved ? '✓ saved' : syntaxError ? 'fix syntax errors first' : `${text.split('\n').length} lines`}
        </span>
        <button
          className={`btn btn--primary${saved ? ' btn--ok' : ''}`}
          onClick={save}
          disabled={!!syntaxError || saving}
        >
          {saved && <CheckIcon width={14} height={14} />}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Validate & Save'}
        </button>
      </div>
    </div>
  );
}

// ---- Verify (sign-off) dialog --------------------------------------------

/** Captures a userId and stamps verifiedBy + verificationDate (today) onto the
 *  service — WITHOUT touching lastUpdatedDate. Writes via the dev save endpoint;
 *  the resulting data/ change triggers a live reload that refreshes the badge. */
function VerifyDialog({ service, onClose }: { service: Service; onClose: () => void }) {
  const today = todayISO();
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signOff = async () => {
    const uid = userId.trim();
    if (!uid || saving || done) return;
    setSaving(true);
    setErrors(null);
    // Note: lastUpdatedDate is intentionally left as-is — sign-off is an
    // attestation of the existing record, not an edit to it.
    const payload = { ...withoutSource(service), verifiedBy: uid, verificationDate: today };
    try {
      const res = await fetch(`/api/services/${service.serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload, null, 2),
      });
      const data = (await res.json()) as { ok: boolean; errors?: string[] };
      if (data.ok) setDone(true);
      else setErrors(data.errors ?? ['Unknown validation error']);
    } catch {
      setErrors(['Network error — is the dev server running?']);
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="verify-title">
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div>
            <span className="overline">Attestation</span>
            <h3 className="modal__title h-display" id="verify-title">Verify {service.name}</h3>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseIcon width={16} height={16} />
          </button>
        </header>

        <div className="verify-body">
          <label className="verify-field">
            <span className="overline">Your user ID</span>
            <input
              className="verify-input mono"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signOff(); }}
              placeholder="e.g. jdoe"
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={done}
            />
          </label>
          <p className="verify-note">
            Records <code className="mono">verificationDate</code> = <span className="mono">{today}</span> and{' '}
            <code className="mono">verifiedBy</code> = your user ID.{' '}
            <code className="mono">lastUpdatedDate</code> is left unchanged.
          </p>
          {errors && (
            <ul className="json-editor__errors">
              {errors.map((e, i) => (
                <li key={i} className="mono">{e}</li>
              ))}
            </ul>
          )}
        </div>

        <footer className="modal__foot">
          <span className="modal__hint mono">{done ? '✓ signed off' : `verificationDate ← ${today}`}</span>
          <div className="modal__actions">
            <button className="btn" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
            <button
              className={`btn btn--primary${done ? ' btn--ok' : ''}`}
              onClick={signOff}
              disabled={!userId.trim() || saving || done}
            >
              {done && <CheckIcon width={14} height={14} />}
              {done ? 'Signed off' : saving ? 'Signing…' : 'Sign off'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---- Full detail page ----------------------------------------------------

export function ServiceDetailPage({
  service,
  index,
  onBack,
  onOpenMap,
  onSelectNode,
}: {
  service: Service;
  index: CatalogIndex;
  onBack: () => void;
  onOpenMap: (id: string) => void;
  onSelectNode: (id: string) => void;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const jsonRef = useRef<HTMLDivElement>(null);

  const openEditor = () => {
    setJsonOpen(true);
    setTimeout(() => jsonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const deps = service.dependencies ?? [];
  const dependants = index.dependantsOf(service.serviceId);
  const restricted = service.dataClassification === 'RESTRICTED' || service.dataClassification === 'CONFIDENTIAL';
  const phi = service.tags?.phi === 'true';

  return (
    <div className="svc-page">
      {/* ── Bar ── */}
      <div className="detail__bar">
        <button className="backbtn" onClick={onBack}>
          <ArrowRight width={14} height={14} className="backbtn__ico" />
          <span>Catalog</span>
        </button>
        <span className="detail__crumb mono">/ {service.serviceId}</span>
        <div className="svc-page__bar-actions">
          <button className="btn" onClick={() => onOpenMap(service.serviceId)}>
            Map View
            <ArrowRight width={13} height={13} />
          </button>
          <button className="btn" onClick={() => setVerifyOpen(true)}>
            <CheckIcon width={14} height={14} />
            Verify
          </button>
          <button className="btn btn--primary" onClick={openEditor}>
            Edit JSON
          </button>
        </div>
      </div>

      {verifyOpen && <VerifyDialog service={service} onClose={() => setVerifyOpen(false)} />}

      {/* ── Body ── */}
      <div className="svc-page__body scrolly">
        <div className="svc-page__inner">

          {/* Hero */}
          <div className="svc-page__hero">
            <div className="svc-page__badges">
              <TierBadge tier={service.criticalityTier} />
              <LifecycleBadge lifecycle={service.lifecycle} />
              <ClassificationBadge value={service.dataClassification} />
              <VerifiedBadge verificationDate={service.verificationDate} />
            </div>
            <h1 className="svc-page__name h-display">{service.name}</h1>
            <code className="svc-page__id mono">{service.serviceId}</code>
            {service.description && <p className="svc-page__desc">{service.description}</p>}
            {(restricted || phi) && (
              <div className="sensbar">
                <ShieldIcon width={14} height={14} />
                {phi ? 'Handles PHI' : 'Sensitive data'} · {service.dataClassification}
              </div>
            )}
            <div className="svc-page__stats">
              <div className="svc-page__stat">
                <span className="svc-page__stat-n mono">{deps.length}</span>
                <span className="svc-page__stat-l">dependencies</span>
              </div>
              <div className="svc-page__stat svc-page__stat--in">
                <span className="svc-page__stat-n mono">{dependants.length}</span>
                <span className="svc-page__stat-l">dependants</span>
              </div>
              {(service.datastores?.length ?? 0) > 0 && (
                <div className="svc-page__stat">
                  <span className="svc-page__stat-n mono">{service.datastores!.length}</span>
                  <span className="svc-page__stat-l">datastores</span>
                </div>
              )}
              {(service.resources?.length ?? 0) > 0 && (
                <div className="svc-page__stat">
                  <span className="svc-page__stat-n mono">{service.resources!.length}</span>
                  <span className="svc-page__stat-l">resources</span>
                </div>
              )}
            </div>
          </div>

          {/* Two-column metadata */}
          <div className="svc-page__twocol">
            <div>
              <Section label="Ownership">
                <div className="kvgrid">
                  <KV k="Team" v={service.team} />
                  <KV k="Contact" v={<a href={`mailto:${service.teamEmail}`}>{service.teamEmail}</a>} mono />
                  <KV k="Product" v={service.product} />
                  <KV k="Value Stream" v={service.valueStream} />
                  <KV k="Train" v={service.train} />
                  <KV k="Jira Prefix" v={service.jiraPrefix} mono />
                  <KV k="Finance Product" v={service.financeProduct} />
                  <KV k="Catalog Group" v={service.catalogGroup} />
                  <KV k="DR Strategy" v={service.drStrategy} mono />
                  <KV k="Last Updated" v={withAge(service.lastUpdatedDate)} mono />
                  <KV k="Verified By" v={service.verifiedBy} />
                  <KV k="Verified" v={withAge(service.verificationDate)} mono />
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
                </div>
              </Section>
              {service.operational &&
                (service.operational.pagerDutyEscalationPolicyLink ||
                  service.operational.runbookUrl ||
                  service.operational.splunkDashboardURL ||
                  service.operational.newRelicDashboardURL) && (
                  <Section label="Operational">
                    <div className="kvgrid">
                      <KV k="PagerDuty" v={extLink(service.operational.pagerDutyEscalationPolicyLink, 'Escalation policy')} />
                      <KV k="Runbook" v={extLink(service.operational.runbookUrl, 'Runbook')} />
                      <KV k="Splunk" v={extLink(service.operational.splunkDashboardURL, 'Dashboard')} />
                      <KV k="New Relic" v={extLink(service.operational.newRelicDashboardURL, 'Dashboard')} />
                    </div>
                  </Section>
                )}
            </div>

            <div>
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
            </div>
          </div>

          {/* Full-width sections */}
          {service.datastores && service.datastores.length > 0 && (
            <Section label="Datastores" count={service.datastores.length} icon={<DatabaseIcon width={13} height={13} />}>
              <div className="svc-page__cardgrid">
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
              <div className="svc-page__cardgrid">
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
                  <span className="chip mono" key={i} title={f.description}>{f.name}</span>
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

          {/* JSON Editor accordion */}
          <div className="json-accordion" ref={jsonRef}>
            <button
              className={`json-accordion__head${jsonOpen ? ' json-accordion__head--open' : ''}`}
              onClick={() => setJsonOpen((o) => !o)}
            >
              <span className="overline">Edit JSON</span>
              <span className="json-accordion__chev mono">{jsonOpen ? '–' : '+'}</span>
            </button>
            {jsonOpen && (
              <div className="json-accordion__body">
                <JsonEditor service={service} />
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
