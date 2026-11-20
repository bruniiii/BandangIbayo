import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────
// LIGHT / DARK MODE for the whole site
// The visitor's choice is saved on this device; until they pick one, the
// site follows their phone or computer's setting. The mode is the
// data-theme attribute on <html> (index.html sets it before the page draws;
// the colours are in index.css under :root[data-theme="dark"]).
// ─────────────────────────────────────────────

const KEY = 'ibayo:theme';
const listeners = new Set();
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null;

const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const current = () => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

const apply = (theme) => {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#071C26' : '#0B3B4F');
  listeners.forEach((l) => l());
};

// Follow the device while the visitor hasn't picked a mode.
media?.addEventListener?.('change', (e) => { if (!saved()) apply(e.matches ? 'dark' : 'light'); });

export const setTheme = (theme) => {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  apply(theme);
};
export const toggleTheme = () => setTheme(current() === 'dark' ? 'light' : 'dark');

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
// 'light' or 'dark', updating when it changes.
export const useTheme = () => useSyncExternalStore(subscribe, current, () => 'light');
