import React, { useEffect, useId, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import PrettySelect from './PrettySelect';

// ─────────────────────────────────────────────
// A drop-in for <input type="date">, in the look of the site's dropdowns:
// a box with a calendar icon that opens a small calendar.
//   <NiceDate value="2027-01-04" min="…" max="…" onChange={(e) => set(e.target.value)} />
// - Dates are 'YYYY-MM-DD' strings (like the browser's date box).
// - onChange gets { target: { value, name } }.
// - name: a hidden input carries the value, so forms read it (FormData) and
//   field errors can point at it (validation.js flagField).
// - defaultValue works too (it then keeps its own value).
// - Far-apart min/max (e.g. a date of birth) add a year list to the calendar.
// ─────────────────────────────────────────────

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const nice = (v) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const LAYOUT = ['flex', 'width', 'minWidth', 'maxWidth', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'alignSelf', 'gridColumn'];

const NiceDate = ({ value, defaultValue, onChange, min = '', max = '', name, id, disabled = false, placeholder = 'Choose a date', style = {}, required = false, clearable, ...rest }) => {
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue || '');
  const current = (controlled ? value : own) || '';
  const autoId = useId();
  const btnId = id || `nd-${autoId}`;
  const wrapRef = useRef(null);
  const hiddenRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const start = current || (min && todayYmd() < min ? min : max && todayYmd() > max ? max : todayYmd());
  const [view, setView] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const openCal = () => {
    if (disabled) return;
    const s = current || start;
    setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });
    const box = wrapRef.current?.getBoundingClientRect();
    const below = box ? window.innerHeight - box.bottom : 999;
    setUpward(below < 360 && (box?.top || 0) > below);
    setOpen(true);
  };

  const emit = (v) => {
    if (!controlled) setOwn(v);
    onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
    // Tell the form the person changed it (unsaved changes, required checks, error reset).
    setTimeout(() => {
      const el = hiddenRef.current;
      if (el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 0);
  };
  const pick = (d) => { emit(d); setOpen(false); };

  const shift = (delta) => setView(({ y, m }) => {
    const n = new Date(Date.UTC(y, m + delta, 1));
    return { y: n.getUTCFullYear(), m: n.getUTCMonth() };
  });
  const monthKey = ymd(view.y, view.m, 1).slice(0, 7);
  const canBack = !min || monthKey > min.slice(0, 7);
  const canNext = !max || monthKey < max.slice(0, 7);
  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => ymd(view.y, view.m, i + 1))];
  const today = todayYmd();

  // A year list when the allowed dates span years (date of birth, far-off trips).
  const minY = min ? Number(min.slice(0, 4)) : view.y - 100;
  const maxY = max ? Number(max.slice(0, 4)) : view.y + 5;
  const years = maxY - minY >= 2 ? Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i) : null;

  const wrapStyle = { position: 'relative', minWidth: 0 };
  LAYOUT.forEach((k) => { if (style[k] !== undefined) wrapStyle[k] = style[k]; });
  const showClear = (clearable ?? !required) && current && !disabled;
  const invalid = rest['aria-invalid'] === true || rest['aria-invalid'] === 'true';

  return (
    <div ref={wrapRef} style={wrapStyle}>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={current} data-required={required ? 'true' : undefined} />}
      <button
        type="button" id={btnId} disabled={disabled} onClick={() => (open ? setOpen(false) : openCal())}
        aria-haspopup="dialog" aria-expanded={open} aria-label={rest['aria-label'] ? `${rest['aria-label']}${current ? `: ${nice(current)}` : ''}` : undefined}
        style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          background: '#FDF6EE', padding: '10px 12px', borderRadius: 14, fontFamily: 'inherit', minHeight: 46,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
          border: `1px solid ${invalid ? '#8C2F1C' : open ? '#B4511E' : 'rgba(180,81,30,0.18)'}`,
          boxShadow: open ? '0 0 0 3px rgba(180,81,30,0.14)' : 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: current ? '#B4511E' : 'rgba(180,81,30,0.1)', color: current ? '#FDF6EE' : '#A8481A' }}>
          <Calendar size={14} />
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 800, color: current ? '#1A0A00' : '#7A3A18' }}>
          {current ? nice(current) : placeholder}
        </span>
        <ChevronDown size={16} style={{ flexShrink: 0, color: '#A8481A', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose a date" style={{
          position: 'absolute', zIndex: 60, ...(upward ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }), left: 0,
          width: 296, maxWidth: 'calc(100vw - 40px)', boxSizing: 'border-box',
          background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16,
          boxShadow: '0 18px 40px rgba(26,10,0,0.18)', padding: 12, animation: 'ps-in 0.14s ease-out',
        }}>
          <style>{'@keyframes ps-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }'}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <button type="button" className="no-touch-size" onClick={() => shift(-1)} disabled={!canBack} aria-label="Previous month" style={navBtn(!canBack)}><ChevronLeft size={16} /></button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{MONTHS[view.m]}</span>
              {years ? (
                <div style={{ width: 96 }}>
                  <PrettySelect compact ariaLabel="Year" value={String(view.y)} options={years.map((y) => ({ value: String(y), label: String(y) }))}
                    onChange={(y) => setView((v) => ({ ...v, y: Number(y) }))} />
                </div>
              ) : <span style={{ fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{view.y}</span>}
            </div>
            <button type="button" className="no-touch-size" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month" style={navBtn(!canNext)}><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {WEEKDAYS.map((w) => <span key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 900, color: '#A8481A', padding: '4px 0' }}>{w}</span>)}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const off = (min && d < min) || (max && d > max);
              const sel = d === current;
              return (
                <button key={d} type="button" className="no-touch-size" disabled={off} onClick={() => pick(d)} aria-pressed={sel}
                  aria-label={nice(d)}
                  style={{
                    height: 34, borderRadius: 10, border: d === today && !sel ? '1px solid rgba(180,81,30,0.45)' : '1px solid transparent',
                    background: sel ? '#B4511E' : 'transparent', color: sel ? '#FDF6EE' : off ? 'rgba(122,58,24,0.3)' : '#1A0A00',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: sel ? 900 : 700, cursor: off ? 'not-allowed' : 'pointer', padding: 0,
                  }}>{Number(d.slice(8))}</button>
              );
            })}
          </div>
          {showClear && (
            <button type="button" className="no-touch-size" onClick={() => pick('')} style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
              color: '#A8481A', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}><X size={13} /> Clear</button>
          )}
        </div>
      )}
    </div>
  );
};

const navBtn = (off) => ({
  width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(180,81,30,0.18)', background: '#FDF6EE', color: '#A8481A',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.35 : 1, padding: 0, flexShrink: 0,
});

export default NiceDate;
