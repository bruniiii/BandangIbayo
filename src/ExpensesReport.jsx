import { Fragment, useEffect, useMemo, useState } from 'react';
import { Wallet, ChevronDown, AlertCircle, Search, Download } from 'lucide-react';
import { supabase } from './supabaseClient';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { lineCost } from './tourExpenses';
import { toast } from './ui/toast';
import NiceSelect from './ui/NiceSelect';
import StatusFilter from './ui/StatusFilter';
import { downloadCsv } from './csvExport';
import { PieChart } from './ReportCharts';

// ─────────────────────────────────────────────
// EXPENSES (Reports): where the money for tours went.
//  • Totals for the chosen month, year or all time.
//  • Breakdown by kind (Van Rent, Tour Guide, Bag Tag and each "other"
//    expense by name) with a pie chart.
//  • By month (for a year or all time) and by tour date, each tour opening
//    to its own items.
// Expenses are each tour date's expense lines (tour_expense_lines), set in Tour
// Management, Requested Tours and Private Tours. Tours are counted in the
// month they start.
// ─────────────────────────────────────────────

const PIE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const PIE_OTHER = '#A39A90';
const PAGE = 10;
const TYPES = ['All', 'Joiner tours', 'Private tours'];

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const shortMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
// The months (6 ahead, 12 back), then the years, then all time.
const periodOptions = () => {
  const now = new Date();
  const months = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 6 - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: `m:${k}`, label: monthLabel(k) };
  });
  const years = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]
    .map((y) => ({ value: `y:${y}`, label: `All of ${y}` }));
  return [...months, ...years, { value: 'all', label: 'All time' }];
};
const periodLabel = (p) => (p === 'all' ? 'All time' : p.startsWith('y:') ? `All of ${p.slice(2)}` : monthLabel(p.slice(2)));
const inPeriod = (ymd, p) => {
  if (!ymd) return false;
  if (p === 'all') return true;
  return p.startsWith('y:') ? ymd.startsWith(`${p.slice(2)}-`) : ymd.startsWith(p.slice(2));
};
// "Entrance fee" and "entrance Fee " are the same kind of expense.
const kindKey = (label) => String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// onData: what's shown, for the Reports PDF.
const ExpensesReport = ({ onData }) => {
  const [tours, setTours] = useState([]);
  const [expenses, setExpenses] = useState({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => `m:${new Date().toISOString().slice(0, 7)}`);
  const [type, setType] = useState('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [t, e] = await Promise.all([
        supabase.from('tours').select('id, title, destination, start_date, end_date, is_exclusive, weather_status'),
        supabase.from('tour_expense_lines').select('*').order('sort_order'),
      ]);
      if (!active) return;
      setLoading(false);
      if (t.error || e.error) toast.error("Couldn't load the expenses", (t.error || e.error).message);
      setTours(t.data || []);
      const by = {};
      (e.data || []).forEach((x) => { (by[x.tour_id] ||= []).push(x); });
      setExpenses(by);
    })();
    return () => { active = false; };
  }, []);

  // Tour dates in the period and type (cancelled-for-weather dates included:
  // their costs may already have been paid).
  const inScope = useMemo(() => tours.filter((t) => inPeriod(t.start_date, period)
    && (type === 'All' || (type === 'Private tours' ? !!t.is_exclusive : !t.is_exclusive))), [tours, period, type]);

  const rows = useMemo(() => inScope
    .filter((t) => expenses[t.id])
    .map((t) => {
      // Van Rent, Tour Guide and Bag Tag first (the columns), then the rest.
      const all = expenses[t.id].map((l) => ({ label: l.label, amount: lineCost(l), category: l.category }));
      const pick = (cat) => all.filter((i) => i.category === cat);
      const sum = (list) => list.reduce((x, i) => x + i.amount, 0);
      const van = pick('van_rental'), guide = pick('tour_guide'), bag = pick('bag_tag');
      const items = [
        { label: 'Van Rent', amount: sum(van) }, { label: 'Tour Guide', amount: sum(guide) }, { label: 'Bag Tag', amount: sum(bag) },
        ...all.filter((i) => !['van_rental', 'tour_guide', 'bag_tag'].includes(i.category)),
      ];
      return { tour: t, items, total: sum(all), others: items.slice(3), lines: all };
    })
    .sort((a, b) => String(a.tour.start_date).localeCompare(String(b.tour.start_date))), [inScope, expenses]);
  const missing = inScope.filter((t) => !expenses[t.id] && t.weather_status !== 'cancelled');

  const total = rows.reduce((s, r) => s + r.total, 0);

  // By kind: the same label adds up across tours.
  const kinds = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => r.items.forEach((i) => {
      if (!(i.amount > 0)) return;
      const k = kindKey(i.label);
      const cur = map.get(k) || { label: String(i.label).trim(), amount: 0, tours: new Set() };
      cur.amount += i.amount; cur.tours.add(r.tour.id);
      map.set(k, cur);
    }));
    return [...map.values()].map((k) => ({ label: k.label, amount: k.amount, tours: k.tours.size }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const pie = useMemo(() => {
    const top = kinds.slice(0, PIE_COLORS.length - 1).map((k, i) => ({ label: k.label, value: Math.round(k.amount * 100) / 100, color: PIE_COLORS[i] }));
    const rest = kinds.slice(PIE_COLORS.length - 1).reduce((s, k) => s + k.amount, 0);
    return rest > 0 ? [...top, { label: 'Other expenses', value: Math.round(rest * 100) / 100, color: PIE_OTHER }] : top;
  }, [kinds]);

  // By month (when a year or all time is chosen).
  const byMonth = useMemo(() => {
    if (period.startsWith('m:')) return [];
    const map = new Map();
    rows.forEach((r) => {
      const k = String(r.tour.start_date).slice(0, 7);
      const cur = map.get(k) || { key: k, amount: 0, tours: 0 };
      cur.amount += r.total; cur.tours += 1;
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [rows, period]);
  const monthMax = Math.max(1, ...byMonth.map((m) => m.amount));

  const q = query.trim().toLowerCase();
  const listed = rows.filter((r) => !q || `${r.tour.title} ${r.tour.destination || ''} ${r.items.map((i) => i.label).join(' ')}`.toLowerCase().includes(q));
  const pages = Math.max(1, Math.ceil(listed.length / PAGE));
  const current = Math.min(page, pages);
  const visible = listed.slice((current - 1) * PAGE, current * PAGE);
  const countFor = (st) => tours.filter((t) => inPeriod(t.start_date, period) && expenses[t.id]
    && (st === 'All' || (st === 'Private tours' ? !!t.is_exclusive : !t.is_exclusive))).length;

  // Reports' Download PDF includes this section.
  useEffect(() => {
    if (!loading) onData?.({ periodLabel: `${periodLabel(period)}${type === 'All' ? '' : ` · ${type}`}`, total, tours: rows.length, kinds, rows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, period, type, total, rows.length, kinds, onData]);

  const download = () => downloadCsv(`expenses-${period.replace(':', '-')}.csv`, [
    [(r) => r.tour.title, 'Tour'],
    [(r) => r.tour.start_date, 'Start date'],
    [(r) => r.tour.end_date || r.tour.start_date, 'End date'],
    [(r) => (r.tour.is_exclusive ? 'Private tour' : 'Joiner tour'), 'Type'],
    [(r) => r.items[0]?.amount ?? 0, 'Van Rent'],
    [(r) => r.items[1]?.amount ?? 0, 'Tour Guide'],
    [(r) => r.items[2]?.amount ?? 0, 'Bag Tag'],
    [(r) => r.others.map((o) => `${o.label}: ${o.amount}`).join('; '), 'Other expenses'],
    [(r) => r.others.reduce((s, o) => s + o.amount, 0), 'Other total'],
    [(r) => r.total, 'Total'],
  ], listed);

  return (
    <section aria-labelledby="expenses-title" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 id="expenses-title" style={{ fontSize: 18, fontWeight: 900, color: '#1A0A00', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={18} color="#A8481A" /> Expenses
          </h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>Where the money for tours went, and the breakdown. Counted in the month each tour starts.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <NiceSelect aria-label="Expenses period" value={period} onChange={(e) => { setPeriod(e.target.value); setOpen(null); setPage(1); }} style={selectStyle}>
            {periodOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NiceSelect>
          <button type="button" onClick={download} disabled={!listed.length} style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: listed.length ? 1 : 0.5, cursor: listed.length ? 'pointer' : 'not-allowed' }}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <StatusFilter statuses={TYPES} value={type} onChange={(v) => { setType(v); setPage(1); setOpen(null); }} count={countFor} style={{ marginBottom: 14 }} />

      {loading ? (
        <p style={muted}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={muted}>No expenses saved for {type === 'All' ? 'tours' : type.toLowerCase()} in {periodLabel(period).replace('All of ', '')}.
          {missing.length > 0 && ` ${missing.length} tour date${missing.length === 1 ? ' has' : 's have'} no expenses yet.`}</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat label="Total expenses" value={formatPeso(total)} />
            <Stat label="Tour dates" value={String(rows.length)} />
            <Stat label="Average per tour" value={formatPeso(total / rows.length)} />
            <Stat label="Biggest expense" value={kinds[0] ? kinds[0].label : '—'} sub={kinds[0] ? `${formatPeso(kinds[0].amount)} · ${pctOf(kinds[0].amount, total)}%` : ''} />
          </div>

          {missing.length > 0 && (
            <p style={{ ...muted, display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(140,47,28,0.07)', borderRadius: 12, padding: '10px 12px', marginBottom: 16, color: '#8C2F1C', fontWeight: 700 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{missing.length} tour date{missing.length === 1 ? ' has' : 's have'} no expenses yet, so the totals leave {missing.length === 1 ? 'it' : 'them'} out: {missing.slice(0, 4).map((t) => `${t.title} (${formatYmdRange(t.start_date, t.end_date)})`).join(', ')}{missing.length > 4 ? ` and ${missing.length - 4} more` : ''}. Add them in Tour Management.</span>
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, marginBottom: 18 }}>
            <div style={panel}>
              <p style={subTitle}>Where it went</p>
              <PieChart segments={pie} format={formatPeso} />
            </div>
            <div style={panel}>
              <p style={subTitle}>Breakdown</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="stack-table" style={{ ...table, minWidth: 0 }}>
                  <thead><tr>{['Expense', 'Tours', 'Amount', 'Share'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {kinds.map((k) => (
                      <tr key={k.label}>
                        <td style={{ ...td, fontWeight: 800 }}>{k.label}</td>
                        <td style={td}>{k.tours}</td>
                        <td style={td}>{formatPeso(k.amount)}</td>
                        <td style={td}>{pctOf(k.amount, total)}%</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, fontWeight: 900 }}>Total</td>
                      <td style={{ ...td, fontWeight: 900 }}>{rows.length}</td>
                      <td style={{ ...td, fontWeight: 900 }}>{formatPeso(total)}</td>
                      <td style={{ ...td, fontWeight: 900 }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {byMonth.length > 1 && (
            <div style={{ ...panel, marginBottom: 18 }}>
              <p style={subTitle}>By month</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byMonth.map((m) => (
                  <div key={m.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 12, fontWeight: 700, color: '#1A0A00' }}>
                      <span>{shortMonth(m.key)} · {m.tours} tour{m.tours === 1 ? '' : 's'}</span>
                      <span style={{ fontWeight: 900, color: '#A8481A' }}>{formatPeso(m.amount)}</span>
                    </div>
                    <div style={{ background: '#F2E4D0', borderRadius: 999, height: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(m.amount / monthMax) * 100}%`, background: '#A8481A', borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <p style={{ ...subTitle, margin: 0 }}>By tour date</p>
            <label style={{ position: 'relative', flex: '0 1 280px', minWidth: 0 }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#7A3A18' }} />
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search tours or expenses" aria-label="Search tours or expenses"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.2)', background: '#FFFDF9', fontFamily: 'inherit', fontSize: 12.5, color: '#1A0A00' }} />
            </label>
          </div>
          {visible.length === 0 ? (
            <p style={muted}>No tours match "{query}".</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="stack-table" style={table}>
                <thead>
                  <tr>{['Tour', 'Date', 'Van Rent', 'Tour Guide', 'Bag Tag', 'Other', 'Total', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const isOpen = open === r.tour.id;
                    const otherTotal = r.others.reduce((s, o) => s + o.amount, 0);
                    return (
                      <Fragment key={r.tour.id}>
                        <tr onClick={() => setOpen(isOpen ? null : r.tour.id)} style={{ cursor: 'pointer' }}>
                          <td style={{ ...td, fontWeight: 800 }}>
                            {r.tour.title}
                            {r.tour.is_exclusive && <span style={tag}>Private</span>}
                            {r.tour.weather_status === 'cancelled' && <span style={{ ...tag, background: 'rgba(140,47,28,0.12)', color: '#8C2F1C' }}>Cancelled</span>}
                          </td>
                          <td style={td}>{formatYmdRange(r.tour.start_date, r.tour.end_date)}</td>
                          <td style={td}>{formatPeso(r.items[0]?.amount)}</td>
                          <td style={td}>{formatPeso(r.items[1]?.amount)}</td>
                          <td style={td}>{formatPeso(r.items[2]?.amount)}</td>
                          <td style={td}>{r.others.length ? `${formatPeso(otherTotal)} (${r.others.length})` : '—'}</td>
                          <td style={{ ...td, fontWeight: 900 }}>{formatPeso(r.total)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <button type="button" aria-expanded={isOpen} aria-label={`Expenses of ${r.tour.title}`} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : r.tour.id); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4 }}>
                              <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} style={{ padding: '4px 10px 16px', background: 'rgba(242,228,208,0.45)' }}>
                              <table style={{ ...table, minWidth: 0, maxWidth: 480 }}>
                                <tbody>
                                  {r.lines.map((i, n) => (
                                    <tr key={`${i.label}-${n}`}>
                                      <td style={td}>{i.label}</td>
                                      <td style={{ ...td, textAlign: 'right' }}>{formatPeso(i.amount)}</td>
                                      <td style={{ ...td, textAlign: 'right', color: '#7A3A18' }}>{pctOf(i.amount, r.total)}%</td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td style={{ ...td, fontWeight: 900 }}>Total</td>
                                    <td style={{ ...td, fontWeight: 900, textAlign: 'right' }}>{formatPeso(r.total)}</td>
                                    <td style={td} />
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 }}>
              <button type="button" style={pageBtn} disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>Page {current} of {pages}</span>
              <button type="button" style={pageBtn} disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const Stat = ({ label, value, sub }) => (
  <div style={{ background: '#F2E4D0', borderRadius: 16, padding: '12px 16px', minWidth: 0 }}>
    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', margin: 0 }}>{label}</p>
    <p style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value}</p>
    {sub && <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: '2px 0 0' }}>{sub}</p>}
  </div>
);

const card = { background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.05)' };
const panel = { background: 'rgba(242,228,208,0.35)', border: '1px solid rgba(180,81,30,0.1)', borderRadius: 16, padding: '14px 16px', minWidth: 0 };
const selectStyle = { background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '9px 12px', fontSize: 12.5, fontWeight: 800, color: '#1A0A00', fontFamily: 'inherit', cursor: 'pointer' };
const pageBtn = { ...selectStyle, padding: '7px 12px' };
const subTitle = { fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 10px' };
const muted = { fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0 };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 };
const th = { textAlign: 'left', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', padding: '8px 10px', borderBottom: '1px solid rgba(180,81,30,0.18)' };
const td = { padding: '8px 10px', color: '#1A0A00', fontWeight: 600, borderBottom: '1px solid rgba(180,81,30,0.08)', verticalAlign: 'top' };
const tag = { display: 'inline-block', marginLeft: 6, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(168,72,26,0.12)', color: '#A8481A', borderRadius: 999, padding: '2px 7px', verticalAlign: 'middle' };

export default ExpensesReport;
