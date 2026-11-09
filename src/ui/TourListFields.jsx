import React, { useRef, useState } from 'react';
import { Trash2, Plus, Pencil, ChevronUp, ChevronDown, Check, X, Clock } from 'lucide-react';
import { itineraryDays, shortDate, parseStops, formatStops, insertStop, formatStopTime } from '../itinerary';

// ─────────────────────────────────────────────
// Tour form fields (admin):
//  - ListField: type one item, click ADD; each item can be removed. Used for
//    Inclusions, Exclusions, Things to Bring and Pickup Points.
//  - ItineraryField: each day (Day 0 = the day before the tour, then every
//    tour date) is a list of stops: pick a time, type the activity (or tap a
//    quick stop), click Add. Stops can be edited, moved up/down or removed.
//    Saved in the same text as before ("10:00 PM – Meet up…" per line).
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
// Common stops: one tap fills the activity (and adds it right away when a time is picked).
const QUICK_STOPS = [
  'Meet-up at the pickup point', 'Departure', 'Travel overnight', 'Arrival', 'Breakfast', 'Lunch', 'Dinner',
  'Check-in', 'Check-out', 'Free time', 'Photo stop', 'Start the hike', 'Back at the jump-off', 'Travel back to Manila',
];

const DayStops = ({ day, text, onChange }) => {
  const stops = parseStops(text);
  const [time, setTime] = useState('');
  const [activity, setActivity] = useState('');
  const [editing, setEditing] = useState(null); // index of the stop being changed
  const [showQuick, setShowQuick] = useState(false);
  const timeRef = useRef(null);
  const textRef = useRef(null);
  const save = (list) => onChange(formatStops(list));
  const reset = () => { setTime(''); setActivity(''); setEditing(null); };

  const add = (label = activity) => {
    const v = String(label || '').trim();
    if (!v) { textRef.current?.focus(); return; }
    if (editing != null) {
      const list = stops.filter((_, i) => i !== editing);
      const old = stops[editing];
      // A changed time puts it back in time order; otherwise it stays in place.
      save(time === old.start ? [...list.slice(0, editing), { ...old, text: v }, ...list.slice(editing)] : insertStop(list, { start: time, end: time === old.start ? old.end : '', text: v }));
    } else {
      save(insertStop(stops, { start: time, end: '', text: v }));
    }
    reset();
  };
  const quick = (label) => {
    if (time && editing == null) { add(label); return; }
    setActivity(label);
    if (!time) timeRef.current?.focus();
  };
  const move = (i, d) => {
    const list = [...stops];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    save(list);
  };
  const edit = (i) => { setEditing(i); setTime(stops[i].start); setActivity(stops[i].text); textRef.current?.focus(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stops.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stops.map((st, i) => (
            <li key={`${i}-${st.start}-${st.text}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, background: editing === i ? 'rgba(232,162,101,0.25)' : '#FDF6EE', borderRadius: 12,
              border: `1px solid ${editing === i ? '#B4511E' : 'rgba(180,81,30,0.16)'}`, padding: '6px 6px 6px 10px', flexWrap: 'wrap',
            }}>
              <span style={{ flexShrink: 0, minWidth: 74, fontSize: 12, fontWeight: 900, color: st.start ? '#B4511E' : '#9C7A62', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} /> {st.start ? (st.end ? `${formatStopTime(st.start)} – ${formatStopTime(st.end)}` : formatStopTime(st.start)) : 'No time'}
              </span>
              <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1A0A00', overflowWrap: 'anywhere' }}>{st.text}</span>
              <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button type="button" onClick={() => move(i, -1)} aria-label={`Move "${st.text}" up`} style={{ ...iconBtn, visibility: i === 0 ? 'hidden' : 'visible' }}><ChevronUp size={15} /></button>
                <button type="button" onClick={() => move(i, 1)} aria-label={`Move "${st.text}" down`} style={{ ...iconBtn, visibility: i === stops.length - 1 ? 'hidden' : 'visible' }}><ChevronDown size={15} /></button>
                <button type="button" onClick={() => edit(i)} aria-label={`Change "${st.text}"`} style={iconBtn}><Pencil size={14} /></button>
                <button type="button" onClick={() => { save(stops.filter((_, j) => j !== i)); if (editing === i) reset(); }} aria-label={`Remove "${st.text}"`} style={{ ...iconBtn, color: '#8C2F1C' }}><Trash2 size={14} /></button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Time + activity + Add (or Save when changing a stop). */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input ref={timeRef} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={`Day ${day} stop time`}
          style={{ ...inputStyle, width: 130, flex: '0 0 130px' }} />
        <input ref={textRef} id={`itinerary_${day}`} name={`itinerary_${day}`} value={activity} maxLength={200}
          onChange={(e) => setActivity(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape' && editing != null) reset(); }}
          placeholder={day === 0 ? 'e.g. Meet up at the pickup point' : 'e.g. Start the hike'}
          aria-label={`Day ${day} activity`} style={{ ...inputStyle, flex: '1 1 180px', minWidth: 0 }} />
        <button type="button" onClick={() => add()} disabled={!activity.trim()} style={addBtnStyle(!activity.trim())}>
          {editing != null ? <><Check size={14} /> Save</> : <><Plus size={14} /> Add</>}
        </button>
        {editing != null && (
          <button type="button" onClick={reset} aria-label="Cancel changing this stop" style={{ ...iconBtn, width: 40, height: 40 }}><X size={15} /></button>
        )}
      </div>

      {/* Quick stops: hidden until asked for, so the days stay short. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => setShowQuick((v) => !v)} aria-expanded={showQuick} className="no-touch-size" style={{
          padding: '5px 12px', borderRadius: 999, border: 'none', background: showQuick ? '#1A0A00' : 'rgba(180,81,30,0.12)',
          color: showQuick ? '#FDF6EE' : '#7A3A18', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {showQuick ? <X size={12} /> : <Plus size={12} />} Quick stops
        </button>
        {showQuick && QUICK_STOPS.map((q) => (
          <button key={q} type="button" onClick={() => quick(q)} className="no-touch-size" style={{
            padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(180,81,30,0.25)', background: 'transparent',
            color: '#7A3A18', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
          }}>{q}</button>
        ))}
      </div>
    </div>
  );
};

export const ItineraryField = ({ start, end, value, onChange, note }) => {
  const days = itineraryDays(start, end);
  const set = (day, text) => onChange({ ...value, [day]: text });
  return (
    <div>
      <label style={labelStyle}>Itinerary</label>
      {days.length === 0 ? (
        <p style={{ fontSize: 12.5, fontWeight: 700, color: '#8C5216', background: 'rgba(232,162,101,0.2)', borderRadius: 12, padding: '10px 12px', margin: 0 }}>
          Pick the tour's start and end date first. A list for each day will appear here.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 8px' }}>
            For each day: pick a time, type the activity (or tap Quick stops for common ones), then click Add. Stops line up by time; use the arrows to move one.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {days.map(({ day, date }) => (
              <fieldset key={day} style={{ margin: 0, border: '1px solid rgba(180,81,30,0.18)', borderRadius: 16, padding: '12px 14px', background: 'rgba(180,81,30,0.04)', minWidth: 0 }}>
                <legend style={{ padding: '0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: '#1A0A00', color: '#FDF6EE', borderRadius: 999, padding: '3px 12px', fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Day {day}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>{shortDate(date)}{day === 0 ? ' · the day before' : ''}</span>
                </legend>
                <DayStops day={day} text={value[day] || ''} onChange={(t) => set(day, t)} />
              </fieldset>
            ))}
          </div>
        </>
      )}
      {note && <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>{note}</p>}
    </div>
  );
};
