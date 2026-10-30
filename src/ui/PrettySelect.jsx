import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// ─────────────────────────────────────────────
// DROPDOWN with the site's look (instead of the browser's plain grey list).
// options: [{ value, label, hint? }] — hint shows on the right (e.g. a time).
// icon: an optional lucide icon shown before every option.
// Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter picks, Esc closes.
// ─────────────────────────────────────────────

const PrettySelect = ({ id, value, options, onChange, placeholder = 'Choose…', icon: Icon = null, invalid = false, ariaLabel, compact = false }) => {
  const autoId = useId();
  const btnId = id || `ps-${autoId}`;
  const listId = `${btnId}-list`;
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false); // opens above when there's no room below
  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const [active, setActive] = useState(Math.max(0, selectedIndex));
  const selected = options[selectedIndex];

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    const below = box ? window.innerHeight - box.bottom : 999;
    const above = box ? box.top : 0;
    setUpward(below < 280 && above > below);
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  };
  const pick = (o) => { onChange(o.value); setOpen(false); };
  const onKeyDown = (e) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) pick(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
  };

  const pad = compact ? '10px 12px' : '12px 14px';
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" id={btnId} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-invalid={invalid || undefined} aria-label={ariaLabel}
        style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          background: '#FDF6EE', padding: pad, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${invalid ? '#8C2F1C' : open ? '#B4511E' : 'rgba(180,81,30,0.18)'}`,
          boxShadow: open ? '0 0 0 3px rgba(180,81,30,0.14)' : 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {Icon && (
          <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? '#B4511E' : 'rgba(180,81,30,0.1)', color: selected ? '#FDF6EE' : '#A8481A' }}>
            <Icon size={14} />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 800, color: selected ? '#1A0A00' : '#7A3A18' }}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.hint && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, color: '#A8481A', background: 'rgba(180,81,30,0.1)', borderRadius: 999, padding: '3px 9px' }}>{selected.hint}</span>}
        <ChevronDown size={16} style={{ flexShrink: 0, color: '#A8481A', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <ul
          ref={listRef} id={listId} role="listbox" aria-labelledby={btnId}
          style={{
            position: 'absolute', zIndex: 50, ...(upward ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }), left: 0, right: 0, margin: 0, padding: 6, listStyle: 'none',
            background: '#FFFDF9', borderRadius: 16, border: '1px solid rgba(180,81,30,0.2)', boxShadow: '0 18px 40px rgba(26,10,0,0.18)',
            maxHeight: 264, overflowY: 'auto', animation: 'ps-in 0.14s ease-out',
          }}
        >
          <style>{'@keyframes ps-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }'}</style>
          {options.map((o, i) => {
            const isSel = i === selectedIndex;
            const isActive = i === active;
            return (
              <li
                key={o.value} role="option" aria-selected={isSel}
                onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, cursor: 'pointer',
                  background: isSel ? 'rgba(180,81,30,0.12)' : isActive ? 'rgba(242,228,208,0.8)' : 'transparent',
                }}
              >
                {Icon && <Icon size={14} style={{ flexShrink: 0, color: isSel ? '#B4511E' : 'rgba(122,58,24,0.6)' }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: isSel ? 900 : 700, color: isSel ? '#A8481A' : '#1A0A00', overflowWrap: 'anywhere' }}>{o.label}</span>
                {o.hint && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#7A3A18', background: '#F2E4D0', borderRadius: 999, padding: '3px 9px' }}>{o.hint}</span>}
                <Check size={15} style={{ flexShrink: 0, color: '#B4511E', opacity: isSel ? 1 : 0 }} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PrettySelect;
