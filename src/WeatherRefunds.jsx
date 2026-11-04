import React, { useCallback, useEffect, useState } from 'react';
import { CloudRain, AlertTriangle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { useAdminMe } from './adminMe';
import { REFUND_SELECT, RefundPanel, RefundSentInfo, RefundHistoryButton } from './RefundPanel';

// ─────────────────────────────────────────────
// Booking Management: 50% refunds to send after a weather postponement or
// cancellation. Any admin prepares one (PayMongo, or GCash with the receipt);
// only the main admin approves and sends it (RefundPanel). Refunds a joiner
// says they didn't get are listed too. The main admin also sees the
// Refund history. Hidden when there's nothing to show.
// ─────────────────────────────────────────────

const WeatherRefunds = () => {
  const me = useAdminMe();
  const [rows, setRows] = useState([]);
  const [missing, setMissing] = useState([]); // sent, but the joiner says they didn't get it

  const load = useCallback(async () => {
    // (Bookings aren't linked to profiles in the database, so the joiners'
    // names and numbers are read separately: asking for both at once failed.)
    const select = `${REFUND_SELECT}, tours ( title, start_date, end_date )`;
    const [due, notGot] = await Promise.all([
      supabase.from('bookings').select(select).in('weather_refund_status', ['Due', 'Refunding']).order('created_at', { ascending: true }),
      supabase.from('bookings').select(select).eq('weather_refund_status', 'Sent').eq('weather_refund_received', 'not_received').order('weather_refund_received_at', { ascending: true }),
    ]);
    const all = [...(due.data || []), ...(notGot.data || [])];
    const ids = [...new Set(all.map((b) => b.user_id).filter(Boolean))];
    const { data: people } = ids.length
      ? await supabase.from('profiles').select('id, first_name, last_name, phone_number').in('id', ids)
      : { data: [] };
    const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
    const withPeople = (list) => (list || []).map((b) => ({ ...b, profiles: byId[b.user_id] || null }));
    setRows(due.error ? [] : withPeople(due.data));
    setMissing(notGot.error ? [] : withPeople(notGot.data));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!rows.length && !missing.length) {
    // The main admin can still open the history.
    return me.isMain ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><RefundHistoryButton /></div> : null;
  }
  const total = rows.reduce((s, b) => s + (Number(b.weather_refund) || 0), 0);
  const waiting = rows.filter((b) => b.weather_refund_prepared_at && b.weather_refund_status === 'Due').length;

  const row = (b, sent) => {
    const name = b.profiles ? `${b.profiles.first_name || ''} ${b.profiles.last_name || ''}`.trim() || b.full_name : b.full_name;
    const gcash = b.gcash_number || b.profiles?.phone_number || '';
    return (
      <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#FDF6EE', borderRadius: 14, padding: '12px 14px', border: `1px solid ${sent ? 'rgba(140,47,28,0.35)' : 'rgba(63,93,98,0.2)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{name} · <span style={{ fontFamily: 'monospace' }}>{b.booking_number}</span></p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>
              {b.tours?.title || 'Tour'}{b.tours?.start_date ? ` · ${formatYmdRange(b.tours.start_date, b.tours.end_date)}` : ''}{gcash ? ` · GCash ${gcash}` : ''}
            </p>
          </div>
          <strong style={{ fontSize: 14, color: '#1A0A00', whiteSpace: 'nowrap' }}>{formatPeso(b.weather_refund)}</strong>
        </div>
        {sent ? <RefundSentInfo booking={b} onDone={load} /> : <RefundPanel booking={{ ...b, gcash_number: gcash }} onDone={load} />}
      </div>
    );
  };

  return (
    <div role="region" aria-label="Weather refunds to send" style={{ background: 'rgba(63,93,98,0.08)', border: '1px solid rgba(63,93,98,0.35)', borderRadius: 18, padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ flex: '1 1 260px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#3F5D62', margin: 0, flexWrap: 'wrap' }}>
          <CloudRain size={16} style={{ flexShrink: 0 }} />
          {rows.length ? `Weather refunds to send: ${rows.length} · ${formatPeso(total)}` : 'Weather refunds'}
          {waiting > 0 && <span style={{ padding: '2px 9px', borderRadius: 999, background: '#B4511E', color: '#FDF6EE', fontSize: 11 }}>{waiting} waiting for the main admin</span>}
        </p>
        {me.isMain && <RefundHistoryButton />}
      </div>
      {rows.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>
          50% of what each joiner paid. Any admin prepares a refund (PayMongo, or GCash with the receipt); only the main admin approves and sends it.
        </p>
      )}
      {rows.map((b) => row(b, false))}
      {missing.length > 0 && (
        <>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', fontSize: 12.5, fontWeight: 900, color: '#8C2F1C' }}>
            <AlertTriangle size={15} /> Joiners who say they didn't get their refund: {missing.length}
          </p>
          {missing.map((b) => row(b, true))}
        </>
      )}
    </div>
  );
};

export default WeatherRefunds;
