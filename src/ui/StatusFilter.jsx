import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import PrettySelect from './PrettySelect';
import { STATUS_COLORS } from './statusColors';

// ─────────────────────────────────────────────
// Filter by status: a row of chips, each with its status color (dot + count)
// as a legend. On phones the row becomes one menu (☰) to save space.
//   <StatusFilter statuses={['All', 'For Approval', …]} value={f} onChange={setF} count={(st) => n} />
// ─────────────────────────────────────────────

const useNarrow = (px = 640) => {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setNarrow(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [q]);
  return narrow;
};

const labelOf = (st) => (st === 'All Status' ? 'All' : st);

const StatusFilter = ({ statuses, value, onChange, count, style }) => {
  const narrow = useNarrow();
  if (narrow) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
        <Menu size={18} color="#7A3A18" aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <PrettySelect
            ariaLabel="Filter by status"
            value={value}
            onChange={onChange}
            options={statuses.map((st) => ({ value: st, label: `${STATUS_COLORS[st] ? '● ' : ''}${labelOf(st)} (${count(st)})` }))}
          />
        </div>
      </div>
    );
  }
  return (
    <div role="tablist" aria-label="Filter by status" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...style }}>
      {statuses.map((st) => {
        const on = value === st;
        const tone = STATUS_COLORS[st];
        return (
          <button
            key={st} type="button" role="tab" aria-selected={on} onClick={() => onChange(st)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 13px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: on ? (tone?.bg || '#1A0A00') : '#FDF6EE', color: on ? (tone?.color || '#FDF6EE') : '#5C2A10',
              border: `${on ? 2 : 1}px solid ${on ? (tone?.dot || '#1A0A00') : 'rgba(180,81,30,0.25)'}`,
              boxShadow: on ? '0 6px 16px rgba(26,10,0,0.12)' : 'none', transition: 'background 0.15s, color 0.15s',
            }}
          >
            {tone && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />}
            {labelOf(st)}
            <span style={{
              minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, letterSpacing: 0, background: tone ? tone.bg : 'rgba(180,81,30,0.12)', color: tone ? tone.color : '#5C2A10',
              border: on && tone ? `1px solid ${tone.dot}` : 'none',
            }}>{count(st)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default StatusFilter;
