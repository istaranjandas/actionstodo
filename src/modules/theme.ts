// The one place that knows how the time-of-day theme is stored and read back.
// main.tsx paints the attribute before React mounts; the app then adopts whatever it wrote.
import type { Theme } from '../types';

export const THEME_KEY = 'notion_minimal_theme';

const DEFAULT_THEME: Theme = 'dark';

// Dusk (the obsidian + golden-hour world) is the default; a saved choice still wins
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function readRenderedTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyThemeAttribute(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
