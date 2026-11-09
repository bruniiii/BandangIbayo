import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme';

// The Light glass / Dark glass switch (top bar, landing nav, public pages).
// floating: a small round button in the top-right corner (login, register…).
const ThemeToggle = ({ floating = false, style }) => {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Switch to light glass' : 'Switch to dark glass';
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={label} title={label}
      className={`theme-toggle${floating ? ' theme-toggle-floating' : ''}`} style={style}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
};

export default ThemeToggle;
