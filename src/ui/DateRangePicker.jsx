import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatYmdRange, addDaysYmd } from '../dateRange';

// A calendar for picking trip dates: tap the first day, then the last day.
// Tapping the same day twice makes it a one-day trip. Days before `min`
// can't be picked, and with maxDays the last day can be at most that many
// days from the first (counting both). Dates are 'YYYY-MM-DD' strings.

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

const DateRangePicker = ({ name, start, end, min, maxDays = null, onChange, style }) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState('');
  const first = start || min;
  const [view, setView] = useState(() => ({ y: Number(first.slice(0, 4)), m: Number(first.slice(5, 7)) - 1 }));
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  // A day past maxDays from the first day starts the trip over from that day.
  const pick = (day) => {
    const tooLong = !!(maxDays && start && day > addDaysYmd(start, maxDays - 1));
    if (!start || end || day < start || tooLong) {
      onChange({ start: day, end: '' });
    } else {
      onChange({ start, end: day });
      setOpen(false);
    }
  };

  const shift = (delta) => setView(({ y, m }) => {
    const n = new Date(Date.UTC(y, m + delta, 1));
    return { y: n.getUTCFullYear(), m: n.getUTCMonth() };
  });
  const minMonth = min.slice(0, 7);
  const canGoBack = ymd(view.y, view.m, 1).slice(0, 7) > minMonth;

  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => ymd(view.y, view.m, i + 1))];
  const rangeEnd = end || (start && hover > start ? hover : '');

  const label = start ? `${formatYmdRange(start, end)}${end ? '' : ' – pick the last day'}` : 'Select your trip dates';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        name={name}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          ...style, width: '100%', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          color: start ? '#1A0A00' : 'rgba(122,58,24,0.75)',
          border: `1px solid ${open ? '#B4511E' : 'rgba(180,81,30,0.18)'}`,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <Calendar size={16} style={{ color: '#A8481A', flexShrink: 0 }} />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose trip dates" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50,
          width: 300, maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box',
          background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.22)', borderRadius: 18,
          boxShadow: '0 18px 44px rgba(26,10,0,0.22)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={() => shift(-1)} disabled={!canGoBack} aria-label="Previous month" style={navBtn(!canGoBack)}><ChevronLeft size={16} /></button>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 13.5, color: '#1A0A00' }}>{MONTHS[view.m]} {view.y}</p>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" style={navBtn(false)}><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }} onMouseLeave={() => setHover('')}>
            {WEEKDAYS.map((w) => (
              <span key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: '#7A3A18', padding: '4px 0' }}>{w}</span>
            ))}
            {cells.map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const disabled = day < min;
              const isEdge = day === start || day === end;
              const inRange = start && rangeEnd && day > start && day < rangeEnd;
              const isHoverEnd = !end && day === rangeEnd;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(day)}
                  onMouseEnter={() => setHover(day)}
                  aria-pressed={isEdge}
                  aria-label={day}
                  style={{
                    height: 36, border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
                    cursor: disabled ? 'default' : 'pointer',
                    background: isEdge ? '#B4511E' : inRange || isHoverEnd ? 'rgba(180,81,30,0.16)' : 'transparent',
                    color: isEdge ? '#FDF6EE' : disabled ? 'rgba(122,58,24,0.3)' : '#1A0A00',
                  }}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#7A3A18' }}>
              {!start ? 'Tap the first day of your trip' : !end ? 'Now tap the last day' : 'Trip dates set'}
            </p>
            {start && (
              <button type="button" onClick={() => onChange({ start: '', end: '' })} className="text-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'inherit' }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const navBtn = (disabled) => ({
  width: 32, height: 32, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: disabled ? 'transparent' : 'rgba(180,81,30,0.1)', color: disabled ? 'rgba(122,58,24,0.3)' : '#A8481A',
  cursor: disabled ? 'default' : 'pointer',
});

export default DateRangePicker;
