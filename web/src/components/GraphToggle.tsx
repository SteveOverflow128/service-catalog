import type { ReactNode } from 'react';

/**
 * Generic include/exclude pill shared by the graph views (Infrastructure,
 * Critical-only). `on` drives the highlighted/pressed state; `tone` selects the
 * accent color of the highlighted state.
 */
export function GraphToggle({
  on,
  onToggle,
  icon,
  label,
  titleOn,
  titleOff,
  tone,
}: {
  on: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
  /** hover hint shown when `on` (the toggle is active) */
  titleOn: string;
  /** hover hint shown when `off` */
  titleOff: string;
  tone: 'infra' | 'critical';
}) {
  return (
    <button
      type="button"
      className={`graphtoggle graphtoggle--${tone}${on ? ' graphtoggle--on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      title={on ? titleOn : titleOff}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
