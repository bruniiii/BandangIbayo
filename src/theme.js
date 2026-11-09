import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────
// Light glass / Dark glass. Everyone starts in Light glass; the choice is
// saved on the device. <html data-theme="light|dark"> drives glass.css.
//   const [theme, setTheme] = useTheme();
// ─────────────────────────────────────────────

const KEY = 'ibayo:theme';
const EVENT = 'ibayo:theme';

export const getTheme = () => {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
};

export const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1A0A00' : '#FDF6EE');
};

export const setTheme = (theme) => {
  try { localStorage.setItem(KEY, theme); } catch { /* not saved on this device */ }
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
};

export const useTheme = () => {
  const [theme, setState] = useState(getTheme);
  useEffect(() => {
    const on = () => setState(getTheme());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return [theme, setTheme];
};
