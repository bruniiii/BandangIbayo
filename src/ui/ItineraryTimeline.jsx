import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { dateOfDay, shortDate } from '../itinerary';

// Itinerary text ("Day 1:" headers + "TIME – Activity" or "START – END –
// Activity" lines) as timeline rows grouped by day. Each day opens and
// closes by tapping its header; the first day starts open.
// startDate: the tour date's first day, so each "Day N" also shows its date
// (Day 0 is the day before).

// A leading time or time range (e.g. "04:00 AM", "08:15 AM – 11:00 AM", or the
// Filipino "12:00nn"/"12:00mn"), then ":" or "-"/"–", then the activity.
const TIME_PREFIX_RE = /^(\d{1,2}:\d{2}\s?(?:[AP]M|nn|mn)(?:\s*[–-]\s*\d{1,2}:\d{2}\s?(?:[AP]M|nn|mn))?)\s*[:–-]\s*(.+)$/i;
const isDayHeader = (line) => /^day\b/i.test(line);

const parseDays = (text) => {
  const days = [];
  let current = null;
  (text || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((line) => {
    if (isDayHeader(line)) {
      current = { label: line.replace(/:$/, ''), items: [] };
      days.push(current);
      return;
    }
    if (!current) {
      current = { label: null, items: [] };
      days.push(current);
    }
    const match = line.match(TIME_PREFIX_RE);
    current.items.push(match
      ? { time: match[1].replace(/\s*[–-]\s*/g, ' – ').trim(), activity: match[2].trim() }
      : { time: null, activity: line });
  });
  return days;
};

const Items = ({ items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
    {items.map((item, i) => (
      <div key={i} style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: 'rgba(180,81,30,0.06)', borderRadius: 12, padding: '9px 12px', maxWidth: '100%',
      }}>
        {item.time && (
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 900, color: '#A8481A',
            background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)',
            borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
          }}>{item.time}</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item.activity}</span>
      </div>
    ))}
  </div>
);

// "Day 2" → "Day 2 · Sat, Oct 26" when the tour's start date is known.
const withDate = (label, startDate) => {
  const m = /^day\s*(\d+)$/i.exec(label.trim());
  return m && startDate ? `${label} · ${shortDate(dateOfDay(startDate, Number(m[1])))}` : label;
};

const ItineraryTimeline = ({ text, startDate = null }) => {
  const days = parseDays(text);
  const [open, setOpen] = useState(() => new Set([0]));

  if (days.length === 0) {
    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>N/A</p>;
  }

  const toggle = (i) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {days.map((day, i) => {
        // Lines before any "Day" header show as they are.
        if (!day.label) return <Items key={i} items={day.items} />;
        const isOpen = open.has(i);
        return (
          <div key={i} style={{ border: '1px solid rgba(180,81,30,0.16)', borderRadius: 14, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '10px 12px', background: isOpen ? 'rgba(180,81,30,0.06)' : 'transparent',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{
                display: 'inline-block', background: '#1A0A00', color: '#FDF6EE',
                borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 900,
                letterSpacing: '0.15em', textTransform: 'uppercase',
              }}>{withDate(day.label, startDate)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: '#7A3A18', whiteSpace: 'nowrap' }}>
                {day.items.length} {day.items.length === 1 ? 'stop' : 'stops'}
                <ChevronDown size={16} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </span>
            </button>
            {isOpen && day.items.length > 0 && (
              <div style={{ padding: '4px 12px 12px' }}><Items items={day.items} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ItineraryTimeline;
