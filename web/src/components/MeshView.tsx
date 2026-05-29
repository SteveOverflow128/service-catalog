import { useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import { buildMeshElements, fcoseLayout } from '../graph/build';
import { toMermaid } from '../graph/mermaid';
import { GraphCanvas } from './GraphCanvas';
import { Legend } from './Legend';
import { MermaidExport } from './MermaidExport';
import { CodeIcon } from './icons';

export function MeshView({
  index,
  onSelectNode,
}: {
  index: CatalogIndex;
  onSelectNode: (id: string) => void;
}) {
  const elements = useMemo(() => buildMeshElements(index), [index]);
  const [exporting, setExporting] = useState(false);

  const handleClick = (id: string) => {
    if (index.byId.has(id)) onSelectNode(id);
  };

  const allNodeIds = () => {
    const ids = new Set<string>();
    for (const s of index.services) ids.add(s.serviceId);
    for (const id of index.externals.keys()) ids.add(id);
    return ids;
  };

  return (
    <div className="mesh">
      <div className="mesh__head">
        <div>
          <span className="overline">Full Service Mesh</span>
          <h2 className="mesh__title h-display">
            {index.services.length} services · {index.allEdges.length} links
          </h2>
        </div>
        <div className="mesh__headright">
          <p className="mesh__hint">
            Force-directed map of every catalogued service. Hubs grow with connection count — hover to isolate a
            neighborhood, click to open a service.
          </p>
          <button className="exportbtn" onClick={() => setExporting(true)} title="Export the full mesh as a Mermaid diagram">
            <CodeIcon width={15} height={15} />
            <span>Mermaid</span>
          </button>
        </div>
      </div>
      <div className="mesh__canvaswrap">
        <GraphCanvas elements={elements} layout={fcoseLayout} onNodeClick={handleClick} layoutKey="mesh" />
        <Legend />
      </div>

      {exporting && (
        <MermaidExport
          title="Full service mesh"
          filename="service-mesh.mmd"
          code={toMermaid(index, allNodeIds(), index.allEdges, { title: 'Full service mesh', direction: 'LR' })}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  );
}
