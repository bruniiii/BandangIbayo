// ─────────────────────────────────────────────
// BUTTON STYLES (one set for the whole site)
//   primary   – the ONE main action of a screen or dialog (burnt sienna;
//               sunset orange on the joiner side's tropical skin)
//   secondary – Cancel / Back / Keep… (light, never competes with primary)
//   danger    – actions that delete, cancel, reject or can't be undone (red)
//   link      – text that does something: looks like a link (underlined)
// Every button is at least 44px tall so it's easy to tap on a phone.
// ─────────────────────────────────────────────

export const COLORS = {
  primary: 'var(--ib-sienna, #A8481A)',
  primaryDark: 'var(--ib-sienna-hover, #9E4316)',
  dark: 'var(--ib-dark, #1A0A00)',
  cream: 'var(--ib-cream, #FDF6EE)',
  parchment: 'var(--ib-parch, #F2E4D0)',
  rust: 'var(--ib-rust, #7A3A18)',
  danger: '#C0362C',
  dangerDark: '#9E2B23',
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
  ...base, background: 'var(--ib-primary-btn, #A8481A)', color: 'var(--ib-primary-btn-text, #FDF6EE)',
  boxShadow: '0 6px 18px rgba(var(--ib-orange-rgb, 180,81,30), 0.32)', ...disabledStyle(disabled),
});

export const secondaryBtn = (disabled = false) => ({
  ...base, background: COLORS.parchment, color: COLORS.dark,
  border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.25)', ...disabledStyle(disabled),
});

export const dangerBtn = (disabled = false) => ({
  ...base, background: COLORS.danger, color: '#FFFFFF',
  boxShadow: '0 6px 18px rgba(192,54,44,0.3)', ...disabledStyle(disabled),
});

// A quieter red outline, for a destructive action that only opens a confirmation.
export const dangerOutlineBtn = (disabled = false) => ({
  ...base, background: 'rgba(192,54,44,0.06)', color: COLORS.danger,
  border: `1px solid rgba(192,54,44,0.35)`, ...disabledStyle(disabled),
});

export const linkBtn = {
  background: 'none', border: 'none', padding: '10px 2px', minHeight: 44,
  color: COLORS.primary, fontFamily: 'inherit', fontWeight: 800, fontSize: 12,
  textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
