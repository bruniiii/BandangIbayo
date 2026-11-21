import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import PrettySelect from './PrettySelect';
import { STATUS_COLORS } from './statusColors';

// ─────────────────────────────────────────────
// Filter by status: a row of chips (the same look as ui/ChipTabs), each with
// its status color as a dot, and a count. On phones the row becomes one menu (☰) to save space.
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
        <Menu size={18} color="var(--ib-rust, #7A3A18)" aria-hidden="true" />
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
            className={on ? 'chip-tab is-on' : 'chip-tab'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 38, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5,
              background: on ? 'var(--ib-ink, #1A0A00)' : 'var(--ib-surface, #FFFDF9)', color: on ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-brown, #5C2A10)',
              border: `1px solid ${on ? 'var(--ib-dark, #1A0A00)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.22)'}`,
              boxShadow: on ? '0 6px 16px rgba(var(--ib-shadow-rgb, 26,10,0), 0.15)' : 'none',
            }}
          >
            {tone && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: tone.dot, flexShrink: 0, boxShadow: on ? '0 0 0 2px rgba(255,255,255,0.35)' : 'none' }} />}
            {labelOf(st)}
            <span style={{
              minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900,
              background: on ? 'var(--ib-amber, #E8A265)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.12)', color: on ? 'var(--ib-ink, #1A0A00)' : 'var(--ib-brown, #5C2A10)',
            }}>{count(st)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default StatusFilter;
