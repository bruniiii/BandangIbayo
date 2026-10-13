// ─────────────────────────────────────────────
// BUTTON STYLES (one set for the whole site)
//   primary   – the ONE main action of a screen or dialog (burnt sienna)
//   secondary – Cancel / Back / Keep… (light, never competes with primary)
//   danger    – actions that delete, cancel, reject or can't be undone (red)
//   link      – text that does something: looks like a link (underlined)
// Every button is at least 44px tall so it's easy to tap on a phone.
// ─────────────────────────────────────────────

export const COLORS = {
  primary: '#FE813C',
  primaryDark: '#E5692A',
  primaryInk: '#B5511B', // orange that is readable as text on white
  dark: '#0E0F0B',
  cream: '#FFFFFF',
  parchment: '#F1F2EE',
  rust: '#5E6A5A',
  danger: '#B24F55',
  dangerDark: '#93404A',
};

const base = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  minHeight: 44, padding: '0 22px', borderRadius: 999,
  fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: 'pointer', border: 'none', transition: 'background 0.15s, box-shadow 0.15s, transform 0.1s',
  whiteSpace: 'nowrap',
};

const disabledStyle = (disabled) => (disabled ? { opacity: 0.55, cursor: 'not-allowed', boxShadow: 'none' } : null);

export const primaryBtn = (disabled = false) => ({
  ...base, background: COLORS.primary, color: COLORS.dark,
  boxShadow: '0 6px 18px rgba(254,129,60,0.32)', ...disabledStyle(disabled),
});

export const secondaryBtn = (disabled = false) => ({
  ...base, background: COLORS.parchment, color: COLORS.dark,
  border: '1px solid rgba(14,15,11,0.15)', ...disabledStyle(disabled),
});

export const dangerBtn = (disabled = false) => ({
  ...base, background: COLORS.danger, color: '#FFFFFF',
  boxShadow: '0 6px 18px rgba(178,79,85,0.3)', ...disabledStyle(disabled),
});

// A quieter red outline, for a destructive action that only opens a confirmation.
export const dangerOutlineBtn = (disabled = false) => ({
  ...base, background: 'rgba(178,79,85,0.06)', color: COLORS.danger,
  border: `1px solid rgba(178,79,85,0.35)`, ...disabledStyle(disabled),
});

export const linkBtn = {
  background: 'none', border: 'none', padding: '10px 2px', minHeight: 44,
  color: COLORS.primaryInk, fontFamily: 'inherit', fontWeight: 800, fontSize: 12,
  textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
