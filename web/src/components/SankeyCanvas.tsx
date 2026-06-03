import { useMemo, useState } from 'react';
import type { FlowLayout, FlowNode, FlowLink } from '../graph/flow';
import { NODE_W } from '../graph/flow';
import { linkColor, type ColorScheme } from '../graph/flowColor';

interface Props {
  layout: FlowLayout;
  colorScheme: ColorScheme;
  onReroot: (realId: string) => void;
  width?: number;
  height?: number;
}

function bandPath(l: FlowLink, nodeX: (id: string) => number): string {
  const x1 = nodeX(l.source) + NODE_W;
  const x2 = nodeX(l.target);
  const cx = (x1 + x2) / 2;
  return `M${x1},${l.sy0} C${cx},${l.sy0} ${cx},${l.ty0} ${x2},${l.ty0} ` +
         `L${x2},${l.ty1} C${cx},${l.ty1} ${cx},${l.sy1} ${x1},${l.sy1} Z`;
}

export function SankeyCanvas({ layout, colorScheme, onReroot, width = 800, height = 400 }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const xOf = useMemo(() => {
    const m = new Map(layout.nodes.map((n) => [n.id, n.x]));
    return (id: string) => m.get(id) ?? 0;
  }, [layout]);

  // ids connected to the hovered node (for focus-dim)
  const connected = useMemo(() => {
    if (!hover) return null;
    const ids = new Set<string>([hover]);
    for (const l of layout.links) {
      if (l.source === hover) ids.add(l.target);
      if (l.target === hover) ids.add(l.source);
    }
    return ids;
  }, [hover, layout]);

  const dim = (id: string) => (connected && !connected.has(id) ? 0.12 : 1);

  const click = (n: FlowNode) => { if (!n.isExternal) onReroot(n.realId); };

  return (
    <svg className="sankey" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dependency flow">
      <g className="sankey__links">
        {layout.links.map((l, i) => {
          const lit = !connected || connected.has(l.source) || connected.has(l.target);
          return (
            <path
              key={i}
              d={bandPath(l, xOf)}
              fill={linkColor(l, colorScheme)}
              opacity={lit ? (l.isBackEdge ? 0.32 : 0.5) : 0.08}
              strokeDasharray={l.isBackEdge ? '6 4' : undefined}
              stroke={l.isBackEdge ? linkColor(l, colorScheme) : undefined}
              strokeWidth={l.isBackEdge ? 1 : undefined}
            />
          );
        })}
      </g>
      <g className="sankey__nodes">
        {layout.nodes.map((n) => {
          const isLast = n.column === Math.max(...layout.columns.map((c) => c.column));
          const isFirst = n.column === Math.min(...layout.columns.map((c) => c.column));
          const mid = (n.y0 + n.y1) / 2;
          return (
            <g key={n.id} opacity={dim(n.id)}>
              <rect
                data-testid={`flow-node-${n.realId}`}
                x={n.x} y={n.y0} width={NODE_W} height={Math.max(2, n.y1 - n.y0)} rx={2}
                className={`sankey__node${n.isGhost ? ' sankey__node--ghost' : ''}${n.isExternal ? ' sankey__node--ext' : ''}`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => click(n)}
                style={{ cursor: n.isExternal ? 'default' : 'pointer' }}
              >
                <title>{n.label}{n.isGhost ? ' (loop)' : ''} · hop {Math.abs(n.column)}</title>
              </rect>
              <text
                className="sankey__label mono"
                x={isFirst ? n.x - 5 : isLast ? n.x + NODE_W + 5 : n.x + NODE_W / 2}
                y={isFirst || isLast ? mid : n.y0 - 3}
                textAnchor={isFirst ? 'end' : isLast ? 'start' : 'middle'}
                dominantBaseline={isFirst || isLast ? 'middle' : 'auto'}
              >
                {n.label}{n.isGhost ? ' ↺' : ''}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
