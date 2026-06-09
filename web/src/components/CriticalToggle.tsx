import { BoltIcon } from './icons';
import { GraphToggle } from './GraphToggle';

/**
 * Shared map/mesh/flow control that hides non-critical dependency edges,
 * leaving only the critical-path backbone. Bound to the app-level `criticalOnly`
 * preference (highlighted when the filter is active). Default off — everything
 * shown.
 */
export function CriticalToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <GraphToggle
      on={on}
      onToggle={onToggle}
      icon={<BoltIcon width={15} height={15} />}
      label="Critical only"
      titleOn="Show all dependencies"
      titleOff="Hide non-critical dependencies"
      tone="critical"
    />
  );
}
