import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'lenis/dist/lenis.css';
import { applyThemeAttribute, readStoredTheme } from './modules/theme';
import { App } from './App';
import { AdminPage } from './admin/AdminPage';

// Paint the saved theme before React mounts so the valley never flashes the wrong hour
applyThemeAttribute(readStoredTheme());

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Mount point #root is missing from index.html');

createRoot(rootElement).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin') ? <AdminPage /> : <App />}
  </StrictMode>
);
