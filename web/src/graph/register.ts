// Single place that wires Cytoscape + layout extensions. Importing this module
// anywhere guarantees the layouts are registered exactly once.
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';

let registered = false;
if (!registered) {
  cytoscape.use(dagre);
  cytoscape.use(fcose);
  registered = true;
}

export default cytoscape;
