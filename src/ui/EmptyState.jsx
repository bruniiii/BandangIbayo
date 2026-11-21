import { primaryBtn, secondaryBtn } from './buttons';

// ─────────────────────────────────────────────
// EMPTY STATE: shown when a list has nothing to display. It says what's
// missing, why, and offers the next step as a button.
//   <EmptyState icon={Compass} title="No bookings yet"
//     message="When you book a tour it will show up here."
//     action={{ label: 'Explore Tours', onClick: goToTours }} />
// `secondaryAction` adds a lighter second button; `compact` is for small cards.
// ─────────────────────────────────────────────

const EmptyState = ({ icon: Icon, title, message, action, secondaryAction, compact = false, tone = 'light' }) => {
  const dark = tone === 'dark';
  const size = compact ? 64 : 96;
  return (
    <div
      role="status"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: compact ? '1.5rem 1rem' : '3rem 1.5rem', gap: compact ? 8 : 12,
        background: dark ? 'transparent' : 'var(--ib-surface, #FFFDF9)', borderRadius: 24,
        border: dark ? 'none' : '1px dashed rgba(var(--ib-accent-rgb, 180,81,30), 0.28)',
      }}
    >
      {Icon && (
        <div aria-hidden="true" className="journal-doodle" style={{ position: 'relative', width: size + 96, height: size + 14, marginBottom: compact ? 2 : 6 }}>
          {/* A travel-journal doodle: a dashed trail winding to a little flag,
              two pencil mountains, and the icon in a warm circle. */}
          <svg viewBox="0 0 196 110" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <path d="M6 100 C 30 92, 34 70, 58 74 S 86 98, 112 84 S 150 40, 172 30" fill="none" stroke="var(--ib-accent, #B4511E)" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" opacity="0.55" />
            <path d="M172 30 L172 6 M172 7 L188 12 L172 18" fill="none" stroke="var(--ib-sienna, #A8481A)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            <path d="M2 64 L14 48 L22 58 L30 44 L44 64" fill="none" stroke="var(--ib-sienna, #A8481A)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.45" />
            <path d="M150 104 L160 92 L168 100 L176 88 L190 104" fill="none" stroke="var(--ib-amber, #E8A265)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
          </svg>
          <div style={{
            position: 'absolute', left: 48, top: 4, width: size, height: size, borderRadius: '50%',
            background: dark ? 'rgba(var(--ib-amber-rgb, 232,162,101), 0.14)' : 'linear-gradient(145deg, var(--ib-peach-1, #F7E3CC), var(--ib-peach-2, #F2D3B3))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-4deg)',
          }}>
            <Icon size={compact ? 28 : 42} strokeWidth={1.6} style={{ color: dark ? 'var(--ib-amber, #E8A265)' : 'var(--ib-sienna, #A8481A)' }} />
          </div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: compact ? 14 : 17, fontWeight: 900, color: dark ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-dark, #1A0A00)', letterSpacing: '-0.01em' }}>{title}</p>
      {message && (
        <p style={{ margin: 0, maxWidth: 360, fontSize: compact ? 12 : 13.5, lineHeight: 1.6, color: dark ? 'rgba(var(--ib-soft-rgb, 232,210,190), 0.85)' : 'var(--ib-rust, #7A3A18)' }}>{message}</p>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: compact ? 4 : 8 }}>
          {secondaryAction && (
            <button type="button" onClick={secondaryAction.onClick} style={secondaryBtn()}>{secondaryAction.label}</button>
          )}
          {action && (
            <button type="button" onClick={action.onClick} style={primaryBtn()}>{action.label}</button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
