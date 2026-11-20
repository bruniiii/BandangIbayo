import { Sun, Moon } from 'lucide-react';
import { useTheme, toggleTheme } from '../theme';

// The sun / moon button that switches the site between light and dark.
// Without a className it looks like the notification bell next to it (the
// dashboards' top bars); className / style let a page style it itself.
const BAR_BUTTON = {
  width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  background: 'var(--ib-parch, #F2E4D0)', border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.18)', color: 'var(--ib-dark, #1A0A00)',
};

const ThemeToggle = ({ className, style, size = 17 }) => {
  const dark = useTheme() === 'dark';
  return (
    <button type="button" className={className} onClick={toggleTheme} aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'} style={className ? style : { ...BAR_BUTTON, ...style }}>
      {dark ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
};

export default ThemeToggle;
