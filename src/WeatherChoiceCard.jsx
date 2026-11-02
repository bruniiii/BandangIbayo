import React, { useEffect, useState } from 'react';
import { CloudRain, Loader2, MessagesSquare, CalendarCheck, Wallet } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatYmdRange } from './dateRange';
import { formatPeso, todayManila, withAvailableSlots } from './tourUtils';
import { openGroupChat } from './chatStore';

// ─────────────────────────────────────────────
// My Bookings: a tour date postponed or cancelled because of bad weather.
//   Cancelled → choose within 48 hours: another date of the same tour, or a
//     50% refund (no choice = 50% refund).
//   Postponed → the same: within 48 hours keep the slot on the new date, move
//     to another date, or a 50% refund (no choice = 50% refund).
//   Refund → shows whether it was sent.
//   booking: the booking (with weather_* columns) + weather: the tour's
//     { weather_status, weather_reason, weather_note, weather_old_start, weather_old_end }
// ─────────────────────────────────────────────

const deadlineText = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const btn = (bg, fg, border = 'none') => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 16px', borderRadius: 12, border,
  background: bg, color: fg, fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
});

const WeatherChoiceCard = ({ booking, weather, onChanged }) => {
  const [dates, setDates] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState('');
  const choice = booking.weather_choice;
  const open = choice === 'pending' && booking.weather_deadline && new Date(booking.weather_deadline) > new Date();
  const cancelled = weather?.weather_status === 'cancelled';
  const title = booking.tours?.title || 'Your tour';
  const why = [weather?.weather_reason, weather?.weather_note].filter(Boolean).join(' · ');
  const refund = Math.round((Number(booking.amount_paid) || 0) * 50) / 100;

  // Other open dates of the same tour, with room for this booking.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('tours').select('*').eq('title', title).eq('is_archived', false).gt('start_date', todayManila());
      const withSlots = await withAvailableSlots((data || []).filter((t) => String(t.id) !== String(booking.tour_id) && t.weather_status !== 'cancelled'));
      if (alive) setDates(withSlots.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))));
    })();
    return () => { alive = false; };
  }, [open, title, booking.tour_id]);

  const choose = async (kind) => {
    const target = dates?.find((d) => String(d.id) === pick);
    if (kind === 'move' && !target) return;
    if (!(await confirmDialog(kind === 'stay' ? {
      title: `Keep your slot on ${formatYmdRange(booking.tours?.start_date, booking.tours?.end_date)}?`,
      message: 'Your payment and pickup point carry over to the new date.',
      confirmLabel: 'Keep My Slot', cancelLabel: 'Go Back',
    } : kind === 'move' ? {
      title: `Move to ${formatYmdRange(target.start_date, target.end_date)}?`,
      message: 'Your slot and payment carry over to that date, and you join its group chat.',
      confirmLabel: 'Move My Booking', cancelLabel: 'Go Back',
    } : {
      title: `Take the 50% refund (${formatPeso(refund)})?`,
      message: `Your booking is closed and Bandang IBAYO sends ${formatPeso(refund)} (50% of the ${formatPeso(booking.amount_paid)} you paid) to your GCash. This can't be undone.`,
      confirmLabel: 'Get 50% Refund', cancelLabel: 'Go Back', tone: 'danger',
    }))) return;
    setBusy(kind);
    const { error } = await supabase.rpc('weather_choose', { p_booking_id: booking.id, p_choice: kind, p_new_tour_id: kind === 'move' ? target.id : null });
    setBusy('');
    if (error) { toast.error("Couldn't save your choice", error.message); return; }
    toast.success(kind === 'stay' ? 'See you on the new date!' : kind === 'move' ? 'Booking moved' : 'Refund requested',
      kind === 'stay' ? 'Your slot is kept.' : kind === 'move' ? "You're in the new date's group chat too." : "We'll let you know when it's sent.");
    onChanged?.();
  };

  const shell = (children, tone = '#3F5D62') => (
    <section aria-label={`${title}: weather update`} style={{
      background: '#FDF6EE', borderRadius: 20, border: `2px solid ${tone}`, padding: '1.1rem 1.2rem', boxShadow: '0 6px 20px rgba(26,10,0,0.08)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>{children}</section>
  );
  const heading = (text, tone = '#3F5D62') => (
    <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: tone }}>
      <CloudRain size={15} /> {text}
    </p>
  );
  const chatBtn = (
    <button type="button" onClick={() => openGroupChat(booking.tour_id)} style={btn('transparent', '#1A0A00', '1px solid rgba(26,10,0,0.25)')}>
      <MessagesSquare size={14} /> Ask in the group chat
    </button>
  );

  // The 50% refund: waiting to be sent, or sent.
  if (choice === 'refund') {
    const sent = booking.weather_refund_status === 'Sent';
    return shell(<>
      {heading(sent ? 'Refund sent' : 'Refund on the way', sent ? '#1F6B4A' : '#8C5216')}
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A0A00', lineHeight: 1.45 }}>
        {title} ({booking.booking_number}): {formatPeso(booking.weather_refund)} {sent ? 'was sent to you' : 'will be sent to your GCash'}.
      </p>
      {sent && booking.weather_refund_ref && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7A3A18' }}>Reference: {booking.weather_refund_ref}</p>}
    </>, sent ? '#1F6B4A' : '#E8A265');
  }

  if (!open) return null;

  const options = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'rgba(63,93,98,0.07)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 900, color: '#1A0A00', display: 'flex', alignItems: 'center', gap: 6 }}><CalendarCheck size={15} /> Move to another date</p>
        {dates === null ? (
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Looking for other dates…</p>
        ) : dates.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A3A18' }}>No other date of this tour is open yet. Ask in the group chat — a new date may be added soon.</p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select aria-label="Choose a date" value={pick} onChange={(e) => setPick(e.target.value)} style={{
              flex: '1 1 200px', minWidth: 0, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 12, padding: '10px 12px',
              fontSize: 16, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit',
            }}>
              <option value="">Choose a date…</option>
              {dates.map((d) => {
                const fits = d.available_slots >= (booking.slots_booked || 1);
                return <option key={d.id} value={d.id} disabled={!fits}>{formatYmdRange(d.start_date, d.end_date)} · {fits ? `${d.available_slots} slots left` : 'full'}</option>;
              })}
            </select>
            <button type="button" disabled={!pick || !!busy} onClick={() => choose('move')} style={{ ...btn('#1A0A00', '#FDF6EE'), opacity: pick ? 1 : 0.5, cursor: pick ? 'pointer' : 'not-allowed' }}>
              {busy === 'move' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarCheck size={14} />} Move
            </button>
          </div>
        )}
      </div>
      <button type="button" disabled={!!busy} onClick={() => choose('refund')} style={btn('rgba(140,47,28,0.08)', '#8C2F1C', '1px solid rgba(140,47,28,0.35)')}>
        {busy === 'refund' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wallet size={14} />} Get a 50% refund ({formatPeso(refund)})
      </button>
    </div>
  );

  if (cancelled) {
    return shell(<>
      {heading('Tour cancelled · please choose', '#8C2F1C')}
      <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#1A0A00', lineHeight: 1.4 }}>
        {title} on {formatYmdRange(booking.tours?.start_date, booking.tours?.end_date)} was cancelled{why ? ` because of ${why}` : ''}.
      </p>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#8C2F1C' }}>
        Choose before {deadlineText(booking.weather_deadline)}. If you don't, you'll get the 50% refund.
      </p>
      {options}
      {chatBtn}
    </>, '#8C2F1C');
  }

  // Postponed: staying is the default.
  return shell(<>
    {heading('Tour postponed · please choose')}
    <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#1A0A00', lineHeight: 1.4 }}>
      {title} moved to {formatYmdRange(booking.tours?.start_date, booking.tours?.end_date)}
      {weather?.weather_old_start ? ` (was ${formatYmdRange(weather.weather_old_start, weather.weather_old_end)})` : ''}{why ? ` because of ${why}` : ''}.
    </p>
    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#8C2F1C' }}>
      Choose before {deadlineText(booking.weather_deadline)}. If you don't, you'll get the 50% refund.
    </p>
    <button type="button" disabled={!!busy} onClick={() => choose('stay')} style={btn('#1F6B4A', '#FDF6EE')}>
      {busy === 'stay' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarCheck size={14} />} Keep my slot on the new date
    </button>
    {options}
    {chatBtn}
  </>);
};

export default WeatherChoiceCard;
