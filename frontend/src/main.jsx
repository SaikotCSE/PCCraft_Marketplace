// main.jsx — React 19 entry point.
//
// Renders <App /> into #root with StrictMode on (catches impure
// renders in dev) and imports the global stylesheet (Tailwind v4 +
// design tokens).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import '@/styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
