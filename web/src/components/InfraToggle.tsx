import { ServerIcon } from './icons';
import { GraphToggle } from './GraphToggle';

/**
 * Shared map/mesh/flow control that includes or excludes ambient infrastructure
 * nodes (logging, mesh, secrets, config, …). Bound to the app-level
 * `showInfrastructure` preference so the choice is consistent across views.
 */
export function InfraToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <GraphToggle
      on={on}
      onToggle={onToggle}
      icon={<ServerIcon width={15} height={15} />}
      label="Infrastructure"
      titleOn="Hide ambient infrastructure nodes"
      titleOff="Show ambient infrastructure nodes"
      tone="infra"
    />
  );
}
