// Single source of truth for how the URL hash maps to what the app shows.
// Pure + framework-free so it can be unit-tested in isolation.

export type AppView =
  | { kind: 'catalog' }
  | { kind: 'mesh' }
  | { kind: 'detail'; id: string }
  | { kind: 'map'; rootIds: string[] }
  | { kind: 'flow'; rootId: string };

/** Parse a `window.location.hash` value into the view it represents.
 *  `#/`              catalog
 *  `#/mesh`          mesh
 *  `#/d/<id>`        full detail page
 *  `#/m/<id,id,…>`   dependency map seeded with one or more roots
 *  `#/s/<id>`        back-compat alias for a single-root map
 *  `#/f/<id>`        focused dependency flow (Sankey) */
export function parseHash(hash: string): AppView {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'mesh') return { kind: 'mesh' };
  if (h.startsWith('d/')) return { kind: 'detail', id: decodeURIComponent(h.slice(2)) };
  if (h.startsWith('m/')) {
    const rootIds = h
      .slice(2)
      .split(',')
      .map((s) => decodeURIComponent(s))
      .filter(Boolean);
    return rootIds.length ? { kind: 'map', rootIds } : { kind: 'catalog' };
  }
  if (h.startsWith('s/')) {
    const id = decodeURIComponent(h.slice(2));
    return id ? { kind: 'map', rootIds: [id] } : { kind: 'catalog' };
  }
  if (h.startsWith('f/')) {
    const rootId = decodeURIComponent(h.slice(2));
    return rootId ? { kind: 'flow', rootId } : { kind: 'catalog' };
  }
  return { kind: 'catalog' };
}

/** Inverse of {@link parseHash} (canonical form; never emits the `#/s/` alias). */
export function viewToHash(view: AppView): string {
  switch (view.kind) {
    case 'mesh':
      return '#/mesh';
    case 'detail':
      return `#/d/${encodeURIComponent(view.id)}`;
    case 'map':
      return `#/m/${view.rootIds.map(encodeURIComponent).join(',')}`;
    case 'flow':
      return `#/f/${encodeURIComponent(view.rootId)}`;
    case 'catalog':
    default:
      return '#/';
  }
}
