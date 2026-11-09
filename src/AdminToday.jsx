import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Wallet, Shield, Globe, CloudRain, Rss, Truck, AlertTriangle, XCircle, ClipboardCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { todayManila } from './tourUtils';
import { addDaysYmd, formatYmdRange } from './dateRange';

// ─────────────────────────────────────────────
// Overview → "Today": everything waiting on an admin, in one list. Each line
// opens the right page (onOpen(page, id?, section?)). Also checks the tours
// leaving in the next 2 days: driver and van set, driver link made, all paid.
// ─────────────────────────────────────────────

const AdminToday = ({ onOpen }) => {
  const [items, setItems] = useState(null);
  // (The latest onOpen, so the list loads once and not on every redraw.)
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; });
  const go = (...args) => openRef.current?.(...args);

  useEffect(() => {
    let alive = true;
    (async () => {
      const today = todayManila();
      const soon = addDaysYmd(today, 2);
      const [pay, cancels, reqs, refunds, refundsMissing, posts, tours] = await Promise.all([
        supabase.from('bookings').select('id, booking_number').in('payment_status', ['Pending', 'Verification Pending']).order('created_at').limit(50),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).not('cancellation_requested_at', 'is', null).not('booking_status', 'in', '("Cancelled","Rejected")'),
        supabase.from('exclusive_requests').select('id, request_type').eq('status', 'Pending').limit(100),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).in('weather_refund_status', ['Due', 'Refunding']),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('weather_refund_status', 'Sent').eq('weather_refund_received', 'not_received'),
        supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('tours').select('id, title, start_date, end_date').eq('is_archived', false).gte('start_date', today).lte('start_date', soon).order('start_date'),
      ]);
      const list = [];
      const n = (r) => r?.count || 0;
      if (pay.data?.length) list.push({ key: 'pay', icon: Wallet, tone: 'warn', text: `${pay.data.length} payment${pay.data.length === 1 ? '' : 's'} to confirm`, open: () => go('Booking Management', pay.data.length === 1 ? pay.data[0].id : null, 'booking-payment') });
      if (n(cancels)) list.push({ key: 'cancel', icon: XCircle, tone: 'warn', text: `${n(cancels)} cancellation request${n(cancels) === 1 ? '' : 's'} to answer`, open: () => go('Booking Management') });
      const priv = (reqs.data || []).filter((r) => r.request_type !== 'request');
      const asked = (reqs.data || []).filter((r) => r.request_type === 'request');
      if (priv.length) list.push({ key: 'priv', icon: Shield, tone: 'warn', text: `${priv.length} Private Tour request${priv.length === 1 ? '' : 's'} to approve or reject`, open: () => go('Private Tours', priv.length === 1 ? priv[0].id : null) });
      if (asked.length) list.push({ key: 'req', icon: Globe, tone: 'warn', text: `${asked.length} requested tour${asked.length === 1 ? '' : 's'} to approve or reject`, open: () => go('Requested Tours', asked.length === 1 ? asked[0].id : null) });
      if (n(refunds) || n(refundsMissing)) list.push({ key: 'refund', icon: CloudRain, tone: n(refundsMissing) ? 'bad' : 'warn', text: `${n(refunds)} refund${n(refunds) === 1 ? '' : 's'} to send${n(refundsMissing) ? ` · ${n(refundsMissing)} joiner${n(refundsMissing) === 1 ? ' says they' : 's say they'} didn't get it` : ''}`, open: () => go('Booking Management', null, 'refunds') });
      if (n(posts)) list.push({ key: 'posts', icon: Rss, tone: 'warn', text: `${n(posts)} Feed post${n(posts) === 1 ? '' : 's'} waiting for approval`, open: () => go('Feed') });

      // Tours leaving in the next 2 days: are they ready?
      const soonTours = tours.data || [];
      if (soonTours.length) {
        const ids = soonTours.map((t) => t.id);
        const [veh, links, owing] = await Promise.all([
          supabase.from('tour_vehicles').select('tour_id').in('tour_id', ids),
          supabase.from('tour_driver_links').select('tour_id').in('tour_id', ids),
          supabase.from('bookings').select('tour_id, total_price, amount_paid').in('tour_id', ids).eq('payment_status', 'Complete').eq('payment_method', 'Downpayment').eq('balance_settled', false),
        ]);
        const has = (rows, id) => (rows.data || []).some((r) => String(r.tour_id) === String(id));
        soonTours.forEach((t) => {
          const missing = [];
          if (!has(veh, t.id)) missing.push('no driver/van yet');
          if (!has(links, t.id)) missing.push('no driver link yet');
          const owe = (owing.data || []).filter((b) => String(b.tour_id) === String(t.id)).length;
          if (owe) missing.push(`${owe} joiner${owe === 1 ? '' : 's'} still owe${owe === 1 ? 's' : ''} a balance`);
          list.push({
            key: `tour-${t.id}`, icon: missing.length ? Truck : ClipboardCheck, tone: missing.length ? 'bad' : 'good',
            text: `${t.title} (${formatYmdRange(t.start_date, t.end_date)}): ${missing.length ? missing.join(', ') : 'ready to go'}`,
            open: () => go(missing.length && missing[0].startsWith('no') ? 'Tracking Management' : 'Booking Management', missing.length && missing[0].startsWith('no') ? t.id : null),
          });
        });
      }
      if (alive) setItems(list);
    })();
    return () => { alive = false; };
  }, []); // (go() reads the latest onOpen)

  const tones = {
    warn: { bg: 'rgba(232,162,101,0.18)', color: '#7A4410', Icon: AlertTriangle },
    bad: { bg: 'rgba(192,69,43,0.12)', color: '#8C2F1C', Icon: AlertTriangle },
    good: { bg: 'rgba(46,155,95,0.12)', color: '#1B5E3B', Icon: CheckCircle2 },
  };
  const todo = (items || []).filter((i) => i.tone !== 'good').length;

  return (
    <section aria-label="Today" style={{ background: '#FDF6EE', borderRadius: 20, border: '1px solid rgba(180,81,30,0.14)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 20px rgba(26,10,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontWeight: 900, fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00' }}>Today: to do</h3>
        <span style={{ fontSize: 12, fontWeight: 800, color: todo ? '#8C2F1C' : '#1B5E3B' }}>
          {items === null ? 'Checking…' : todo ? `${todo} thing${todo === 1 ? '' : 's'} need you` : 'All caught up'}
        </span>
      </div>
      {items !== null && items.length === 0 && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1B5E3B' }}>
          <CheckCircle2 size={16} /> Nothing waiting for you right now, and no tours in the next 2 days.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(items || []).map((it) => {
          const t = tones[it.tone];
          const Icon = it.icon;
          return (
            <button key={it.key} type="button" onClick={it.open} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              background: t.bg, border: 'none', borderRadius: 12, padding: '10px 12px', color: t.color,
            }}>
              <Icon size={17} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800 }}>{it.text}</span>
              <ChevronRight size={16} style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default AdminToday;
