import type { StylesheetStyle } from 'cytoscape';
import { edgeColors } from '../design/tokens';

// Cytoscape stylesheet for the dependency map. Nodes are tier-colored discs
// (external systems are dashed diamonds); the focal node carries a glowing
// underlay. Edges encode criticality via color/weight and protocol via dash.
//
// Style bodies are cast to `any`: Cytoscape accepts data() mapper strings and
// extended visual props (underlay-*, line-dash-pattern) that the published
// @types/cytoscape Css interfaces don't fully model.
const rule = (selector: string, style: Record<string, unknown>): StylesheetStyle => ({
  selector,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: style as any,
});

export const cyStylesheet: StylesheetStyle[] = [
  rule('node', {
    width: 'data(size)',
    height: 'data(size)',
    'background-color': 'data(color)',
    'background-opacity': 0.16,
    'border-width': 1.5,
    'border-color': 'data(color)',
    'border-opacity': 0.95,
    label: 'data(label)',
    color: '#cfe0f5',
    'font-family': 'IBM Plex Mono, monospace',
    'font-size': 9,
    'font-weight': 500,
    'text-valign': 'bottom',
    'text-halign': 'center',
    'text-margin-y': 6,
    'text-wrap': 'wrap',
    'text-max-width': '120px',
    'min-zoomed-font-size': 7,
    'transition-property': 'opacity, border-width, background-opacity',
    'transition-duration': 180,
  }),
  rule('node[kind="external"]', {
    shape: 'round-diamond',
    'border-style': 'dashed',
    'background-color': edgeColors.external,
    'border-color': edgeColors.external,
    color: '#d9c8f4',
  }),
  rule('node[?isRoot]', {
    'background-opacity': 0.28,
    'border-width': 2.5,
    'underlay-color': '#519ee6',
    'underlay-opacity': 0.35,
    'underlay-padding': 12,
    color: '#ffffff',
    'font-size': 12,
    'font-weight': 600,
    'z-index': 50,
  }),
  rule('node.focusdim', { opacity: 0.12 }),
  rule('node.neighbor', { 'border-width': 2.5, 'background-opacity': 0.3 }),
  rule('edge', {
    'curve-style': 'bezier',
    width: 'data(width)',
    'line-color': 'data(color)',
    'line-style': 'data(lineStyle)',
    'line-dash-pattern': 'data(dash)',
    opacity: 'data(opacity)',
    'target-arrow-shape': 'triangle',
    'target-arrow-color': 'data(color)',
    'arrow-scale': 0.85,
    'transition-property': 'opacity, width',
    'transition-duration': 180,
  }),
  rule('edge[?critical]', {
    'underlay-color': edgeColors.critical,
    'underlay-opacity': 0.18,
    'underlay-padding': 2.5,
    'z-index': 20,
  }),
  rule('edge.focusdim', { opacity: 0.05 }),
  rule('edge.neighbor', { opacity: 1, width: 'data(hlWidth)' }),
];
