import { classificationStyles, lifecycleStyles, tierStyle } from '../design/tokens';
import type { CriticalityTier, DataClassification, Lifecycle } from '../types';

export function TierBadge({ tier, size = 'md' }: { tier: CriticalityTier; size?: 'sm' | 'md' }) {
  const t = tierStyle(tier);
  return (
    <span
      className={`badge badge--tier ${size === 'sm' ? 'badge--sm' : ''}`}
      style={{ ['--c' as string]: t.color, ['--glow' as string]: t.glow }}
      title={t.label}
    >
      <span className="tier-dot" />
      {t.short}
    </span>
  );
}

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const l = lifecycleStyles[lifecycle] ?? { label: lifecycle, color: '#838795' };
  return (
    <span className="badge badge--lifecycle" style={{ ['--c' as string]: l.color }}>
      <span className="lc-dot" />
      {l.label}
    </span>
  );
}

export function ClassificationBadge({ value }: { value: DataClassification }) {
  const c = classificationStyles[value] ?? {
    label: value,
    color: '#aebfd6',
    bg: 'rgba(120,160,220,0.1)',
  };
  return (
    <span
      className="badge badge--class mono"
      style={{ ['--c' as string]: c.color, ['--bg' as string]: c.bg }}
    >
      {c.label}
    </span>
  );
}

export type VerifyStatus = 'ok' | 'stale' | 'none';

/** Green ('ok') if verified within the last 3 months, yellow ('stale') if
 *  older, red ('none') if there is no verification date on record. */
export function verifyStatus(date?: string): VerifyStatus {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return 'none';
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setMonth(cutoff.getMonth() - 3);
  return then.getTime() >= cutoff.getTime() ? 'ok' : 'stale';
}

/** "Verified" label + red/yellow/green recency dot. `className` lets a host
 *  add positioning (e.g. the catalog card pushes it to the top-right). */
export function VerifiedBadge({
  verificationDate,
  className,
}: {
  verificationDate?: string;
  className?: string;
}) {
  const status = verifyStatus(verificationDate);
  const title =
    status === 'none'
      ? 'No verification on record'
      : status === 'ok'
        ? `Verified ${verificationDate} — within the last 3 months`
        : `Verified ${verificationDate} — over 3 months ago`;
  return (
    <span
      className={`verified verified--${status}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={title}
      title={title}
    >
      Verified
      <span className="verified__dot" aria-hidden="true" />
    </span>
  );
}

export function Chip({
  children,
  tone = 'default',
  onClick,
  active,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'accent';
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      className={`chip ${tone === 'accent' ? 'chip--accent' : ''} ${active ? 'chip--active' : ''} ${
        onClick ? 'chip--btn' : ''
      }`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Comp>
  );
}
