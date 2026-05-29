import { createRoot } from 'react-dom/client';

// Bundled fonts (offline-capable — healthcare infra is frequently air-gapped).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './theme.css';
import './app.css';
import App from './App';

// Note: React.StrictMode intentionally omitted — its dev double-invoke
// double-initialises the Cytoscape instance, which fights the layout engine.
createRoot(document.getElementById('root')!).render(<App />);
