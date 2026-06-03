import { useEffect, useRef } from 'react';
import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape';
import cytoscape from '../graph/register';
import { cyStylesheet } from '../graph/style';
import { FitIcon, MinusIcon, PlusIcon } from './icons';

interface Props {
  elements: ElementDefinition[];
  layout: () => LayoutOptions;
  onNodeClick?: (id: string, ev: MouseEvent) => void;
  onNodeHover?: (id: string | null) => void;
  /** bump to force a re-layout/re-fit without changing elements */
  layoutKey?: string;
}

export function GraphCanvas({ elements, layout, onNodeClick, onNodeHover, layoutKey }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const clickRef = useRef(onNodeClick);
  const hoverRef = useRef(onNodeHover);
  clickRef.current = onNodeClick;
  hoverRef.current = onNodeHover;

  // Create once.
  useEffect(() => {
    if (!boxRef.current) return;
    const cy = cytoscape({
      container: boxRef.current,
      style: cyStylesheet,
      elements: [],
      wheelSensitivity: 0.22,
      minZoom: 0.12,
      maxZoom: 3.5,
      pixelRatio: window.devicePixelRatio || 1,
    });
    cyRef.current = cy;

    cy.on('mouseover', 'node', (evt) => {
      const n = evt.target;
      const hood = n.closedNeighborhood();
      cy.batch(() => {
        cy.elements().addClass('focusdim');
        hood.removeClass('focusdim');
        hood.addClass('neighbor');
      });
      hoverRef.current?.(n.id());
      if (boxRef.current) boxRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      cy.batch(() => cy.elements().removeClass('focusdim neighbor'));
      hoverRef.current?.(null);
      if (boxRef.current) boxRef.current.style.cursor = 'grab';
    });
    cy.on('tap', 'node', (evt) => clickRef.current?.(evt.target.id(), evt.originalEvent as MouseEvent));

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements + run layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    const l = cy.layout(layout());
    l.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, layoutKey]);

  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };
  const fit = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 48 } }, { duration: 280 });

  return (
    <div className="graph-canvas">
      <div ref={boxRef} className="graph-canvas__cy" />
      <div className="graph-toolbar">
        <button className="tool-btn" onClick={() => zoomBy(1.3)} title="Zoom in" aria-label="Zoom in">
          <PlusIcon />
        </button>
        <button className="tool-btn" onClick={() => zoomBy(1 / 1.3)} title="Zoom out" aria-label="Zoom out">
          <MinusIcon />
        </button>
        <button className="tool-btn" onClick={fit} title="Fit to view" aria-label="Fit to view">
          <FitIcon />
        </button>
      </div>
    </div>
  );
}
