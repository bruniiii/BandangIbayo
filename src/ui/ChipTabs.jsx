// ─────────────────────────────────────────────
// Tabs as a row of chips: the look of System Maintenance's section buttons,
// used for every switch between views on the admin side (Bookings/Refunds,
// Active/Archive, Day/Month/Year…).
//   <ChipTabs ariaLabel="Tours" value={tab} onChange={setTab}
//     items={[{ value: 'active', label: 'Active Tours', icon: Map }, { value: 'archive', label: 'Tour Archive', icon: History, count: 3 }]} />
// White chips with an orange icon; the chosen one is dark with an amber icon.
// count: a small badge (hidden when 0). alert: the badge in orange (something to do).
// ─────────────────────────────────────────────

const ChipTabs = ({ items, value, onChange, ariaLabel, style, size = 'md' }) => (
  <div role="tablist" aria-label={ariaLabel} className="chip-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...style }}>
    {items.map((it) => {
      const Icon = it.icon;
      const on = value === it.value;
      return (
        <button key={it.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.value)} className={on ? 'chip-tab is-on' : 'chip-tab'} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: size === 'sm' ? 34 : 38, padding: size === 'sm' ? '0 12px' : '0 14px', borderRadius: 999,
          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontWeight: 800, fontSize: size === 'sm' ? 12 : 12.5,
          background: on ? 'var(--ib-ink, #1A0A00)' : 'var(--ib-surface, #FFFDF9)', color: on ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-brown, #5C2A10)',
          border: `1px solid ${on ? 'var(--ib-dark, #1A0A00)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.22)'}`,
          boxShadow: on ? '0 6px 16px rgba(var(--ib-shadow-rgb, 26,10,0), 0.15)' : 'none',
        }}>
          {Icon && <Icon size={14} style={{ color: on ? 'var(--ib-amber, #E8A265)' : 'var(--ib-accent, #B4511E)', flexShrink: 0 }} />}
          {it.label}
          {it.count > 0 && (
            <span aria-label={`(${it.count})`} style={{
              minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900,
              background: it.alert ? 'var(--ib-accent, #B4511E)' : on ? 'var(--ib-amber, #E8A265)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.12)',
              color: it.alert ? 'var(--ib-on-accent, #FDF6EE)' : on ? 'var(--ib-ink, #1A0A00)' : 'var(--ib-brown, #5C2A10)',
            }}>{it.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

export default ChipTabs;
