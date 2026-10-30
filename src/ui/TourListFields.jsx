import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { itineraryDays, shortDate } from '../itinerary';

// ─────────────────────────────────────────────
// Tour form fields (admin):
//  - ListField: type one item, click ADD; each item can be removed. Used for
//    Inclusions, Exclusions, Things to Bring and Pickup Points.
//  - ItineraryField: one box per day (Day 0 = the day before the tour, then
//    every tour date).
// ─────────────────────────────────────────────

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase',
  color: '#7A3A18', opacity: 0.9, marginBottom: 5,
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)',
  borderRadius: 14, padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};
const addBtnStyle = (off) => ({
  flexShrink: 0, minHeight: 40, padding: '0 16px', borderRadius: 12, border: 'none', cursor: off ? 'not-allowed' : 'pointer',
  background: off ? 'rgba(180,81,30,0.35)' : '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11,
  letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
});
const iconBtn = {
  width: 32, height: 32, flexShrink: 0, borderRadius: 10, border: '1px solid rgba(122,58,24,0.3)', background: 'transparent',
  color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

// items: array of strings. name: the text box's name (for error bubbles).
// locked: items that can't be removed, with the reason as a tooltip.
export const ListField = ({ label, items, onChange, name, placeholder, maxLength = 200, required = false, locked = {}, hint }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div>
      <label htmlFor={name} style={labelStyle}>{label}{required ? ' *' : ''}</label>
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <li key={`${item}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, background: '#FDF6EE', borderRadius: 12,
              border: '1px solid rgba(180,81,30,0.16)', padding: '6px 6px 6px 14px',
            }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1A0A00', overflowWrap: 'anywhere' }}>{item}</span>
              <button type="button" aria-label={`Remove ${item}`} title={locked[item] || 'Remove'} disabled={!!locked[item]}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                style={{ ...iconBtn, opacity: locked[item] ? 0.4 : 1, cursor: locked[item] ? 'not-allowed' : 'pointer' }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id={name} name={name} value={draft} maxLength={maxLength} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          // Enter adds the item instead of submitting the whole form.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={inputStyle}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} style={addBtnStyle(!draft.trim())}><Plus size={13} /> Add</button>
      </div>
      {hint && <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
};

// value: { [day]: text } (see itinerary.js).
// start / end: the tour's dates (the first date, if the trip has several).
export const ItineraryField = ({ start, end, value, onChange, note }) => {
  const days = itineraryDays(start, end);
  const set = (day, text) => onChange({ ...value, [day]: text });
  return (
    <div>
      <label style={labelStyle}>Itinerary</label>
      {days.length === 0 ? (
        <p style={{ fontSize: 12.5, fontWeight: 700, color: '#8C5216', background: 'rgba(232,162,101,0.2)', borderRadius: 12, padding: '10px 12px', margin: 0 }}>
          Pick the tour's start and end date first. A box for each day will appear here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {days.map(({ day, date }) => (
            <fieldset key={day} style={{ margin: 0, border: '1px solid rgba(180,81,30,0.18)', borderRadius: 16, padding: '12px 14px', background: 'rgba(180,81,30,0.04)', minWidth: 0 }}>
              <legend style={{ padding: '0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#1A0A00', color: '#FDF6EE', borderRadius: 999, padding: '3px 12px', fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Day {day}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>{shortDate(date)}{day === 0 ? ' · the day before' : ''}</span>
              </legend>
              <textarea
                id={`itinerary_${day}`} name={`itinerary_${day}`} rows={3} maxLength={3000}
                aria-label={`Day ${day} itinerary`}
                value={value[day] || ''}
                onChange={(e) => set(day, e.target.value)}
                placeholder={day === 0 ? 'e.g. 10:00 PM – Meet up at the pickup point, travel overnight' : 'e.g. 04:00 AM – Start the hike (one activity per line)'}
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              />
            </fieldset>
          ))}
        </div>
      )}
      {note && <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>{note}</p>}
    </div>
  );
};
