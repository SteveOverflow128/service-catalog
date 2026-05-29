import { useMemo } from 'react';
import type { CatalogIndex } from '../data/catalog';
import { buildMeshElements, fcoseLayout } from '../graph/build';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';

export function MeshView({
  index,
  onSelectNode,
}: {
  index: CatalogIndex;
  onSelectNode: (id: string) => void;
}) {
  const elements = useMemo(() => buildMeshElements(index), [index]);

  const handleClick = (id: string) => {
    if (index.byId.has(id)) onSelectNode(id);
  };

  return (
    <div className="mesh">
      <div className="mesh__head">
        <div>
          <span className="overline">Full Service Mesh</span>
          <h2 className="mesh__title h-display">{index.services.length} services · {index.allEdges.length} links</h2>
        </div>
        <p className="mesh__hint">
          Force-directed map of every catalogued service. Hubs grow with connection count — hover to isolate a
          neighborhood, click to open a service.
        </p>
      </div>
      <div className="mesh__canvaswrap">
        <GraphCanvas elements={elements} layout={fcoseLayout} onNodeClick={handleClick} layoutKey="mesh" />
        <Legend />
      </div>
    </div>
  );
}
