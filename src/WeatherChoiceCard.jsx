import React, { useEffect, useState } from 'react';
import { CloudRain, Loader2, MessagesSquare, CalendarCheck, Wallet, ChevronDown, Download } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatYmdRange } from './dateRange';
import { formatPeso, todayManila, withAvailableSlots } from './tourUtils';
import { openGroupChat } from './chatStore';
import { weatherRefundStatus } from './payments';
import { RefundProofLink } from './RefundPanel';
import { downloadRefundReceipt } from './paymentReceipt';
import NiceSelect from './ui/NiceSelect';

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

// Where a refund sent through PayMongo is now, asked from PayMongo each time
// My Bookings opens: on its way, received (with the date), or failed (then
// Bandang IBAYO is told and sends it again).
const RefundStatus = ({ bookingId }) => {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    weatherRefundStatus({ bookingId }).then((res) => { if (alive) setState(res.ok ? res.data : { status: 'unknown' }); });
    return () => { alive = false; };
  }, [bookingId]);
  const day = state?.at ? new Date(state.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '';
  const line = !state ? { c: '#7A3A18', t: 'Checking where your refund is…' }
    : state.status === 'succeeded' ? { c: '#1F6B4A', t: `✓ Received: PayMongo finished sending it to your GCash, Maya or card${day ? ` on ${day}` : ''}. Check your account's history for the credit.` }
      : state.status === 'pending' ? { c: '#8C5216', t: 'On its way: PayMongo is still sending it. It usually reaches GCash or Maya in 1 to 5 days (cards can take longer).' }
        : state.status === 'failed' ? { c: '#8C2F1C', t: "The refund didn't go through at PayMongo. Bandang IBAYO has been told and will send it again. You don't need to do anything." }
          : { c: '#7A3A18', t: "Couldn't check with PayMongo right now. Please open this again later." };
  if (!line) return null;
  return <p role="status" style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: line.c, lineHeight: 1.5, background: 'rgba(253,246,238,0.6)', borderRadius: 10, padding: '8px 10px' }}>{line.t}</p>;
};

// The joiner says whether the refund reached them ("I didn't get it" tells the
// main admin right away). They can change their answer.
const RefundConfirm = ({ booking, onChanged }) => {
  const [busy, setBusy] = useState('');
  const [answer, setAnswer] = useState(booking.weather_refund_received || null);
  const say = async (received) => {
    if (!received && !(await confirmDialog({
      title: "Didn't get your refund?",
      message: `Check your GCash, Maya or card history first${booking.weather_refund_method === 'paymongo' ? ' (PayMongo refunds can take 1 to 5 days)' : ''}. Bandang IBAYO's main admin is told right away and will check it.`,
      confirmLabel: "I Didn't Get It", cancelLabel: 'Check Again',
    }))) return;
    setBusy(received ? 'yes' : 'no');
    const { error } = await supabase.rpc('confirm_weather_refund', { p_booking_id: booking.id, p_received: received });
    setBusy('');
    if (error) { toast.error("Couldn't save your answer", error.message); return; }
    setAnswer(received ? 'received' : 'not_received');
    toast.success(received ? 'Thanks for confirming!' : 'Bandang IBAYO was told', received ? 'Your refund is complete.' : "They'll check it and get back to you.");
    onChanged?.();
  };
  if (answer === 'received') {
    return <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#1F6B4A' }}>✓ You confirmed you received it. Thank you!</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(242,228,208,0.6)', borderRadius: 12, padding: '10px 12px' }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: answer === 'not_received' ? '#8C2F1C' : '#1A0A00' }}>
        {answer === 'not_received' ? "You said you didn't get it. Bandang IBAYO was told and is checking it." : 'Did you receive it?'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => say(true)} disabled={!!busy} style={{ ...btn('#1F6B4A', '#FDF6EE'), padding: '9px 14px' }}>
          {busy === 'yes' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarCheck size={13} />} {answer === 'not_received' ? 'I got it now' : 'I received it'}
        </button>
        {answer !== 'not_received' && (
          <button type="button" onClick={() => say(false)} disabled={!!busy} style={{ ...btn('transparent', '#8C2F1C', '1px solid rgba(140,47,28,0.4)'), padding: '9px 14px' }}>
            {busy === 'no' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null} I didn't get it
          </button>
        )}
      </div>
    </div>
  );
};

const WeatherChoiceCard = ({ booking, weather, onChanged }) => {
  const [dates, setDates] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
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

  // The 50% refund: waiting to be sent, or sent. A small bar; the details (and
  // where PayMongo is with it) show when the joiner opens it.
  if (choice === 'refund') {
    const sent = booking.weather_refund_status === 'Sent';
    const tone = sent ? '#1F6B4A' : '#8C5216';
    return (
      <section aria-label={`${title}: refund`} style={{
        background: '#FDF6EE', borderRadius: 16, border: `1.5px solid ${sent ? '#1F6B4A' : '#E8A265'}`, padding: '0.75rem 1rem',
        boxShadow: '0 4px 14px rgba(26,10,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, flex: '1 1 220px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#1A0A00' }}>
            <Wallet size={16} style={{ color: tone, flexShrink: 0 }} />
            <span><span style={{ color: tone, fontWeight: 900 }}>{sent ? 'Refund sent' : 'Refund on the way'}</span> · {formatPeso(booking.weather_refund)} · {title}
              {sent && !booking.weather_refund_received && <span style={{ marginLeft: 6, padding: '1px 8px', borderRadius: 999, background: '#B4511E', color: '#FDF6EE', fontSize: 10.5, fontWeight: 900 }}>Please confirm</span>}</span>
          </p>
          <button type="button" onClick={() => setRefundOpen((v) => !v)} aria-expanded={refundOpen}
            style={{ ...btn('transparent', tone, `1px solid ${tone}`), padding: '8px 12px' }}>
            {refundOpen ? 'Hide' : 'See refund'} <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: refundOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>
        {refundOpen && (<>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#1A0A00', lineHeight: 1.45 }}>
            {title} ({booking.booking_number}): {formatPeso(booking.weather_refund)} {sent ? 'was sent to you' : 'will be sent to your GCash'}.
          </p>
          {sent && booking.weather_refund_ref && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7A3A18', overflowWrap: 'anywhere' }}>Reference: {booking.weather_refund_ref}</p>}
          {sent && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="text-link" onClick={() => downloadRefundReceipt(booking).catch((e) => toast.error("Couldn't make your refund receipt", e?.message))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                <Download size={13} /> Download refund receipt
              </button>
              {booking.weather_refund_proof && <RefundProofLink path={booking.weather_refund_proof} />}
            </div>
          )}
          {sent && booking.weather_refund_method !== 'gcash' && /ref_[A-Za-z0-9]+/.test(booking.weather_refund_ref || '') && <RefundStatus bookingId={booking.id} />}
          {sent && <RefundConfirm booking={booking} onChanged={onChanged} />}
        </>)}
      </section>
    );
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
            <NiceSelect aria-label="Choose a date" value={pick} onChange={(e) => setPick(e.target.value)} style={{
              flex: '1 1 200px', minWidth: 0, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 12, padding: '10px 12px',
              fontSize: 16, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit',
            }}>
              <option value="" disabled>Choose a date…</option>
              {dates.map((d) => {
                const fits = d.available_slots >= (booking.slots_booked || 1);
                return <option key={d.id} value={d.id} disabled={!fits}>{formatYmdRange(d.start_date, d.end_date)} · {fits ? `${d.available_slots} slots left` : 'full'}</option>;
              })}
            </NiceSelect>
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
