import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'lenis/dist/lenis.css';
import { THEME_KEY } from './modules/store';
import { App } from './App';

function applyInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  let activeTheme = 'light';
  if (savedTheme) {
    activeTheme = savedTheme;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    activeTheme = 'dark';
  }
  document.documentElement.setAttribute('data-theme', activeTheme);
}

applyInitialTheme();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
