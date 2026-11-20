import { useState } from 'react';
import { Check } from 'lucide-react';

// The tour's "Things to bring" as an optional checklist the joiner can tick
// off while packing. Ticks are saved on this device for this booking.

const keyFor = (bookingId) => `ibayo-packing-${bookingId}`;
const readTicks = (bookingId) => {
  try { return new Set(JSON.parse(localStorage.getItem(keyFor(bookingId)) || '[]')); } catch { return new Set(); }
};

const packingItems = (text) => (text || '').split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

const PackingChecklist = ({ bookingId, text }) => {
  const items = packingItems(text);
  const [ticked, setTicked] = useState(() => readTicks(bookingId));
  if (!items.length) return null;

  const toggle = (item) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(item)) next.delete(item); else next.add(item);
    try { localStorage.setItem(keyFor(bookingId), JSON.stringify([...next])); } catch { /* private mode */ }
    return next;
  });
  const done = items.filter((i) => ticked.has(i)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)', margin: 0 }}>
        Optional: tick things off as you pack · <strong style={{ color: done === items.length ? 'var(--ib-sienna, #A8481A)' : 'var(--ib-dark, #1A0A00)' }}>{done} of {items.length} packed</strong>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((item) => {
          const on = ticked.has(item);
          return (
            <label key={item} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              background: on ? 'rgba(var(--ib-accent-rgb, 180,81,30), 0.16)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.06)',
              border: `1px solid ${on ? 'rgba(var(--ib-accent-rgb, 180,81,30), 0.4)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.15)'}`,
              borderRadius: 999, padding: '6px 12px 6px 8px', fontSize: 12.5, fontWeight: 700,
              color: on ? 'var(--ib-rust, #7A3A18)' : 'var(--ib-dark, #1A0A00)', textDecoration: on ? 'line-through' : 'none',
            }}>
              <input type="checkbox" checked={on} onChange={() => toggle(item)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
              <span aria-hidden="true" style={{
                width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: on ? 'var(--ib-accent, #B4511E)' : 'var(--ib-cream, #FDF6EE)', border: `1.5px solid ${on ? 'var(--ib-accent, #B4511E)' : 'rgba(var(--ib-rust-rgb, 122,58,24), 0.45)'}`, color: 'var(--ib-on-ink, #FDF6EE)',
              }}>{on && <Check size={11} strokeWidth={3} />}</span>
              {item}
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default PackingChecklist;
