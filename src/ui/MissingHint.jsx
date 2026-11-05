import React from 'react';
import { jumpTo } from './useRequiredFilled';
import { AlertCircle } from 'lucide-react';

// ─────────────────────────────────────────────
// "Still missing" box under a disabled Submit/Save button: names each box
// that still needs filling, and tapping a name jumps to that box.
//
//   <MissingHint items={[{ label: 'Person 8 · Contact Number', name: 'participant_contact_7' }, 'Terms & Conditions box']} />
//   const [formRef, filled, missing] = useRequiredFilled(); … <MissingHint items={missing} />
//
// items: strings or { label, name } or { label, el } (the box, to jump to it).
// Shows nothing when nothing is missing.
// ─────────────────────────────────────────────

const MAX_SHOWN = 8;

const MissingHint = ({ items = [], style, title = 'Still missing' }) => {
  const extra = items.filter(Boolean).map((i) => (typeof i === 'string' ? { label: i } : i));
  // (The same box named twice is shown once.)
  const all = extra.filter((x, i) => extra.findIndex((y) => y.label === x.label) === i);
  if (!all.length) return null;
  const shown = all.slice(0, MAX_SHOWN);

  return (
    <div role="status" style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12,
      background: 'rgba(140,47,28,0.07)', border: '1px solid rgba(140,47,28,0.25)', color: '#8C2F1C',
      fontSize: 12, fontWeight: 700, lineHeight: 1.5, textAlign: 'left', boxSizing: 'border-box', width: '100%', ...style,
    }}>
      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontWeight: 900 }}>{title} ({all.length}):</strong>{' '}
        {shown.map((m, i) => (
          <React.Fragment key={`${m.label}-${i}`}>
            {i > 0 && ', '}
            {m.el || m.name ? (
              <button type="button" className="no-touch-size" onClick={() => jumpTo(m.el || m.name)} style={{
                background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', fontWeight: 800,
                color: '#8C2F1C', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer',
              }}>{m.label}</button>
            ) : <span>{m.label}</span>}
          </React.Fragment>
        ))}
        {all.length > MAX_SHOWN && ` and ${all.length - MAX_SHOWN} more`}.
      </div>
    </div>
  );
};

export default MissingHint;
