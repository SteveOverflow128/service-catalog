import type { FlowLayout, FlowNode } from './flow';

function esc(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Edge-list CSV of the current flow: one row per link. `hop` = target column
 *  distance from the focus (|column|). */
export function flowToCsv(layout: FlowLayout): string {
  const byId = new Map<string, FlowNode>(layout.nodes.map((n) => [n.id, n]));
  const header = 'source,target,interaction,critical,weight,hop';
  const rows = layout.links.map((l) => {
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    return [
      esc(s.realId), esc(t.realId), esc(l.edge.dep.interaction),
      esc(l.edge.dep.critical), esc(l.weight), esc(Math.abs(t.column)),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}
