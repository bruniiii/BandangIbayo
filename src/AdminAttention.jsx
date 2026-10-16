import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { withAvailableSlots, todayManila, formatDateRange, formatPeso } from './tourUtils';
import { SkeletonRows } from './ui/Skeleton';
import { CreditCard, Wallet, Globe, Bus, ScanLine, Star, CheckCircle2, ChevronRight, ListChecks } from 'lucide-react';

// "Needs Your Attention" on the admin Overview: a to-do list built from live
// data. Each line says what's waiting and opens the page that handles it.
// Shows "You're all caught up" when there's nothing to do.

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SOON_DAYS = 7;          // "leaving soon" and "balance due soon" look this far ahead
const REVIEW_DAYS = 3;        // "new reviews" looks this far back

const loadItems = async () => {
  const today = todayManila();
  const soon = addDays(today, SOON_DAYS);
  const reviewsSince = new Date(Date.now() - REVIEW_DAYS * 86400000).toISOString();

  const [toVerify, balances, requests, upcoming, newReviews] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true })
      .in('payment_status', ['Pending', 'Verification Pending']).neq('booking_status', 'Cancelled'),
    supabase.from('bookings').select('total_price, amount_paid, balance_settled, tours!inner(start_date)')
      .eq('payment_method', 'Downpayment').eq('payment_status', 'Complete').neq('booking_status', 'Cancelled')
      .gte('tours.start_date', today).lte('tours.start_date', soon),
    supabase.from('exclusive_requests').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
    supabase.from('tours').select('id, title, start_date, end_date, duration, group_size')
      .eq('is_archived', false).lte('start_date', soon).gte('end_date', today).order('start_date', { ascending: true }),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).gte('created_at', reviewsSince),
  ]);

  const items = [];

  if (toVerify.count > 0) {
    items.push({
      key: 'verify', Icon: CreditCard, tone: 'urgent',
      title: `${plural(toVerify.count, 'payment')} waiting for review`,
      detail: 'Check the proof of payment, then confirm or reject.',
      action: 'Review', open: ['Booking Management', { status: 'Needs Review' }],
    });
  }

  const owing = (balances.data || []).filter((b) => !b.balance_settled && (b.total_price || 0) > (b.amount_paid || 0));
  if (owing.length) {
    const total = owing.reduce((sum, b) => sum + (b.total_price - (b.amount_paid || 0)), 0);
    items.push({
      key: 'balances', Icon: Wallet, tone: 'urgent',
      title: `${plural(owing.length, 'joiner')} still owe${owing.length === 1 ? 's' : ''} ${formatPeso(total)}`,
      detail: `Downpayment balances for tours in the next ${SOON_DAYS} days.`,
      action: 'See who owes', open: ['Booking Management', { status: 'Balance Due' }],
    });
  }

  if (requests.count > 0) {
    items.push({
      key: 'requests', Icon: Globe, tone: 'normal',
      title: `${plural(requests.count, 'exclusive request')} to answer`,
      detail: 'Private-group bookings and new destination suggestions.',
      action: 'Open', open: ['Exclusive Requests'],
    });
  }

  const tours = await withAvailableSlots(upcoming.data || []);
  const running = tours.filter((t) => t.start_date <= today);
  const leaving = tours.filter((t) => t.start_date > today);
  if (running.length) {
    items.push({
      key: 'checkin', Icon: ScanLine, tone: 'urgent',
      title: running.length === 1 ? `${running[0].title} is on today` : `${running.length} tours are on today`,
      detail: running.length === 1
        ? `${running[0].current_booked} / ${running[0].group_size || 15} joiners booked. Scan their QR codes as they arrive.`
        : running.map((t) => t.title).join(' · '),
      action: 'Check-in', open: ['Check-in'],
    });
  }
  leaving.forEach((t) => {
    const full = t.available_slots <= 0;
    items.push({
      key: `leaving-${t.id}`, Icon: Bus, tone: 'normal',
      title: `${t.title} leaves ${formatDateRange(t.start_date, t.duration)}`,
      detail: full ? `Full: ${t.current_booked} / ${t.group_size || 15} booked.` : `${t.current_booked} / ${t.group_size || 15} booked · ${plural(t.available_slots, 'slot')} still open.`,
      action: 'Open', open: ['Tour Management'],
    });
  });

  if (newReviews.count > 0) {
    items.push({
      key: 'reviews', Icon: Star, tone: 'normal',
      title: `${plural(newReviews.count, 'new review')} in the last ${REVIEW_DAYS} days`,
      detail: 'See what joiners are saying.',
      action: 'Read', open: ['Reviews'],
    });
  }

  return items;
};

const TONES = {
  urgent: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  normal: { bg: 'rgba(26,10,0,0.07)', color: '#7A3A18' },
};

const AdminAttention = ({ onOpen }) => {
  const [items, setItems] = useState(null);

  const refresh = useCallback(async () => {
    try { setItems(await loadItems()); }
    catch (err) { console.error('Error loading attention list:', err); setItems([]); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once, then on changes below
    refresh();
    const channel = supabase
      .channel('admin-attention')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exclusive_requests' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return (
    <div style={{
      background: '#FDF6EE', borderRadius: 24, padding: '2rem 2.5rem',
      border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 24px rgba(26,10,0,0.06)',
    }} className="dashboard-hero-padding">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ListChecks size={15} />
        </div>
        <h3 style={{ fontWeight: 900, fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00', margin: 0 }}>
          Needs Your Attention
        </h3>
        {items?.length > 0 && (
          <span style={{ background: '#B4511E', color: '#FDF6EE', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 900 }}>{items.length}</span>
        )}
      </div>

      {items === null ? (
        <SkeletonRows count={4} boxed={false} label="Loading your to-do list" />
      ) : items.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '1.25rem 1.25rem', borderRadius: 16, background: 'rgba(180,81,30,0.06)' }}>
          <CheckCircle2 size={26} style={{ color: '#A8481A', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#1A0A00', margin: 0 }}>You're all caught up</p>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '3px 0 0' }}>No payments to check, requests to answer or tours leaving this week.</p>
          </div>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item, i) => {
            const { key, tone, title, detail, action, open } = item;
            const ItemIcon = item.Icon;
            const t = TONES[tone];
            return (
              <li key={key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: i ? '1px solid rgba(180,81,30,0.08)' : 'none', flexWrap: 'wrap' }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: t.bg, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ItemIcon size={17} />
                </span>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{title}</p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '3px 0 0' }}>{detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(...open)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 36, padding: '0 14px',
                    borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    border: tone === 'urgent' ? 'none' : '1px solid rgba(122,58,24,0.3)',
                    background: tone === 'urgent' ? '#1A0A00' : 'transparent',
                    color: tone === 'urgent' ? '#FDF6EE' : '#7A3A18',
                  }}
                >
                  {action} <ChevronRight size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdminAttention;
