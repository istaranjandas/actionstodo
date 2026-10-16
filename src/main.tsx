import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'lenis/dist/lenis.css';
import { THEME_KEY } from './modules/store';
import { App } from './App';
import { AdminPage } from './admin/AdminPage';

function applyInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  // Dusk (the obsidian + golden-hour world) is the default; a saved choice still wins
  const activeTheme = savedTheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', activeTheme);
}

applyInitialTheme();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin') ? <AdminPage /> : <App />}
  </StrictMode>
);
