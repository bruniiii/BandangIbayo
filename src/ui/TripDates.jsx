import { Calendar } from 'lucide-react';
import { formatDateRange } from '../tourUtils';

// Dates of one trip (see groupTripDates in tourUtils.js).

const slotsText = (d) => ((d.available_slots ?? 1) <= 0 ? 'Full' : `${d.available_slots} slot${d.available_slots === 1 ? '' : 's'} left`);

// Date buttons in a booking window: the joiner taps the date they want.
export const TripDatePicker = ({ dates, activeId, onPick, dark = false, disabled = false }) => (
  <div>
    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(232,210,190,0.85)' : '#7A3A18', margin: '0 0 8px' }}>
      Pick a date · {dates.length} available
    </p>
    <div role="radiogroup" aria-label="Tour dates" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {dates.map((d) => {
        const active = String(d.id) === String(activeId);
        const full = (d.available_slots ?? 1) <= 0;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onPick(d.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '10px 12px', borderRadius: 12, cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'inherit', textAlign: 'left',
              border: active ? '2px solid #B4511E' : `1px solid ${dark ? 'rgba(253,246,238,0.2)' : 'rgba(180,81,30,0.25)'}`,
              background: active ? (dark ? 'rgba(180,81,30,0.35)' : '#FDF6EE') : (dark ? 'rgba(253,246,238,0.06)' : 'rgba(253,246,238,0.5)'),
              color: dark ? '#FDF6EE' : '#1A0A00',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}>
              <span aria-hidden="true" style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
                border: `2px solid ${active ? '#B4511E' : dark ? 'rgba(253,246,238,0.5)' : 'rgba(122,58,24,0.5)'}`,
                background: active ? 'radial-gradient(circle, #B4511E 45%, transparent 50%)' : 'transparent',
              }} />
              {formatDateRange(d.start_date, d.duration)}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', color: full ? (dark ? '#E8A265' : '#8C2F1C') : dark ? 'rgba(232,210,190,0.9)' : '#7A3A18' }}>
              {slotsText(d)}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// Date lines on a tour card: up to `max` dates, then "+N more dates".
export const TripDateLines = ({ dates, max = 3, showSlots = true, fontSize = 11.5 }) => {
  const shown = dates.slice(0, max);
  const more = dates.length - shown.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {shown.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize, fontWeight: 700, color: '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <Calendar size={12} style={{ color: '#A8481A', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>{formatDateRange(d.start_date, d.duration)}</span>
          {showSlots && (
            <span style={{ fontSize: fontSize - 0.5, letterSpacing: '0.06em', color: (d.available_slots ?? 1) <= 0 ? '#8C2F1C' : '#7A3A18', whiteSpace: 'nowrap' }}>{slotsText(d)}</span>
          )}
        </div>
      ))}
      {more > 0 && (
        <span style={{ fontSize: fontSize - 0.5, fontWeight: 800, color: '#A8481A', letterSpacing: '0.06em', paddingLeft: 19 }}>+{more} more date{more === 1 ? '' : 's'}</span>
      )}
    </div>
  );
};
