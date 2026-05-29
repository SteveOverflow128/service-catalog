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
