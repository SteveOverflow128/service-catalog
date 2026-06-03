import type { FlowLink } from './flow';
import type { Interaction } from '../types';

export type ColorScheme = 'criticality' | 'interaction' | 'branch';

const CRIT_HOT = '#FF4D5E';
const CRIT_MUTED = '#54657d';

const INTERACTION_COLORS: Record<string, string> = {
  'sync-http': '#519ee6',
  'async-http': '#6cafe7',
  'async-event': '#4FD6A0',
  s3: '#FFB454',
  sftp: '#c08af0',
  batch: '#8f87e0',
  fdw: '#39c0c8',
  dms: '#e07fb0',
  grpc: '#5bd0e0',
  soap: '#b0884f',
  infrastructure: '#7d8ba1',
};
const INTERACTION_FALLBACK = '#7d8ba1';

const BRANCH_PALETTE = [
  '#519ee6', '#FF9F45', '#4FD6A0', '#8f87e0', '#FF4D5E',
  '#39c0c8', '#FFB454', '#c08af0', '#6cafe7', '#e07fb0',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function linkColor(link: FlowLink, scheme: ColorScheme): string {
  switch (scheme) {
    case 'criticality':
      return link.edge.dep.critical ? CRIT_HOT : CRIT_MUTED;
    case 'interaction':
      return INTERACTION_COLORS[link.edge.dep.interaction as Interaction] ?? INTERACTION_FALLBACK;
    case 'branch':
      return BRANCH_PALETTE[hash(link.branch) % BRANCH_PALETTE.length];
  }
}

export interface LegendItem { label: string; color: string; }

export function legendFor(scheme: ColorScheme): LegendItem[] {
  if (scheme === 'criticality')
    return [{ label: 'critical', color: CRIT_HOT }, { label: 'non-critical', color: CRIT_MUTED }];
  if (scheme === 'interaction')
    return Object.entries(INTERACTION_COLORS).map(([label, color]) => ({ label, color }));
  return [{ label: 'one hue per first-hop branch', color: BRANCH_PALETTE[0] }];
}
