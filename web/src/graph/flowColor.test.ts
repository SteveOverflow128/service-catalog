import { describe, it, expect } from 'vitest';
import { linkColor, legendFor, type ColorScheme } from './flowColor';
import type { FlowLink } from './flow';
import type { Edge } from '../types';

function mkLink(partial: Partial<Edge['dep']> & { branch?: string }): FlowLink {
  const dep = { serviceId: 'x', interaction: 'sync-http', critical: false, purpose: '', external: false, ...partial } as Edge['dep'];
  return {
    source: 's', target: 't', edge: { from: 's', to: 't', dep },
    weight: 1, branch: partial.branch ?? 'b', isBackEdge: false,
    sy0: 0, sy1: 0, ty0: 0, ty1: 0,
  };
}

describe('linkColor', () => {
  it('criticality: critical links are hot, others muted', () => {
    const crit = linkColor(mkLink({ critical: true }), 'criticality');
    const noncrit = linkColor(mkLink({ critical: false }), 'criticality');
    expect(crit).not.toBe(noncrit);
  });

  it('interaction: distinct colors per interaction type', () => {
    const sync = linkColor(mkLink({ interaction: 'sync-http' }), 'interaction');
    const async = linkColor(mkLink({ interaction: 'async-event' }), 'interaction');
    expect(sync).not.toBe(async);
  });

  it('branch: same branch → same color, different branch → different', () => {
    const b1 = linkColor(mkLink({ branch: 'alpha' }), 'branch');
    const b1b = linkColor(mkLink({ branch: 'alpha' }), 'branch');
    const b2 = linkColor(mkLink({ branch: 'beta' }), 'branch');
    expect(b1).toBe(b1b);
    expect(b1).not.toBe(b2);
  });

  it('legendFor returns labelled swatches for each scheme', () => {
    (['criticality', 'interaction', 'branch'] as ColorScheme[]).forEach((s) => {
      expect(legendFor(s).length).toBeGreaterThan(0);
    });
  });
});
