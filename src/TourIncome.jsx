import { Fragment, useEffect, useMemo, useState } from 'react';
import { TrendingUp, ChevronDown, AlertCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { expenseItems, expensesTotal } from './tourExpenses';
import { toast } from './ui/toast';

// ─────────────────────────────────────────────
// INCOME PER TOUR (Reports): for each tour date, what joiners pay minus what
// the tour costs, like the agency's spreadsheet:
//   joiner fees (each paid booking's total; for cancelled bookings, what was
//   already paid, since payments are non-refundable) − expenses = income.
// Also shows the downpayments and balances still to collect.
// ─────────────────────────────────────────────

const monthKeyOf = (ymd) => String(ymd || '').slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const monthOptions = () => {
  const now = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 6 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};
// Losses as "−₱1,000.00".
const money = (n) => (n < 0 ? `−${formatPeso(-n)}` : formatPeso(n));
const paidOf = (b) => (b.payment_method === 'Downpayment' && !b.balance_settled ? Number(b.amount_paid) || 0 : Number(b.total_price) || 0);

// onData: gets the rows shown (for the Reports PDF).
const TourIncome = ({ onData }) => {
  const [tours, setTours] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [expenses, setExpenses] = useState({});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [t, b, e] = await Promise.all([
        supabase.from('tours').select('id, title, start_date, end_date, price'),
        supabase.from('bookings').select('id, tour_id, booking_number, full_name, slots_booked, total_price, amount_paid, payment_method, payment_status, booking_status, balance_settled')
          .eq('payment_status', 'Complete'),
        supabase.from('tour_expenses').select('*'),
      ]);
      if (!active) return;
      setLoading(false);
      if (t.error || b.error) toast.error("Couldn't load tour income", (t.error || b.error).message);
      setTours(t.data || []);
      setBookings(b.data || []);
      setExpenses(Object.fromEntries((e.data || []).map((x) => [x.tour_id, x])));
    })();
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => tours
    .filter((t) => monthKeyOf(t.start_date) === month)
    .map((t) => {
      const list = bookings.filter((b) => b.tour_id === t.id && b.booking_status !== 'Rejected');
      const active = list.filter((b) => b.booking_status !== 'Cancelled');
      const cancelled = list.filter((b) => b.booking_status === 'Cancelled');
      const fees = active.reduce((s, b) => s + (Number(b.total_price) || 0), 0) + cancelled.reduce((s, b) => s + paidOf(b), 0);
      const collected = list.reduce((s, b) => s + paidOf(b), 0);
      const exp = expenses[t.id] || null;
      const expTotal = expensesTotal(exp);
      return {
        tour: t, active, cancelled, fees, collected, toCollect: Math.max(0, fees - collected),
        pax: active.reduce((s, b) => s + (b.slots_booked || 1), 0),
        expenses: exp, expTotal, income: fees - expTotal,
      };
    })
    .filter((r) => r.active.length || r.cancelled.length || r.expenses)
    .sort((a, b) => String(a.tour.start_date).localeCompare(String(b.tour.start_date))), [tours, bookings, expenses, month]);

  const totals = rows.reduce((s, r) => ({ fees: s.fees + r.fees, exp: s.exp + r.expTotal, income: s.income + r.income }), { fees: 0, exp: 0, income: 0 });

  // Reports' Download PDF includes this table.
  useEffect(() => {
    if (!loading) onData?.({ monthLabel: monthLabel(month), rows, totals });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, month, rows, totals.fees, totals.exp, totals.income, onData]);

  return (
    <section aria-labelledby="tour-income-title" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 id="tour-income-title" style={{ fontSize: 18, fontWeight: 900, color: '#1A0A00', margin: 0 }}>Income per Tour</h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>Joiner fees minus the tour's expenses, by tour date.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select aria-label="Tour month" value={month} onChange={(e) => { setMonth(e.target.value); setOpen(null); }} style={selectStyle}>
            {monthOptions().map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p style={muted}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={muted}>No tours with paid joiners in {monthLabel(month)}.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Stat label="Joiner fees" value={formatPeso(totals.fees)} />
            <Stat label="Expenses" value={formatPeso(totals.exp)} />
            <Stat label="Income" value={money(totals.income)} tone={totals.income < 0 ? 'bad' : 'good'} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={table}>
              <thead>
                <tr>{['Tour', 'Date', 'Joiners', 'Joiner fees', 'Expenses', 'Income', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = open === r.tour.id;
                  return (
                    <Fragment key={r.tour.id}>
                      <tr onClick={() => setOpen(isOpen ? null : r.tour.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...td, fontWeight: 800 }}>{r.tour.title}</td>
                        <td style={td}>{formatYmdRange(r.tour.start_date, r.tour.end_date)}</td>
                        <td style={td}>{r.pax}</td>
                        <td style={td}>{formatPeso(r.fees)}</td>
                        <td style={td}>{r.expenses ? formatPeso(r.expTotal) : <span style={{ color: '#8C2F1C', fontWeight: 800 }}>Not set</span>}</td>
                        <td style={{ ...td, fontWeight: 900, color: r.income < 0 ? '#8C2F1C' : '#2E6B4A' }}>{money(r.income)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button type="button" aria-expanded={isOpen} aria-label={`Breakdown for ${r.tour.title}`} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : r.tour.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8481A', display: 'inline-flex' }}>
                            <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ padding: '4px 10px 16px', background: 'rgba(242,228,208,0.45)' }}>
                            <Breakdown row={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

// One tour's breakdown, laid out like the spreadsheet: joiners on the left, expenses and income on the right.
const Breakdown = ({ row }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, paddingTop: 10 }}>
    <div>
      <p style={subTitle}>Joiners</p>
      <table style={{ ...table, minWidth: 0 }}>
        <thead><tr>{['#', 'Name', 'Event fee', 'Paid', 'Balance'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {row.active.map((b, i) => (
            <tr key={b.id}>
              <td style={td}>{i + 1}</td>
              <td style={td}>{b.full_name}{(b.slots_booked || 1) > 1 ? ` (+${(b.slots_booked || 1) - 1})` : ''}</td>
              <td style={td}>{formatPeso(b.total_price)}</td>
              <td style={td}>{formatPeso(paidOf(b))}</td>
              <td style={td}>{formatPeso(Math.max(0, (Number(b.total_price) || 0) - paidOf(b)))}</td>
            </tr>
          ))}
          {row.cancelled.map((b) => (
            <tr key={b.id}>
              <td style={td}>—</td>
              <td style={{ ...td, color: '#8C2F1C' }}>{b.full_name} (cancelled, non-refundable)</td>
              <td style={td}>{formatPeso(paidOf(b))}</td>
              <td style={td}>{formatPeso(paidOf(b))}</td>
              <td style={td}>—</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 900 }} colSpan={2}>Total</td>
            <td style={{ ...td, fontWeight: 900 }}>{formatPeso(row.fees)}</td>
            <td style={{ ...td, fontWeight: 900 }}>{formatPeso(row.collected)}</td>
            <td style={{ ...td, fontWeight: 900 }}>{formatPeso(row.toCollect)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div>
      <p style={subTitle}>Expenses</p>
      {row.expenses ? (
        <table style={{ ...table, minWidth: 0 }}>
          <tbody>
            {expenseItems(row.expenses).map((i) => (
              <tr key={i.label}><td style={td}>{i.label}</td><td style={{ ...td, textAlign: 'right' }}>{formatPeso(i.amount)}</td></tr>
            ))}
            <tr><td style={{ ...td, fontWeight: 900 }}>Total</td><td style={{ ...td, fontWeight: 900, textAlign: 'right' }}>{formatPeso(row.expTotal)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p style={{ ...muted, display: 'flex', gap: 6, alignItems: 'center' }}><AlertCircle size={14} /> No expenses yet. Edit this tour in Tour Management to add them.</p>
      )}
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 900, color: row.income < 0 ? '#8C2F1C' : '#2E6B4A', margin: '14px 0 0' }}>
        <TrendingUp size={17} /> Income: {money(row.income)}
      </p>
    </div>
  </div>
);

const Stat = ({ label, value, tone }) => (
  <div style={{ background: tone === 'good' ? 'rgba(46,107,74,0.1)' : tone === 'bad' ? 'rgba(140,47,28,0.1)' : '#F2E4D0', borderRadius: 16, padding: '12px 16px' }}>
    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', margin: 0 }}>{label}</p>
    <p style={{ fontSize: 22, fontWeight: 900, color: tone === 'good' ? '#2E6B4A' : tone === 'bad' ? '#8C2F1C' : '#1A0A00', margin: '4px 0 0' }}>{value}</p>
  </div>
);

const card = { background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.05)' };
const selectStyle = { background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '9px 12px', fontSize: 12.5, fontWeight: 800, color: '#1A0A00', fontFamily: 'inherit', cursor: 'pointer' };
const subTitle = { fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 6px' };
const muted = { fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0 };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 };
const th = { textAlign: 'left', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', padding: '8px 10px', borderBottom: '1px solid rgba(180,81,30,0.18)' };
const td = { padding: '8px 10px', color: '#1A0A00', fontWeight: 600, borderBottom: '1px solid rgba(180,81,30,0.08)', verticalAlign: 'top' };

export default TourIncome;
