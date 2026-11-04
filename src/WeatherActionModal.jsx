import React, { useState } from 'react';
import { CloudRain, X, Loader2, CalendarClock, Ban } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatYmdRange, addDaysYmd } from './dateRange';
import { todayManila } from './tourUtils';
import NiceSelect from './ui/NiceSelect';
import NiceDate from './ui/NiceDate';

// ─────────────────────────────────────────────
// Bad weather (main admin): postpone or cancel one tour date.
//   Postpone: new start/end dates; joiners have 48 hours to keep their slot
//     on the new date, move to another date or take a 50% refund.
//   Cancel: the date closes; joiners have 48 hours to move to another date
//     of the same tour or take a 50% refund.
//   Both: no choice in 48 hours = 50% refund.
// Both post a pinned 📢 notice in the tour's group chat and notify the joiners
// (weather_postpone / weather_cancel in the 20261204 update).
//   date: { id, title, start_date, end_date, current_booked }
// ─────────────────────────────────────────────

const WEATHER_REASONS = [
  'Typhoon (PAGASA signal)',
  'Heavy rain / flooding',
  'Road closure or landslide',
  'Trail or park closed (DENR / LGU)',
  'Other safety concern',
];

const label = { display: 'block', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', marginBottom: 6 };
const input = {
  width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12,
  padding: '11px 12px', fontSize: 16, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};

const WeatherActionModal = ({ date, onClose, onDone }) => {
  const [action, setAction] = useState('postpone');
  const [reason, setReason] = useState(WEATHER_REASONS[0]);
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const tomorrow = addDaysYmd(todayManila(), 1);
  // Only later days: the new date starts after this tour's current date.
  const afterTour = date?.start_date ? addDaysYmd(date.start_date, 1) : tomorrow;
  const earliest = afterTour > tomorrow ? afterTour : tomorrow;
  const length = date?.start_date && date?.end_date ? Math.round((new Date(date.end_date) - new Date(date.start_date)) / 86400000) : 0;
  const booked = Number(date?.current_booked) || 0;
  const ready = action === 'cancel' || (start && end && end >= start);

  const submit = async () => {
    if (!ready || busy) return;
    const isCancel = action === 'cancel';
    const why = `${reason}${note.trim() ? ` (${note.trim()})` : ''}`;
    if (!(await confirmDialog(isCancel ? {
      title: `Cancel ${date.title} on ${formatYmdRange(date.start_date, date.end_date)}?`,
      message: `Reason: ${why}.\n\nThe date closes. ${booked ? `The ${booked} booked joiner${booked === 1 ? '' : 's'} get a notice and a pinned message in the group chat, and have 48 hours to move to another date of this tour or take a 50% refund. No choice in 48 hours = 50% refund.` : 'Nobody is booked on it yet.'}`,
      confirmLabel: 'Cancel This Date', cancelLabel: 'Go Back', tone: 'danger',
    } : {
      title: `Postpone to ${formatYmdRange(start, end)}?`,
      message: `Reason: ${why}.\n\n${booked ? `The ${booked} booked joiner${booked === 1 ? '' : 's'} get a notice and a pinned message in the group chat, and have 48 hours to keep their slot on the new date, move to another date of this tour or take a 50% refund. No choice in 48 hours = 50% refund.` : 'Nobody is booked on it yet.'}`,
      confirmLabel: 'Postpone', cancelLabel: 'Go Back',
    }))) return;
    setBusy(true);
    const { error } = isCancel
      ? await supabase.rpc('weather_cancel', { p_tour_id: date.id, p_reason: reason, p_note: note.trim() || null })
      : await supabase.rpc('weather_postpone', { p_tour_id: date.id, p_start: start, p_end: end, p_reason: reason, p_note: note.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(isCancel ? "Couldn't cancel the date" : "Couldn't postpone the date",
        /weather_(cancel|postpone)|function .* does not exist/i.test(error.message) ? 'Install the 20261204 database update first (install_updates.sql).' : error.message);
      return;
    }
    toast.success(isCancel ? 'Date cancelled' : 'Date postponed', 'The joiners were notified and the group chat has a pinned notice.');
    onDone?.();
    onClose();
  };

  const choice = (key, Icon, title, sub) => (
    <button type="button" onClick={() => setAction(key)} aria-pressed={action === key} style={{
      flex: '1 1 180px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 14, padding: '12px 14px',
      background: action === key ? (key === 'cancel' ? 'rgba(140,47,28,0.1)' : 'rgba(180,81,30,0.1)') : '#FDF6EE',
      border: `2px solid ${action === key ? (key === 'cancel' ? '#8C2F1C' : '#B4511E') : 'rgba(180,81,30,0.18)'}`,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}><Icon size={16} /> {title}</span>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A3A18', marginTop: 3, lineHeight: 1.45 }}>{sub}</span>
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10060, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="weather-title" style={{
        position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 520, maxHeight: '92dvh', overflowY: 'auto',
        borderRadius: 24, borderTop: '6px solid #3F5D62', boxShadow: '0 32px 80px rgba(26,10,0,0.4)', padding: '1.5rem', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(180,81,30,0.2)', background: '#FDF6EE', color: '#7A3A18', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        <div style={{ paddingRight: 40 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#3F5D62', display: 'flex', alignItems: 'center', gap: 6 }}><CloudRain size={15} /> Weather &amp; safety</p>
          <h2 id="weather-title" style={{ margin: '6px 0 2px', fontSize: 19, fontWeight: 900, color: '#1A0A00' }}>{date.title}</h2>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>{formatYmdRange(date.start_date, date.end_date)} · {booked} booked</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {choice('postpone', CalendarClock, 'Postpone', 'Move this date to new days. Joiners keep their slot, move to another date or get a 50% refund.')}
          {choice('cancel', Ban, 'Cancel this date', 'Joiners move to another date or get a 50% refund.')}
        </div>

        <div>
          <label style={label} htmlFor="weather-reason">Reason</label>
          <NiceSelect id="weather-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            {WEATHER_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </NiceSelect>
        </div>
        <div>
          <label style={label} htmlFor="weather-note">Note for the joiners (optional)</label>
          <input id="weather-note" value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Signal No. 2 over Rizal" style={input} />
        </div>

        {action === 'postpone' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
            <div>
              <label style={label} htmlFor="weather-start">New start date</label>
              <NiceDate id="weather-start" min={earliest} value={start} style={input}
                onChange={(e) => { const v = e.target.value; setStart(v); if (v) setEnd(addDaysYmd(v, length)); }} />
            </div>
            <div>
              <label style={label} htmlFor="weather-end">New end date</label>
              <NiceDate id="weather-end" min={start || earliest} max={start ? addDaysYmd(start, 6) : undefined} value={end} style={input}
                onChange={(e) => setEnd(e.target.value)} />
            </div>
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, fontWeight: 700, color: '#7A3A18' }}>
              Only later days: the new date must start after {formatYmdRange(date.start_date, date.start_date)}.
            </p>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#3F5D62', background: 'rgba(63,93,98,0.08)', borderRadius: 12, padding: '10px 12px', lineHeight: 1.55 }}>
          {action === 'cancel'
            ? 'Joiners get a notice, and a pinned 📢 message goes into the group chat. They have 48 hours to move to another date of this tour (and its group chat) or take a 50% refund; no choice = 50% refund. The chat stays open 7 days for questions. Refunds to send show in Booking Management.'
            : 'Joiners get a notice, and a pinned 📢 message goes into the group chat. They have 48 hours to keep their slot on the new date (payment and pickup point carry over), move to another date of this tour or take a 50% refund; no choice = 50% refund.'}
        </p>

        <button type="button" onClick={submit} disabled={!ready || busy} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 18px', borderRadius: 14, border: 'none',
          background: action === 'cancel' ? '#8C2F1C' : '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 12,
          letterSpacing: '0.1em', textTransform: 'uppercase', cursor: !ready || busy ? 'not-allowed' : 'pointer', opacity: ready ? 1 : 0.5,
        }}>
          {busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : action === 'cancel' ? <Ban size={16} /> : <CalendarClock size={16} />}
          {action === 'cancel' ? 'Cancel this date' : 'Postpone'}
        </button>
      </div>
    </div>
  );
};

export default WeatherActionModal;
