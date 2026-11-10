import { Fragment, useEffect, useMemo, useState } from 'react';
import { Wallet, ChevronDown, AlertCircle, Search, Download, Star } from 'lucide-react';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { toast } from './ui/toast';
import NiceSelect from './ui/NiceSelect';
import StatusFilter from './ui/StatusFilter';
import Pager from './ui/Pager';
import { paginate } from './ui/paginate';
import { downloadCsv } from './csvExport';
import { PieChart } from './ReportCharts';
import { CATEGORY_LABEL } from './tourExpenses';
import { loadTourFinance, tourMoney, inPeriod, TOUR_TYPES, TOUR_TYPE_LABEL } from './tourFinance';

// ─────────────────────────────────────────────
// EXPENSES & PROFIT (Reports): where each tour's money went.
//  • Totals for a month, a year or all time, and by tour type (joiner,
//    private, requested).
//  • By category (pie chart and table) and by supplier (tours used, total
//    paid, average joiner rating).
//  • Each tour date: joiner fees, collected, every expense line with its
//    supplier and category, total, net income and margin. Actual amounts are
//    used once the tour's expenses are final, otherwise the estimates (each
//    row says which).
//  • Estimated vs actual cost, with the difference.
// Same numbers as Income per Tour (tourFinance.js). Tours count in the month they start.
// ─────────────────────────────────────────────

const PIE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const PAGE = 10;
const TYPE_FILTERS = ['All', ...TOUR_TYPES.map(([, l]) => `${l}s`)];
const typeOfFilter = (f) => TOUR_TYPES.find(([, l]) => `${l}s` === f)?.[0] || null;

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const shortMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
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
const pct = (n) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`);
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatPeso(Math.abs(n))}`;
const money = (n) => (n < 0 ? `−${formatPeso(-n)}` : formatPeso(n));

// onData: what's shown, for the Reports PDF.
const ExpensesReport = ({ onData }) => {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(() => `m:${new Date().toISOString().slice(0, 7)}`);
  const [type, setType] = useState('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let active = true;
    loadTourFinance().then((d) => {
      if (!active) return;
      if (d.error) toast.error("Couldn't load the expenses", d.error.message);
      setData(d);
    });
    return () => { active = false; };
  }, []);
  const loading = !data;

  // Every tour date in the period (any type), with its money.
  const all = useMemo(() => (data ? data.tours : [])
    .filter((t) => inPeriod(t.start_date, period))
    .map((t) => tourMoney(t, data))
    .filter((r) => r.hasLines || r.active.length || r.cancelled.length)
    .sort((a, b) => String(a.tour.start_date).localeCompare(String(b.tour.start_date))), [data, period]);
  const wanted = typeOfFilter(type);
  const rows = useMemo(() => all.filter((r) => !wanted || r.type === wanted), [all, wanted]);
  const missing = rows.filter((r) => !r.hasLines && r.tour.weather_status !== 'cancelled');
  const withCost = rows.filter((r) => r.hasLines);

  const totals = rows.reduce((s, r) => ({ fees: s.fees + r.fees, collected: s.collected + r.collected, cost: s.cost + r.cost }), { fees: 0, collected: 0, cost: 0 });
  const net = totals.fees - totals.cost;

  // By category.
  const categories = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => r.lines.forEach((l) => {
      const k = l.category;
      const cur = map.get(k) || { key: k, label: CATEGORY_LABEL[k] || k, amount: 0, tours: new Set() };
      cur.amount += l.cost; cur.tours.add(r.tour.id);
      map.set(k, cur);
    }));
    return [...map.values()].map((c) => ({ ...c, tours: c.tours.size })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const pie = categories.map((c, i) => ({ label: c.label, value: Math.round(c.amount * 100) / 100, color: PIE_COLORS[i % PIE_COLORS.length] }));

  // By supplier.
  const suppliers = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => r.lines.forEach((l) => {
      if (!l.supplier_id) return;
      const cur = map.get(l.supplier_id) || { id: l.supplier_id, name: l.supplierName || l.label, category: l.category, amount: 0, tours: new Set() };
      cur.amount += l.cost; cur.tours.add(r.tour.id);
      map.set(l.supplier_id, cur);
    }));
    return [...map.values()].map((x) => ({ ...x, tours: x.tours.size, rating: data?.ratings[x.id] || null })).sort((a, b) => b.amount - a.amount);
  }, [rows, data]);

  // By month (a year or all time).
  const byMonth = useMemo(() => {
    if (period.startsWith('m:')) return [];
    const map = new Map();
    rows.filter((r) => r.hasLines).forEach((r) => {
      const k = String(r.tour.start_date).slice(0, 7);
      const cur = map.get(k) || { key: k, amount: 0, tours: 0 };
      cur.amount += r.cost; cur.tours += 1;
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [rows, period]);
  const monthMax = Math.max(1, ...byMonth.map((m) => m.amount));

  // Estimated vs actual (tours with actual amounts entered).
  const compared = rows.filter((r) => r.actual != null);

  const q = query.trim().toLowerCase();
  const listed = rows.filter((r) => !q || `${r.tour.title} ${r.tour.destination || ''} ${r.lines.map((l) => `${l.label} ${l.supplierName}`).join(' ')}`.toLowerCase().includes(q));
  const { visible, pages, current } = paginate(listed, page, PAGE);

  // Reports' Download PDF and Print include this section.
  useEffect(() => {
    if (loading) return;
    onData?.({
      periodLabel: `${periodLabel(period)}${type === 'All' ? '' : ` · ${type}`}`,
      totals: { ...totals, net, margin: totals.fees > 0 ? (net / totals.fees) * 100 : null },
      categories, suppliers, rows, compared,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, period, type, rows, categories, suppliers, onData]);

  const download = () => downloadCsv(`expenses-${period.replace(':', '-')}.csv`, [
    [(x) => x.r.tour.title, 'Tour'], [(x) => TOUR_TYPE_LABEL[x.r.type], 'Type'], [(x) => x.r.tour.start_date, 'Start date'],
    [(x) => x.r.basis, 'Amounts'], [(x) => x.l?.label || '', 'Expense'], [(x) => (x.l ? CATEGORY_LABEL[x.l.category] : ''), 'Category'],
    [(x) => x.l?.supplierName || '', 'Supplier'], [(x) => (x.l ? x.l.estimated : ''), 'Estimated'], [(x) => (x.l?.actual ?? ''), 'Actual'],
    [(x) => (x.l ? x.l.cost : ''), 'Counted'], [(x) => x.r.fees, 'Joiner fees (tour)'], [(x) => x.r.cost, 'Total expenses (tour)'], [(x) => x.r.net, 'Net income (tour)'],
  ], listed.flatMap((r) => (r.lines.length ? r.lines.map((l) => ({ r, l })) : [{ r, l: null }])));

  return (
    <section aria-labelledby="expenses-title" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 id="expenses-title" style={{ fontSize: 18, fontWeight: 900, color: '#1A0A00', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={18} color="#A8481A" /> Expenses & Profit
          </h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>Where each tour's money went. Actual amounts once a tour's expenses are final, otherwise estimates.</p>
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

      <StatusFilter statuses={TYPE_FILTERS} value={type} onChange={(v) => { setType(v); setPage(1); setOpen(null); }}
        count={(st) => all.filter((r) => !typeOfFilter(st) || r.type === typeOfFilter(st)).length} style={{ marginBottom: 14 }} />

      {loading ? (
        <p style={muted}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={muted}>No {type === 'All' ? 'tours' : type.toLowerCase()} with bookings or expenses in {periodLabel(period).replace('All of ', '')}.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat label="Joiner fees" value={formatPeso(totals.fees)} sub={`${formatPeso(totals.collected)} collected`} />
            <Stat label="Total expenses" value={formatPeso(totals.cost)} sub={`${withCost.length} tour date${withCost.length === 1 ? '' : 's'}`} />
            <Stat label="Net income" value={money(net)} tone={net < 0 ? 'bad' : 'good'} />
            <Stat label="Profit margin" value={pct(totals.fees > 0 ? (net / totals.fees) * 100 : null)} tone={net < 0 ? 'bad' : 'good'} />
          </div>

          {missing.length > 0 && (
            <p style={{ ...muted, display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(140,47,28,0.07)', borderRadius: 12, padding: '10px 12px', marginBottom: 16, color: '#8C2F1C', fontWeight: 700 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{missing.length} tour date{missing.length === 1 ? ' has' : 's have'} no expenses yet: {missing.slice(0, 4).map((r) => `${r.tour.title} (${formatYmdRange(r.tour.start_date, r.tour.end_date)})`).join(', ')}{missing.length > 4 ? ` and ${missing.length - 4} more` : ''}. Add them in Tour Management.</span>
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, marginBottom: 18 }}>
            <div style={panel}>
              <p style={subTitle}>Expenses by category</p>
              {pie.length ? <PieChart segments={pie} format={formatPeso} /> : <p style={muted}>No expenses yet.</p>}
            </div>
            <div style={panel}>
              <p style={subTitle}>By category</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="stack-table" style={{ ...table, minWidth: 0 }}>
                  <thead><tr>{['Category', 'Tours', 'Amount', 'Share'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.key}><td style={{ ...td, fontWeight: 800 }}>{c.label}</td><td style={td}>{c.tours}</td><td style={td}>{formatPeso(c.amount)}</td><td style={td}>{pct(totals.cost > 0 ? (c.amount / totals.cost) * 100 : 0)}</td></tr>
                    ))}
                    <tr><td style={{ ...td, fontWeight: 900 }}>Total</td><td style={td} /><td style={{ ...td, fontWeight: 900 }}>{formatPeso(totals.cost)}</td><td style={{ ...td, fontWeight: 900 }}>100%</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ ...panel, marginBottom: 18 }}>
            <p style={subTitle}>By supplier</p>
            {suppliers.length === 0 ? <p style={muted}>No supplier lines in this period (only one-off costs).</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="stack-table" style={{ ...table, minWidth: 0 }}>
                  <thead><tr>{['Supplier', 'Category', 'Tours used', 'Total paid', 'Joiner rating'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {suppliers.map((x) => (
                      <tr key={x.id}>
                        <td style={{ ...td, fontWeight: 800 }}>{x.name}</td>
                        <td style={td}>{CATEGORY_LABEL[x.category] || x.category}</td>
                        <td style={td}>{x.tours}</td>
                        <td style={td}>{formatPeso(x.amount)}</td>
                        <td style={td}>{x.rating?.count ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: x.rating.avg < 3 ? '#8C2F1C' : '#1A0A00', fontWeight: 800 }}><Star size={12} fill="#E8A265" color="#E8A265" /> {x.rating.avg.toFixed(1)} ({x.rating.count})</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

          {compared.length > 0 && (
            <div style={{ ...panel, marginBottom: 18 }}>
              <p style={subTitle}>Estimated vs actual cost</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="stack-table" style={{ ...table, minWidth: 0 }}>
                  <thead><tr>{['Tour', 'Date', 'Estimated', 'Actual', 'Difference', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {compared.map((r) => {
                      const d = r.actual - r.estimated;
                      return (
                        <tr key={r.tour.id}>
                          <td style={{ ...td, fontWeight: 800 }}>{r.tour.title}</td>
                          <td style={td}>{formatYmdRange(r.tour.start_date, r.tour.end_date)}</td>
                          <td style={td}>{formatPeso(r.estimated)}</td>
                          <td style={td}>{formatPeso(r.actual)}</td>
                          <td style={{ ...td, fontWeight: 900, color: d > 0 ? '#8C2F1C' : '#2E6B4A' }}>{signed(d)}</td>
                          <td style={td}>{r.final ? <span style={tag}>Final</span> : <span style={{ ...tag, background: 'rgba(232,162,101,0.25)' }}>Not final</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <p style={{ ...subTitle, margin: 0 }}>By tour date</p>
            <label style={{ position: 'relative', flex: '0 1 280px', minWidth: 0 }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#7A3A18' }} />
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search tours, expenses, suppliers" aria-label="Search tours, expenses or suppliers"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.2)', background: '#FFFDF9', fontFamily: 'inherit', fontSize: 12.5, color: '#1A0A00' }} />
            </label>
          </div>
          {visible.length === 0 ? (
            <p style={muted}>No tours match "{query}".</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="stack-table" style={table}>
                <thead>
                  <tr>{['Tour', 'Date', 'Joiner fees', 'Collected', 'Expenses', 'Net income', 'Margin', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const isOpen = open === r.tour.id;
                    return (
                      <Fragment key={r.tour.id}>
                        <tr onClick={() => setOpen(isOpen ? null : r.tour.id)} style={{ cursor: 'pointer' }}>
                          <td style={{ ...td, fontWeight: 800 }}>
                            {r.tour.title}
                            <span style={tag}>{TOUR_TYPE_LABEL[r.type].replace(' tour', '')}</span>
                            {r.tour.weather_status === 'cancelled' && <span style={{ ...tag, background: 'rgba(140,47,28,0.12)', color: '#8C2F1C' }}>Cancelled</span>}
                          </td>
                          <td style={td}>{formatYmdRange(r.tour.start_date, r.tour.end_date)}</td>
                          <td style={td}>{formatPeso(r.fees)}</td>
                          <td style={td}>{formatPeso(r.collected)}</td>
                          <td style={td}>
                            {r.hasLines ? formatPeso(r.cost) : <span style={{ color: '#8C2F1C', fontWeight: 800 }}>Not set</span>}
                            {r.hasLines && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: r.final ? '#2E6B4A' : '#A8481A' }}>{r.basis}</span>}
                          </td>
                          <td style={{ ...td, fontWeight: 900, color: r.net < 0 ? '#8C2F1C' : '#2E6B4A' }}>{money(r.net)}</td>
                          <td style={td}>{pct(r.margin)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <button type="button" aria-expanded={isOpen} aria-label={`Breakdown of ${r.tour.title}`} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : r.tour.id); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4 }}>
                              <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} style={{ padding: '4px 10px 16px', background: 'rgba(242,228,208,0.45)' }}>
                              {r.lines.length === 0 ? <p style={{ ...muted, paddingTop: 10 }}>No expense lines yet. Add them in Tour Management.</p> : (
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ ...table, minWidth: 560 }}>
                                    <thead><tr>{['Expense', 'Supplier', 'Category', 'Estimated', 'Actual', 'Counted'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                    <tbody>
                                      {r.lines.map((l) => (
                                        <tr key={l.id}>
                                          <td style={td}>{l.label}{l.is_unplanned ? ' (unplanned)' : ''}</td>
                                          <td style={td}>{l.supplierName || '—'}</td>
                                          <td style={td}>{CATEGORY_LABEL[l.category] || l.category}</td>
                                          <td style={td}>{l.is_unplanned ? '—' : formatPeso(l.estimated)}</td>
                                          <td style={td}>{l.actual != null ? formatPeso(l.actual) : '—'}</td>
                                          <td style={{ ...td, fontWeight: 800 }}>{formatPeso(l.cost)}</td>
                                        </tr>
                                      ))}
                                      <tr>
                                        <td style={{ ...td, fontWeight: 900 }} colSpan={3}>Total ({r.basis.toLowerCase()})</td>
                                        <td style={{ ...td, fontWeight: 900 }}>{formatPeso(r.estimated)}</td>
                                        <td style={{ ...td, fontWeight: 900 }}>{r.actual != null ? formatPeso(r.actual) : '—'}</td>
                                        <td style={{ ...td, fontWeight: 900 }}>{formatPeso(r.cost)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 900, color: r.net < 0 ? '#8C2F1C' : '#2E6B4A' }}>
                                Joiner fees {formatPeso(r.fees)} − expenses {formatPeso(r.cost)} = net income {money(r.net)}{r.margin != null ? ` (${pct(r.margin)} margin)` : ''}
                              </p>
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
          <Pager page={current} pages={pages} onPage={setPage} />
        </>
      )}
    </section>
  );
};

const Stat = ({ label, value, sub, tone }) => (
  <div style={{ background: tone === 'good' ? 'rgba(46,107,74,0.1)' : tone === 'bad' ? 'rgba(140,47,28,0.1)' : '#F2E4D0', borderRadius: 16, padding: '12px 16px', minWidth: 0 }}>
    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', margin: 0 }}>{label}</p>
    <p style={{ fontSize: 22, fontWeight: 900, color: tone === 'good' ? '#2E6B4A' : tone === 'bad' ? '#8C2F1C' : '#1A0A00', margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value}</p>
    {sub && <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: '2px 0 0' }}>{sub}</p>}
  </div>
);

const card = { background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.05)' };
const panel = { background: 'rgba(242,228,208,0.35)', border: '1px solid rgba(180,81,30,0.1)', borderRadius: 16, padding: '14px 16px', minWidth: 0 };
const selectStyle = { background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '9px 12px', fontSize: 12.5, fontWeight: 800, color: '#1A0A00', fontFamily: 'inherit', cursor: 'pointer' };
const subTitle = { fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 10px' };
const muted = { fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0 };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 700 };
const th = { textAlign: 'left', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', padding: '8px 10px', borderBottom: '1px solid rgba(180,81,30,0.18)' };
const td = { padding: '8px 10px', color: '#1A0A00', fontWeight: 600, borderBottom: '1px solid rgba(180,81,30,0.08)', verticalAlign: 'top' };
const tag = { display: 'inline-block', marginLeft: 6, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(168,72,26,0.12)', color: '#A8481A', borderRadius: 999, padding: '2px 7px', verticalAlign: 'middle' };

export default ExpensesReport;
