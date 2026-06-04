// Brand-anchored token values exposed to JS (Cytoscape stylesheet, badges).
// Mirrors the CSS custom properties in theme.css. Criticality + status colors
// are brightened from the documented brand semantic tokens for legibility on
// the dark observatory canvas.
// [[ASSUMPTION]] dark-mode tints derived from the brand palette; the design
// system doc lists the extended scales by name but not by hex.

export const palette = {
  navy900: '#061632',
  navy800: '#0B2A60',
  navy700: '#103E8E',
  blue600: '#1552BC',
  blue500: '#1B74CB',
  blue400: '#519EE6',
  blue300: '#6CAFE7',
  blue100: '#BBD5EA',
  ink: '#0A0B0F',
  ink800: '#16171D',
  slate700: '#292B32',
  slate600: '#393B46',
  slate500: '#454754',
  slate400: '#5E616E',
  slate300: '#838795',
  mist: '#C4C8D2',
  paperGrid: '#F3F5F7',
  white: '#ffffff',
} as const;

export interface TierStyle {
  label: string;
  short: string;
  color: string;
  glow: string;
}

// criticalityTier 0 = most critical, descending. '?'/unknown = unscored.
export const tierStyles: Record<string, TierStyle> = {
  '0': { label: 'Tier 0 · Mission Critical', short: 'T0', color: '#FF4D5E', glow: 'rgba(255,77,94,0.55)' },
  '1': { label: 'Tier 1 · Critical', short: 'T1', color: '#FF9F45', glow: 'rgba(255,159,69,0.5)' },
  '2': { label: 'Tier 2 · Important', short: 'T2', color: '#519EE6', glow: 'rgba(81,158,230,0.5)' },
  '3': { label: 'Tier 3 · Standard', short: 'T3', color: '#4FD6A0', glow: 'rgba(79,214,160,0.45)' },
  '?': { label: 'Unscored', short: '?', color: '#838795', glow: 'rgba(131,135,149,0.4)' },
  unknown: { label: 'Unscored', short: '?', color: '#838795', glow: 'rgba(131,135,149,0.4)' },
};

export function tierStyle(tier: string | number): TierStyle {
  return tierStyles[String(tier)] ?? tierStyles['?'];
}

export const lifecycleStyles: Record<string, { label: string; color: string }> = {
  prod: { label: 'Production', color: '#4FD6A0' },
  'non-prod': { label: 'Non-Prod', color: '#519EE6' },
  experimental: { label: 'Experimental', color: '#FF9F45' },
  sunset: { label: 'Sunset', color: '#FF4D5E' },
};

export const classificationStyles: Record<string, { label: string; color: string; bg: string }> = {
  RESTRICTED: { label: 'RESTRICTED', color: '#FF6B79', bg: 'rgba(255,77,94,0.12)' },
  CONFIDENTIAL: { label: 'CONFIDENTIAL', color: '#FFB463', bg: 'rgba(255,159,69,0.12)' },
  INTERNAL: { label: 'INTERNAL', color: '#7FBCF0', bg: 'rgba(81,158,230,0.12)' },
  PUBLIC: { label: 'PUBLIC', color: '#79E3BE', bg: 'rgba(79,214,160,0.12)' },
};

// Edge appearance per interaction protocol. Dash patterns differentiate sync /
// async / data-movement at a glance; color carries criticality separately.
export const interactionStyles: Record<string, { label: string; dash: number[] }> = {
  'sync-http': { label: 'Sync HTTP', dash: [] },
  'async-http': { label: 'Async HTTP', dash: [6, 4] },
  'async-event': { label: 'Async Event', dash: [2, 5] },
  grpc: { label: 'gRPC', dash: [] },
  soap: { label: 'SOAP', dash: [8, 4] },
  sftp: { label: 'SFTP', dash: [10, 6] },
  batch: { label: 'Batch', dash: [10, 6] },
  fdw: { label: 'FDW', dash: [1, 4] },
  dms: { label: 'DMS', dash: [1, 4] },
  s3: { label: 'S3', dash: [12, 5] },
  infrastructure: { label: 'Infrastructure', dash: [3, 3] },
};

export function interactionStyle(i: string): { label: string; dash: number[] } {
  return interactionStyles[i] ?? { label: i, dash: [4, 4] };
}

export const edgeColors = {
  critical: '#FF6B79',
  criticalGlow: 'rgba(255,77,94,0.45)',
  normal: '#3E6FA8',
  external: '#9F7BD6',
  dim: 'rgba(120,150,190,0.18)',
} as const;

// Ambient infrastructure layer. Mirrors --infra in theme.css; used by the infra
// badge and the distinct infra node treatment in the graph stylesheet.
export const infraColor = '#5FB3C6';
