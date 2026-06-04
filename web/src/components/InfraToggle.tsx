import { ServerIcon } from './icons';

/**
 * Shared map/mesh/flow control that includes or excludes ambient infrastructure
 * nodes (logging, mesh, secrets, config, …). Bound to the app-level
 * `showInfrastructure` preference so the choice is consistent across the three
 * graph views.
 */
export function InfraToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`infratoggle${on ? ' infratoggle--on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      title={on ? 'Hide ambient infrastructure nodes' : 'Show ambient infrastructure nodes'}
    >
      <ServerIcon width={15} height={15} />
      <span>Infrastructure</span>
    </button>
  );
}
