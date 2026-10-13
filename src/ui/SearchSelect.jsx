import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

// ─────────────────────────────────────────────
// SEARCHABLE DROPDOWN for long lists (provinces, cities, barangays, tours…).
// Type to filter ("bag" → Baguio City) or open the list and scroll.
// Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
// The text box carries `name`, so it works inside plain <form>s; typing
// something that isn't on the list blocks submitting until it's fixed.
// ─────────────────────────────────────────────

const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MAX_SHOWN = 200;

const SearchSelect = ({
  id, name, value, options, onChange, placeholder = 'Type to search…',
  disabled = false, required = false, style, emptyText = 'No matches', ariaLabel,
}) => {
  const autoId = useId();
  const inputId = id || `ss-${autoId}`;
  const listId = `${inputId}-list`;
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Follow changes from the parent (e.g. city cleared when the province changes).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value || '');
  }

  const matches = useMemo(() => {
    const q = fold(query);
    // When the box shows the current choice, list everything so the user can scroll.
    if (!q || (value && fold(value) === q)) return options;
    const starts = [], contains = [];
    for (const o of options) {
      const f = fold(o);
      if (f.startsWith(q)) starts.push(o);
      else if (f.includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  }, [query, options, value]);

  const exact = (text) => options.find((o) => fold(o) === fold(text));

  // Text that isn't on the list can't be submitted.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setCustomValidity(query && !exact(query) ? 'Please choose an option from the list.' : '');
  });

  const choose = (option) => {
    setQuery(option);
    setOpen(false);
    if (option !== value) onChange(option);
  };

  const onBlur = () => {
    // Let a click on an option land first.
    setTimeout(() => {
      setOpen(false);
      const match = exact(query);
      if (match) { if (match !== value) onChange(match); setQuery(match); }
      else if (!query && value) onChange('');
    }, 120);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.min(matches.length, MAX_SHOWN) - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const shown = matches.slice(0, MAX_SHOWN);

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(Math.max(0, matches.indexOf(value))); }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        style={{ ...style, paddingRight: 64, cursor: disabled ? 'not-allowed' : 'text' }}
      />
      <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
        {query && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            className="no-touch-size"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(''); onChange(''); setOpen(true); inputRef.current?.focus(); }}
            style={iconBtn}
          >
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          aria-label={open ? 'Close list' : 'Show all options'}
          className="no-touch-size"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
          style={{ ...iconBtn, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
      </div>

      {open && !disabled && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{
            position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', margin: 0, padding: 4,
            listStyle: 'none', maxHeight: 260, overflowY: 'auto', background: '#FFFDF9',
            border: '1px solid rgba(196,92,38,0.25)', borderRadius: 12, boxShadow: '0 12px 30px rgba(26,10,0,0.15)',
          }}
        >
          {shown.length === 0 && <li style={{ padding: '12px', fontSize: 13, color: '#7A3A18' }}>{emptyText}</li>}
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '0 12px', minHeight: 44, display: 'flex', alignItems: 'center', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, fontWeight: o === value ? 800 : 600, color: '#1A0A00',
                background: i === active ? 'rgba(196,92,38,0.12)' : 'transparent',
              }}
            >
              {o}
            </li>
          ))}
          {matches.length > MAX_SHOWN && (
            <li style={{ padding: '8px 12px', fontSize: 12, color: '#7A3A18' }}>Keep typing to narrow down {matches.length} results…</li>
          )}
        </ul>
      )}
    </div>
  );
};

const iconBtn = {
  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', color: '#7A3A18', cursor: 'pointer', borderRadius: 8, padding: 0,
};

export default SearchSelect;
