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
        background: dark ? 'transparent' : '#FFFDF9', borderRadius: 24,
        border: dark ? 'none' : '1px dashed rgba(196,92,38,0.28)',
      }}
    >
      {Icon && (
        <div aria-hidden="true" style={{ position: 'relative', width: size + 24, height: size + 8, marginBottom: compact ? 2 : 6 }}>
          {/* Soft "illustration": a warm circle with the icon and two little accents. */}
          <div style={{
            position: 'absolute', left: 12, top: 0, width: size, height: size, borderRadius: '50%',
            background: dark ? 'rgba(232,162,101,0.14)' : 'linear-gradient(145deg, #F7E3CC, #F2D3B3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={compact ? 28 : 42} strokeWidth={1.6} style={{ color: dark ? '#E8A265' : '#C45C26' }} />
          </div>
          <span style={{ position: 'absolute', right: 2, top: 10, width: 12, height: 12, borderRadius: '50%', background: '#E8A265', opacity: 0.7 }} />
          <span style={{ position: 'absolute', left: 4, bottom: 6, width: 8, height: 8, borderRadius: '50%', background: '#C45C26', opacity: 0.35 }} />
        </div>
      )}
      <p style={{ margin: 0, fontSize: compact ? 14 : 17, fontWeight: 900, color: dark ? '#FDF6EE' : '#1A0A00', letterSpacing: '-0.01em' }}>{title}</p>
      {message && (
        <p style={{ margin: 0, maxWidth: 360, fontSize: compact ? 12 : 13.5, lineHeight: 1.6, color: dark ? 'rgba(232,210,190,0.75)' : '#7A3A18' }}>{message}</p>
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
