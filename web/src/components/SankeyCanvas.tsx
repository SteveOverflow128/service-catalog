import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowLayout, FlowNode, FlowLink } from '../graph/flow';
import { NODE_W } from '../graph/flow';
import { linkColor, type ColorScheme } from '../graph/flowColor';
import { FitIcon, PlusIcon, MinusIcon } from './icons';

interface Props {
  layout: FlowLayout;
  colorScheme: ColorScheme;
  onReroot: (realId: string) => void;
  width?: number;
  height?: number;
}

const MIN_K = 0.4;
const MAX_K = 16;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function bandPath(l: FlowLink, nodeX: (id: string) => number): string {
  const x1 = nodeX(l.source) + NODE_W;
  const x2 = nodeX(l.target);
  const cx = (x1 + x2) / 2;
  return `M${x1},${l.sy0} C${cx},${l.sy0} ${cx},${l.ty0} ${x2},${l.ty0} ` +
         `L${x2},${l.ty1} C${cx},${l.ty1} ${cx},${l.sy1} ${x1},${l.sy1} Z`;
}

export function SankeyCanvas({ layout, colorScheme, onReroot, width = 800, height = 400 }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  // Pan/zoom of the diagram, applied as an SVG transform on the content group.
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

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

  // A drag that moved the pointer should not also reroot on the node it ended on.
  const click = (n: FlowNode) => {
    if (movedRef.current) { movedRef.current = false; return; }
    if (!n.isExternal) onReroot(n.realId);
  };

  // Convert a client (screen) point to viewBox coordinates, accounting for the
  // uniform "meet" scale + centering of the viewBox within the rendered element.
  const clientToVb = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      const s = Math.min(r.width / width, r.height / height) || 1;
      const offX = (r.width - width * s) / 2;
      const offY = (r.height - height * s) / 2;
      return { x: (clientX - r.left - offX) / s, y: (clientY - r.top - offY) / s };
    },
    [width, height],
  );

  // Zoom keeping the world point under (vbX, vbY) fixed on screen.
  const zoomAbout = useCallback((vbX: number, vbY: number, factor: number) => {
    setView((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K);
      const f = k / v.k;
      return { k, x: vbX - (vbX - v.x) * f, y: vbY - (vbY - v.y) * f };
    });
  }, []);

  // Wheel zoom — attached natively so it can be non-passive and preventDefault
  // the page scroll (React's onWheel is passive in some setups).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = clientToVb(e.clientX, e.clientY);
      zoomAbout(p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [clientToVb, zoomAbout]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = panRef.current;
    if (!p) return;
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.min(r.width / width, r.height / height) || 1;
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 3) movedRef.current = true;
    const dx = (e.clientX - p.x) / s;
    const dy = (e.clientY - p.y) / s;
    panRef.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const endPan = (e: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const zoomButton = (factor: number) => zoomAbout(width / 2, height / 2, factor);
  const fit = () => setView({ k: 1, x: 0, y: 0 });

  const maxCol = Math.max(...layout.columns.map((c) => c.column));
  const minCol = Math.min(...layout.columns.map((c) => c.column));

  return (
    <div className="sankey-wrap">
      <svg
        ref={svgRef}
        className="sankey"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Dependency flow"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
      >
        <g data-testid="sankey-viewport" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="sankey__links">
            {layout.links.map((l, i) => {
              const lit = !connected || connected.has(l.source) || connected.has(l.target);
              return (
                <path
                  key={`${l.source}-${l.target}-${i}`}
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
              const isLast = n.column === maxCol;
              const isFirst = n.column === minCol;
              const mid = (n.y0 + n.y1) / 2;
              return (
                <g key={n.id} opacity={dim(n.id)}>
                  <rect
                    data-testid={`flow-node-${n.id}`}
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
        </g>
      </svg>

      <div className="graph-toolbar">
        <button className="tool-btn" onClick={() => zoomButton(1.3)} title="Zoom in" aria-label="Zoom in">
          <PlusIcon />
        </button>
        <button className="tool-btn" onClick={() => zoomButton(1 / 1.3)} title="Zoom out" aria-label="Zoom out">
          <MinusIcon />
        </button>
        <button className="tool-btn" onClick={fit} title="Fit to view" aria-label="Fit to view">
          <FitIcon />
        </button>
      </div>
    </div>
  );
}
