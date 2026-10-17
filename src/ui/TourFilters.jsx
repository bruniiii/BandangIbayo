import { ChevronDown } from 'lucide-react';
import { PRICE_RANGES, LENGTHS, monthOptions } from '../tripFilters';

// Month, price range and trip length selects (logic in tripFilters.js).

const Select = ({ label, value, onChange, options, anyLabel, style, minWidth }) => (
  <div style={{ position: 'relative', minWidth, flex: `1 1 ${minWidth}px` }}>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...style, appearance: 'none', paddingRight: 32, cursor: 'pointer', ...(value ? { borderColor: '#B4511E', color: '#A8481A', fontWeight: 800 } : null) }}
    >
      <option value="">{anyLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
  </div>
);

// The three selects. `trips` gives the months to offer.
export const MoreTourFilters = ({ trips, filters, setFilter, inputStyle }) => (
  <>
    <Select label="Month" value={filters.month} onChange={(v) => setFilter('month', v)} options={monthOptions(trips)} anyLabel="Any month" style={inputStyle} minWidth={150} />
    <Select label="Price range" value={filters.price} onChange={(v) => setFilter('price', v)} options={PRICE_RANGES} anyLabel="Any price" style={inputStyle} minWidth={150} />
    <Select label="Trip length" value={filters.length} onChange={(v) => setFilter('length', v)} options={LENGTHS} anyLabel="Any length" style={inputStyle} minWidth={150} />
  </>
);
