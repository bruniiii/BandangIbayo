import React, { useCallback, useEffect, useState } from 'react';
import { CloudRain, Check, Loader2, Wallet } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { refundWeatherThroughPaymongo } from './payments';

// ─────────────────────────────────────────────
// Booking Management: 50% refunds to send after a weather postponement or
// cancellation (20261204 update). Send each one by GCash, then tap
// "Mark as sent" (with the GCash reference): the joiner is told.
// Hidden when there's nothing to send (or before the update is installed).
// ─────────────────────────────────────────────

const WeatherRefunds = () => {
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    // (Bookings aren't linked to profiles in the database, so the joiners'
    // names and numbers are read separately: asking for both at once failed.)
    const { data, error } = await supabase.from('bookings')
      .select('id, user_id, booking_number, full_name, gcash_number, amount_paid, weather_refund, weather_refund_status, paymongo_payment_id, tours ( title, start_date, end_date )')
      .in('weather_refund_status', ['Due', 'Refunding']).order('created_at', { ascending: true });
    if (error || !data?.length) { setRows([]); return; }
    const ids = [...new Set(data.map((b) => b.user_id).filter(Boolean))];
    const { data: people } = ids.length
      ? await supabase.from('profiles').select('id, first_name, last_name, phone_number').in('id', ids)
      : { data: [] };
    const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
    setRows(data.map((b) => ({ ...b, profiles: byId[b.user_id] || null })));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const markSent = async (b) => {
    const ref = (refs[b.id] || '').trim();
    if (!(await confirmDialog({
      title: `Mark ${formatPeso(b.weather_refund)} as sent?`,
      message: `${b.booking_number}: the joiner gets a notice that their 50% refund was sent${ref ? ` (reference ${ref})` : ''}.`,
      confirmLabel: 'Mark as Sent', cancelLabel: 'Not Yet',
    }))) return;
    setBusy(b.id);
    const { error } = await supabase.rpc('mark_weather_refund_sent', { p_booking_id: b.id, p_reference: ref || null });
    setBusy(null);
    if (error) { toast.error("Couldn't mark it as sent", error.message); return; }
    toast.success('Refund marked as sent', 'The joiner was notified.');
    load();
  };

  const refundOnline = async (b) => {
    if (!(await confirmDialog({
      title: `Refund ${formatPeso(b.weather_refund)} through PayMongo?`,
      message: `${b.booking_number}: PayMongo sends it back to the joiner's own payment (GCash, Maya or card). It can take a few days to reach them. The joiner is notified.`,
      confirmLabel: 'Send Refund', cancelLabel: 'Not Yet',
    }))) return;
    setBusy(b.id);
    const res = await refundWeatherThroughPaymongo({ bookingId: b.id });
    setBusy(null);
    if (!res.ok) { toast.error("PayMongo couldn't send the refund", res.error); return; }
    if (res.data?.status === 'partial') toast.info('Part of the refund was sent', `${formatPeso(res.data.refunded)} went back through PayMongo. Send the other ${formatPeso(res.data.left)} by GCash, then Mark as sent.`);
    else toast.success('Refund sent through PayMongo', 'The joiner was notified.');
    load();
  };

  if (!rows.length) return null;
  const total = rows.reduce((s, b) => s + (Number(b.weather_refund) || 0), 0);
  return (
    <div role="region" aria-label="Weather refunds to send" style={{ background: 'rgba(63,93,98,0.08)', border: '1px solid rgba(63,93,98,0.35)', borderRadius: 18, padding: '14px 16px', marginBottom: 16 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#3F5D62', margin: '0 0 10px', flexWrap: 'wrap' }}>
        <CloudRain size={16} style={{ flexShrink: 0 }} />
        Weather refunds to send: {rows.length} · {formatPeso(total)}
        <span style={{ fontWeight: 600, color: '#7A3A18' }}>50% of what each joiner paid. Refund via PayMongo (back to their own payment), or send by GCash and mark it as sent.</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((b) => {
          const name = b.profiles ? `${b.profiles.first_name || ''} ${b.profiles.last_name || ''}`.trim() || b.full_name : b.full_name;
          const gcash = b.gcash_number || b.profiles?.phone_number || '';
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FDF6EE', borderRadius: 14, padding: '10px 12px', border: '1px solid rgba(63,93,98,0.2)' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{name} · <span style={{ fontFamily: 'monospace' }}>{b.booking_number}</span></p>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>
                  {b.tours?.title || 'Tour'}{b.tours?.start_date ? ` · ${formatYmdRange(b.tours.start_date, b.tours.end_date)}` : ''}{gcash ? ` · GCash ${gcash}` : ''}
                </p>
              </div>
              <strong style={{ fontSize: 14, color: '#1A0A00', whiteSpace: 'nowrap' }}>{formatPeso(b.weather_refund)}</strong>
              {b.weather_refund_status === 'Refunding' && (
                <span style={{ flexBasis: '100%', fontSize: 11.5, fontWeight: 700, color: '#8C5216' }}>
                  Being sent through PayMongo. If it still says this after 10 minutes, tap Refund via PayMongo again: anything already refunded is counted, so it's never sent twice.
                </span>
              )}
              <input aria-label={`GCash reference for ${b.booking_number}`} placeholder="GCash ref (optional)" value={refs[b.id] || ''} maxLength={40}
                onChange={(e) => setRefs((r) => ({ ...r, [b.id]: e.target.value }))}
                style={{ flex: '1 1 150px', minWidth: 0, background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 10, padding: '9px 10px', fontSize: 16, fontFamily: 'inherit', color: '#1A0A00' }} />
              <button type="button" onClick={() => markSent(b)} disabled={busy === b.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, background: '#3F5D62', color: '#FDF6EE', border: 'none', borderRadius: 12, padding: '9px 14px',
                fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
              }}>{busy === b.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />} Mark as sent</button>
              {b.paymongo_payment_id && (
                <button type="button" onClick={() => refundOnline(b)} disabled={busy === b.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#B4511E', color: '#FDF6EE', border: 'none', borderRadius: 12, padding: '9px 14px',
                  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                }}><Wallet size={13} /> Refund via PayMongo</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeatherRefunds;
