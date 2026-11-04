import React, { useEffect, useState } from 'react';
import { Wallet, X } from 'lucide-react';
import WeatherChoiceCard from './WeatherChoiceCard';
import { formatPeso } from './tourUtils';

// ─────────────────────────────────────────────
// My Bookings: one "My Refunds" button instead of a bar per refund. It opens
// a window with every refund (bad-weather 50% refunds): waiting to be sent,
// sent (with the receipt, the refund receipt and "I received it"), and done.
//   <MyRefunds bookings={…} weather={…} onChanged={…} />
// ─────────────────────────────────────────────

// Waiting to be sent first, then sent but not yet confirmed, then done; newest first.
const rank = (b) => (b.weather_refund_status !== 'Sent' ? 0 : b.weather_refund_received !== 'received' ? 1 : 2);
const newest = (b) => new Date(b.weather_refund_at || b.updated_at || b.created_at || 0).getTime();

const MyRefunds = ({ bookings, weather, onChanged }) => {
  const [open, setOpen] = useState(false);
  const refunds = bookings.filter((b) => b.weather_choice === 'refund')
    .sort((a, b) => rank(a) - rank(b) || newest(b) - newest(a));
  const toConfirm = refunds.filter((b) => b.weather_refund_status === 'Sent' && !b.weather_refund_received).length;
  const onTheWay = refunds.filter((b) => b.weather_refund_status !== 'Sent').length;

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  if (!refunds.length) return null;
  const total = refunds.reduce((s, b) => s + (Number(b.weather_refund) || 0), 0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 14, cursor: 'pointer',
        background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.3)', color: '#1A0A00', fontFamily: 'inherit',
        fontSize: 11.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <Wallet size={15} style={{ color: '#B4511E' }} /> My Refunds ({refunds.length})
        {toConfirm > 0 && <span style={{ padding: '2px 8px', borderRadius: 999, background: '#B4511E', color: '#FDF6EE', fontSize: 10, letterSpacing: '0.04em' }}>{toConfirm} to confirm</span>}
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div role="dialog" aria-modal="true" aria-label="My refunds" style={{
            position: 'relative', width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            background: '#F2E4D0', borderRadius: 22, boxShadow: '0 24px 60px rgba(26,10,0,0.35)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', background: '#FDF6EE', borderBottom: '1px solid rgba(180,81,30,0.15)' }}>
              <Wallet size={20} style={{ color: '#B4511E', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1A0A00' }}>My Refunds</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>
                  {refunds.length} refund{refunds.length === 1 ? '' : 's'} · {formatPeso(total)}
                  {onTheWay ? ` · ${onTheWay} on the way` : ''}{toConfirm ? ` · ${toConfirm} to confirm` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
                50% refunds for tour dates changed because of bad weather. Open one to see how it was sent, the receipts, and to confirm you received it.
              </p>
              {refunds.map((b) => (
                <WeatherChoiceCard key={b.id} booking={b} weather={weather[String(b.tour_id)]} onChanged={onChanged} defaultOpen={refunds.length === 1} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MyRefunds;
