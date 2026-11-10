import { useEffect, useMemo, useState } from 'react';
import { Star, Search, Plus, Trash2, Copy, Loader2, AlertTriangle, Truck, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from './toast';
import { confirmDialog } from './ConfirmDialog';
import PrettySelect from './PrettySelect';
import { formatPeso } from '../tourUtils';
import { BAG_TAG_FEE } from '../bookingRules';
import { SUPPLIER_TYPES, TYPE_LABEL, BASIS_LABEL, servesDestination, loadSuppliers, loadSupplierRatings } from '../suppliers';
import { EXPENSE_CATEGORIES, newLineKey, lineAmount, linesTotal, formLinesOf, bagTagLine } from '../tourExpenses';

// ─────────────────────────────────────────────
// SUPPLIER CHECKLIST: how a tour's costs are built, in Tour Management,
// Private Tours and Requested Tours.
//  • The active suppliers for the destination, by type, with their joiner
//    rating. Ticking one adds it as an inclusion and an expense line at its
//    default rate (the rate can be changed for this tour only).
//  • Suppliers from other places (search), and one-off costs (toll, fuel…).
//  • The Bag Tag, fixed, as always.
//  • A live summary: cost, cost per joiner, revenue, profit.
//  • "Copy from previous tour": the last tour to the same destination.
// lines: form lines (see tourExpenses.js); people: joiners for per-person
// lines; price: per joiner, or the whole group's when priceIsTotal.
// ─────────────────────────────────────────────

const sub = { fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 6px' };
const box = {
  width: '100%', boxSizing: 'border-box', background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 10,
  padding: '8px 10px', fontSize: 14, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
  border: '1px solid rgba(180,81,30,0.35)', background: 'transparent', color: '#A8481A', fontFamily: 'inherit',
  fontWeight: 900, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
};
const rateText = (v) => String(v ?? '').replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1');

const SupplierChecklist = ({ destination = '', people = 0, price = 0, priceIsTotal = false, lines, onChange, excludeTourIds = [], onInclusionAdd, onInclusionRemove, peopleLabel = 'joiners' }) => {
  const [suppliers, setSuppliers] = useState(null);
  const [ratings, setRatings] = useState({});
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadSuppliers(), loadSupplierRatings()]).then(([{ suppliers: list, error }, r]) => {
      if (!alive) return;
      if (error) setProblem(error.message);
      setSuppliers(list);
      setRatings(r);
    });
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => Object.fromEntries((suppliers || []).map((s) => [s.id, s])), [suppliers]);
  const local = (suppliers || []).filter((s) => s.is_active && servesDestination(s, destination));
  const ticked = new Map(lines.filter((l) => l.supplier_id).map((l) => [l.supplier_id, l]));
  // Ticked suppliers that aren't listed for this destination (other places, archived, copied).
  const elsewhere = [...ticked.keys()].filter((id) => !local.some((s) => s.id === id));
  const oneOffs = lines.filter((l) => !l.supplier_id && l.category !== 'bag_tag');
  const bag = lines.find((l) => l.category === 'bag_tag');

  const set = (next) => onChange(next.some((l) => l.category === 'bag_tag') ? next : [...next, bagTagLine()]);
  const update = (key, patch) => set(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const tick = (s, on) => {
    if (on) {
      if (ticked.has(s.id)) return;
      const line = { key: newLineKey(), supplier_id: s.id, category: s.supplier_type, label: s.inclusion_name, rate: String(Number(s.default_rate) || 0), rate_basis: s.rate_basis, is_unplanned: false };
      const at = lines.findIndex((l) => l.category === 'bag_tag');
      set(at < 0 ? [...lines, line] : [...lines.slice(0, at), line, ...lines.slice(at)]);
      onInclusionAdd?.(s.inclusion_name);
    } else {
      const line = ticked.get(s.id);
      const rest = lines.filter((l) => l.supplier_id !== s.id);
      set(rest);
      if (line && !rest.some((l) => l.label.trim().toLowerCase() === line.label.trim().toLowerCase())) onInclusionRemove?.(line.label);
    }
  };

  const addOneOff = () => {
    const at = lines.findIndex((l) => l.category === 'bag_tag');
    const line = { key: newLineKey(), supplier_id: null, category: 'other', label: '', rate: '', rate_basis: 'per_trip', is_unplanned: false };
    set(at < 0 ? [...lines, line] : [...lines.slice(0, at), line, ...lines.slice(at)]);
  };

  // The last tour to the same destination that has expense lines.
  const copyPrevious = async () => {
    const dest = destination.trim();
    if (!dest) { toast.info('Type the destination first', 'Then the checklist can copy the last tour to it.'); return; }
    setCopying(true);
    try {
      const { data: tours, error } = await supabase.from('tours').select('id, title, start_date, destination')
        .ilike('destination', `%${dest.replace(/[%_]/g, '')}%`).order('start_date', { ascending: false }).limit(30);
      if (error) throw error;
      const ids = (tours || []).map((t) => t.id).filter((id) => !excludeTourIds.includes(id));
      if (!ids.length) { toast.info('No previous tour found', `No other tour to ${dest} yet.`); return; }
      const { data: rows, error: lineError } = await supabase.from('tour_expense_lines').select('*').in('tour_id', ids);
      if (lineError) throw lineError;
      const from = (tours || []).find((t) => ids.includes(t.id) && (rows || []).some((r) => r.tour_id === t.id && r.category !== 'bag_tag'));
      if (!from) { toast.info('No previous checklist', `Earlier tours to ${dest} have no expense lines yet.`); return; }
      const hasLines = lines.some((l) => l.category !== 'bag_tag');
      if (hasLines && !(await confirmDialog({
        title: `Copy the checklist of ${from.title}?`,
        message: `This replaces the expense lines here with the ones from ${from.title} (${from.start_date}). You can tick and untick after.`,
        confirmLabel: 'Copy', cancelLabel: 'Keep Mine',
      }))) return;
      const copied = formLinesOf(rows.filter((r) => r.tour_id === from.id)).map((l) => ({ ...l, id: undefined }));
      // The previous tour's rates come along; the admin can change them here.
      onChange(copied);
      copied.forEach((l) => { if (l.supplier_id) onInclusionAdd?.(l.label); });
      toast.success('Checklist copied', `From ${from.title} (${from.start_date}). Tick and untick as needed.`);
    } catch (err) {
      toast.error("Couldn't copy the checklist", err?.message || String(err));
    } finally {
      setCopying(false);
    }
  };

  // Live summary.
  const n = Math.max(0, Number(people) || 0);
  const total = linesTotal(lines, n);
  const perJoiner = n > 0 ? total / n : 0;
  const pricePer = priceIsTotal ? (n > 0 ? (Number(price) || 0) / n : 0) : Number(price) || 0;
  const revenue = priceIsTotal ? Number(price) || 0 : (Number(price) || 0) * n;
  const profit = revenue - total;
  const belowCost = n > 0 && Number(price) > 0 && pricePer < perJoiner;

  const q = query.trim().toLowerCase();
  const found = q ? (suppliers || []).filter((s) => s.is_active && !local.some((x) => x.id === s.id) && !ticked.has(s.id)
    && `${s.name} ${s.inclusion_name} ${(s.destinations || []).join(' ')} ${TYPE_LABEL[s.supplier_type]}`.toLowerCase().includes(q)).slice(0, 8) : [];

  const ratingOf = (id) => {
    const r = ratings[id];
    return (
      <span title={r?.count ? `${r.avg.toFixed(1)} average from ${r.count} joiner rating${r.count === 1 ? '' : 's'}` : 'No joiner ratings yet'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 800, color: r?.count ? (r.avg < 3 ? '#8C2F1C' : '#5C2A10') : '#9A7A60', whiteSpace: 'nowrap' }}>
        <Star size={12} fill={r?.count ? '#E8A265' : 'none'} color="#E8A265" /> {r?.count ? `${r.avg.toFixed(1)} (${r.count})` : 'no ratings'}
      </span>
    );
  };

  // One ticked line's rate, basis and amount.
  const rateRow = (l) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <div style={{ flex: '1 1 110px', minWidth: 0 }}><input aria-label={`Rate for ${l.label}`} value={l.rate} inputMode="decimal" onChange={(e) => update(l.key, { rate: rateText(e.target.value) })} placeholder="Rate (₱)" style={box} /></div>
      <div style={{ flex: '1 1 130px', minWidth: 0 }}><PrettySelect compact ariaLabel={`Rate basis for ${l.label}`} value={l.rate_basis} onChange={(v) => update(l.key, { rate_basis: v })}
        options={[{ value: 'per_trip', label: 'Per trip' }, { value: 'per_person', label: 'Per person' }]} /></div>
      <span style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', whiteSpace: 'nowrap' }}>
        = {formatPeso(lineAmount(l, n))}{l.rate_basis === 'per_person' ? <span style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18' }}> ({n} × {formatPeso(l.rate)})</span> : null}
      </span>
    </div>
  );

  const supplierRow = (s, line) => {
    const on = !!line;
    const archived = s && !s.is_active;
    return (
      <div key={s?.id || line.key} style={{ background: on ? 'rgba(180,81,30,0.08)' : '#FDF6EE', border: `1px solid ${on ? 'rgba(180,81,30,0.4)' : 'rgba(180,81,30,0.15)'}`, borderRadius: 12, padding: '10px 12px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={on} onChange={(e) => (s ? tick(s, e.target.checked) : set(lines.filter((l) => l.key !== line.key)))} style={{ width: 18, height: 18, marginTop: 2, accentColor: '#B4511E', flexShrink: 0 }} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13.5, color: '#1A0A00' }}>{s?.name || line.label}</strong>
              {s && ratingOf(s.id)}
              {archived && <span style={{ fontSize: 10.5, fontWeight: 900, color: '#8C2F1C' }}>ARCHIVED</span>}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#5C2A10' }}>
              Joiners see: <strong>{line?.label || s?.inclusion_name}</strong>{s ? ` · usual rate ${formatPeso(s.default_rate)} ${BASIS_LABEL[s.rate_basis]}` : ''}
            </span>
          </span>
        </label>
        {on && rateRow(line)}
      </div>
    );
  };

  return (
    <div style={{ background: 'rgba(180,81,30,0.06)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.18)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <p style={{ ...sub, display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}><Truck size={14} /> Suppliers & Expenses</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#5C2A10', margin: '4px 0 0' }}>
            Tick what this tour includes. Joiners see only the names (no prices). Per-person costs use {n} {peopleLabel}.
          </p>
        </div>
        <button type="button" style={smallBtn} onClick={copyPrevious} disabled={copying}>
          {copying ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={13} />} Copy from previous tour
        </button>
      </div>

      {problem ? (
        <p style={{ fontSize: 12.5, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>Suppliers couldn't load ({problem}). You can still add one-off costs below.</p>
      ) : !suppliers ? (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#5C2A10', margin: 0 }}>Loading suppliers…</p>
      ) : !destination.trim() ? (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#5C2A10', margin: 0 }}>Type the destination to see the suppliers that serve it.</p>
      ) : local.length === 0 ? (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#5C2A10', margin: 0 }}>No saved suppliers serve {destination} yet. Search below, add one-off costs, or save suppliers in System Maintenance → Suppliers.</p>
      ) : (
        SUPPLIER_TYPES.map(([type, typeLabel]) => {
          const group = local.filter((s) => s.supplier_type === type);
          if (!group.length) return null;
          return (
            <div key={type}>
              <p style={sub}>{typeLabel}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 8 }}>
                {group.map((s) => supplierRow(s, ticked.get(s.id)))}
              </div>
            </div>
          );
        })
      )}

      {elsewhere.length > 0 && (
        <div>
          <p style={sub}>Also included</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 8 }}>
            {elsewhere.map((id) => supplierRow(byId[id] || null, ticked.get(id)))}
          </div>
        </div>
      )}

      <div>
        <p style={sub}>Add a supplier from another place</p>
        <label style={{ position: 'relative', display: 'block' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7A3A18' }} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved suppliers" aria-label="Search saved suppliers" style={{ ...box, paddingLeft: 30 }} />
        </label>
        {q && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {found.length === 0 ? <p style={{ fontSize: 12, fontWeight: 600, color: '#5C2A10', margin: 0 }}>No other active supplier matches.</p> : found.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#FDF6EE', borderRadius: 10, padding: '8px 10px', border: '1px solid rgba(180,81,30,0.15)' }}>
                <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 700, color: '#1A0A00' }}>
                  {s.name} <span style={{ fontWeight: 600, color: '#5C2A10' }}>· {TYPE_LABEL[s.supplier_type]} · {(s.destinations || []).join(', ')}</span>
                </span>
                {ratingOf(s.id)}
                <button type="button" style={smallBtn} onClick={() => { tick(s, true); setQuery(''); }}><Plus size={12} /> Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p style={sub}>One-off costs (no supplier)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {oneOffs.map((l) => (
            <div key={l.key} style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: '2 1 180px', minWidth: 0 }}><input aria-label="Expense name" value={l.label} maxLength={80} onChange={(e) => update(l.key, { label: e.target.value })} placeholder="e.g. Toll fees, Fuel, Entrance Fee" style={box} /></div>
                <div style={{ flex: '1 1 130px', minWidth: 0 }}><PrettySelect compact ariaLabel="Category" value={l.category} onChange={(v) => update(l.key, { category: v })}
                  options={EXPENSE_CATEGORIES.filter(([v]) => v !== 'bag_tag').map(([v, lab]) => ({ value: v, label: lab }))} /></div>
                <button type="button" aria-label="Remove this cost" onClick={() => set(lines.filter((x) => x.key !== l.key))} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(122,58,24,0.3)', background: 'transparent', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
              {rateRow(l)}
            </div>
          ))}
          <button type="button" onClick={addOneOff} style={{ ...smallBtn, justifyContent: 'center', borderStyle: 'dashed', minHeight: 38 }}><Plus size={13} /> Add one-off cost</button>
        </div>
      </div>

      {bag && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#1A0A00' }}>
          <Lock size={14} color="#7A3A18" /> <span style={{ flex: 1 }}>Bag Tag <span style={{ fontWeight: 600, color: '#5C2A10' }}>(fixed, every tour)</span></span>
          <strong>{formatPeso(BAG_TAG_FEE)}</strong>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
        {[
          ['Estimated cost', formatPeso(total)],
          [`Cost per ${peopleLabel === 'joiners' ? 'joiner' : 'person'}`, n > 0 ? formatPeso(perJoiner) : '—'],
          ['Expected revenue', formatPeso(revenue)],
          ['Estimated profit', `${profit < 0 ? '−' : ''}${formatPeso(Math.abs(profit))}`],
        ].map(([k, v], i) => (
          <div key={k} style={{ background: i === 3 ? (profit < 0 ? 'rgba(140,47,28,0.1)' : 'rgba(46,107,74,0.1)') : '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
            <p style={{ ...sub, margin: 0, fontSize: 10 }}>{k}</p>
            <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 900, color: i === 3 ? (profit < 0 ? '#8C2F1C' : '#2E6B4A') : '#1A0A00' }}>{v}</p>
          </div>
        ))}
      </div>
      {belowCost && (
        <p role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0, fontSize: 12.5, fontWeight: 800, color: '#8C2F1C', background: 'rgba(140,47,28,0.08)', borderRadius: 12, padding: '10px 12px' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          The price ({formatPeso(pricePer)} per {peopleLabel === 'joiners' ? 'joiner' : 'person'}) is below the cost per {peopleLabel === 'joiners' ? 'joiner' : 'person'} ({formatPeso(perJoiner)}). This tour would lose money if it fills up.
        </p>
      )}
    </div>
  );
};

export default SupplierChecklist;
