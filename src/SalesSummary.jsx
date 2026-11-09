import { useEffect, useMemo, useState } from 'react';
import { Wallet, AlertCircle, Users, ChevronDown } from 'lucide-react';
import { supabase } from './supabaseClient';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { toast } from './ui/toast';
import NiceSelect from './ui/NiceSelect';
import NiceDate from './ui/NiceDate';

// ─────────────────────────────────────────────
// SALES SUMMARY (top of Reports): money actually collected in a month, per
// tour, and every unpaid balance (included in the Reports PDF).
//
// Collected = what the agency has received: the full price for full payments,
// the downpayment for downpayment bookings (plus the balance once settled),
// and private tour payments. Cancelled bookings still count (payments are
// non-refundable); rejected payments don't. Tour bookings count in the month
// they were booked, private tours in the month each part was paid.
// ─────────────────────────────────────────────

const monthKeyOf = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
// The period to show: a day (YYYY-MM-DD), a month (YYYY-MM) or a year (YYYY).
const periodKeyOf = (iso, kind) => {
  const d = new Date(iso);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return kind === 'day' ? `${y}-${m}-${day}` : kind === 'year' ? String(y) : `${y}-${m}`;
};
const periodLabel = (key, kind) => {
  if (kind === 'year') return key;
  if (kind === 'day') {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return monthLabel(key);
};
const lastYears = (n) => Array.from({ length: n }, (_, i) => String(new Date().getFullYear() - i));
const lastMonths = (n) => {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
};

const collectedOf = (b) => {
  if (b.payment_status !== 'Complete' || b.booking_status === 'Rejected') return 0;
  if (b.payment_method === 'Downpayment' && !b.balance_settled) return Number(b.amount_paid) || 0;
  return Number(b.total_price) || 0;
};
const balanceOf = (b) => (
  b.payment_status === 'Complete' && b.payment_method === 'Downpayment' && !b.balance_settled
    && !['Cancelled', 'Rejected'].includes(b.booking_status)
    ? Math.max(0, (Number(b.total_price) || 0) - (Number(b.amount_paid) || 0))
    : 0
);

const SalesSummary = ({ onData }) => {
  const [bookings, setBookings] = useState([]);
  const [exclusives, setExclusives] = useState([]);
  const [rates, setRates] = useState({}); // tour id → Regular Rate
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('month'); // day | month | year
  const [month, setMonth] = useState(() => monthKeyOf(new Date())); // the chosen period's key
  const pickKind = (k) => { setKind(k); setMonth(periodKeyOf(new Date(), k)); };
  const [showBalances, setShowBalances] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [b, x, r] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, booking_number, full_name, contact_number, slots_booked, total_price, amount_paid, payment_method, payment_status, booking_status, balance_settled, created_at, tour_id, request_id, tours ( title, start_date, end_date )'),
        supabase
          .from('exclusive_requests')
          .select('id, full_name, destination, preferred_date, payment_status, amount_paid, balance_amount, balance_settled, paid_at, balance_paid_at, package_details'),
        supabase.from('tour_rates').select('tour_id, regular_rate'),
      ]);
      if (!active) return;
      setLoading(false);
      if (b.error) toast.error("Couldn't load sales", b.error.message);
      // A private tour's booking mirrors its request, which is counted below already.
      const exclusiveIds = new Set((x.data || []).map((e) => String(e.id)));
      setBookings((b.data || []).filter((bk) => !bk.request_id || !exclusiveIds.has(String(bk.request_id))));
      setExclusives(x.error ? [] : x.data || []); // private tour payments are optional (older databases)
      setRates(Object.fromEntries((r.data || []).map((row) => [row.tour_id, Number(row.regular_rate)])));
    })();
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    const inMonth = bookings.filter((b) => periodKeyOf(b.created_at, kind) === month && collectedOf(b) > 0);

    const perTour = new Map();
    inMonth.forEach((b) => {
      const key = b.tour_id;
      const row = perTour.get(key) || { title: b.tours?.title || 'Unknown tour', start: b.tours?.start_date, end: b.tours?.end_date, bookings: 0, pax: 0, collected: 0, balance: 0, regular: 0, hasRate: rates[key] != null };
      row.bookings += 1;
      row.pax += b.slots_booked || 1;
      // Regular Rate × people booked: what the agency itself earns from this booking.
      row.regular += (rates[key] || 0) * (b.slots_booked || 1);
      row.collected += collectedOf(b);
      row.balance += balanceOf(b);
      perTour.set(key, row);
    });

    // Private tours: downpayment in the month it was paid, the balance in its month.
    let exclusiveCollected = 0;
    exclusives.forEach((r) => {
      if (r.payment_status !== 'Paid') return;
      const paid = Number(r.amount_paid) || 0;
      const balancePart = r.balance_settled ? Number(r.balance_amount) || 0 : 0;
      if (r.paid_at && periodKeyOf(r.paid_at, kind) === month) exclusiveCollected += paid - balancePart;
      if (r.balance_settled && r.balance_paid_at && periodKeyOf(r.balance_paid_at, kind) === month) exclusiveCollected += balancePart;
    });

    const toursCollected = inMonth.reduce((s, b) => s + collectedOf(b), 0);

    // Every balance still owed (any month), soonest tour first.
    const balances = [
      ...bookings.filter((b) => balanceOf(b) > 0).map((b) => ({
        kind: 'Tour', name: b.full_name, ref: b.booking_number, contact: b.contact_number,
        what: b.tours?.title || 'Tour', date: b.tours?.start_date || '', amount: balanceOf(b),
      })),
      ...exclusives
        .filter((r) => r.payment_status === 'Paid' && !r.balance_settled && Number(r.package_details?.price) > (Number(r.amount_paid) || 0))
        .map((r) => ({
          kind: 'Private', name: r.full_name, ref: `Private #${String(r.id).slice(0, 8)}`, contact: '',
          what: r.package_details?.destination || r.destination || 'Private tour', date: r.preferred_date || '',
          amount: Number(r.package_details.price) - (Number(r.amount_paid) || 0),
        })),
    ].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

    return {
      collected: toursCollected + exclusiveCollected,
      regularTotal: [...perTour.values()].reduce((sum, t) => sum + t.regular, 0),
      missingRates: [...perTour.values()].filter((t) => !t.hasRate).length,
      toursCollected,
      exclusiveCollected,
      bookings: inMonth.length,
      pax: inMonth.reduce((s, b) => s + (b.slots_booked || 1), 0),
      perTour: [...perTour.values()].sort((a, b) => b.collected - a.collected),
      balances,
      balanceTotal: balances.reduce((s, r) => s + r.amount, 0),
    };
  }, [bookings, exclusives, rates, month, kind]);

  // Reports' Download PDF includes this summary.
  useEffect(() => {
    if (!loading) onData?.({ monthLabel: periodLabel(month, kind), ...summary });
  }, [loading, month, kind, summary, onData]);

  return (
    <section aria-labelledby="sales-summary-title" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 id="sales-summary-title" style={{ fontSize: 18, fontWeight: 900, color: '#1A0A00', margin: 0, letterSpacing: '-0.01em' }}>Sales Summary</h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>Money actually received, and who still owes a balance.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Show by" style={{ display: 'flex', gap: 4, background: '#F2E4D0', borderRadius: 12, padding: 4 }}>
            {[['day', 'Day'], ['month', 'Month'], ['year', 'Year']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => pickKind(k)} style={{
                border: 'none', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: kind === k ? '#1A0A00' : 'transparent', color: kind === k ? '#FDF6EE' : '#5C2A10',
              }}>{l}</button>
            ))}
          </div>
          {kind === 'day' ? (
            <NiceDate aria-label="Day" value={month} max={periodKeyOf(new Date(), 'day')} clearable={false} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ minWidth: 200 }} />
          ) : kind === 'year' ? (
            <NiceSelect aria-label="Year" value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
              {lastYears(5).map((k) => <option key={k} value={k}>{k}</option>)}
            </NiceSelect>
          ) : (
            <NiceSelect aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
              {lastMonths(24).map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </NiceSelect>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12 }}>
        <Stat icon={<Wallet size={17} />} label={`Collected ${kind === 'day' ? 'on' : 'in'} ${periodLabel(month, kind)}`} value={loading ? '…' : formatPeso(summary.collected)}
          sub={loading ? '' : summary.exclusiveCollected ? `${formatPeso(summary.toursCollected)} tours · ${formatPeso(summary.exclusiveCollected)} exclusive` : 'From tour bookings'} />
        <Stat icon={<Users size={17} />} label="Paid bookings" value={loading ? '…' : String(summary.bookings)} sub={loading ? '' : `${summary.pax} joiner${summary.pax === 1 ? '' : 's'}`} />
        <Stat icon={<Wallet size={17} />} label="At Regular Rate" value={loading ? '…' : formatPeso(summary.regularTotal)}
          sub={loading ? '' : summary.missingRates ? `${summary.missingRates} tour${summary.missingRates === 1 ? ' has' : 's have'} no Regular Rate yet` : 'Regular Rate × joiners, tour bookings'} />
        <Stat icon={<AlertCircle size={17} />} tone="warn" label="Unpaid balances" value={loading ? '…' : formatPeso(summary.balanceTotal)}
          sub={loading ? '' : `${summary.balances.length} booking${summary.balances.length === 1 ? '' : 's'}, all months`} />
      </div>

      {!loading && (
        <>
          <p style={subTitle}>Per tour · {periodLabel(month, kind)}</p>
          {summary.perTour.length === 0 ? (
            <p style={muted}>No payments {kind === 'day' ? 'on this day' : `this ${kind}`} yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="stack-table" style={table}>
                <thead>
                  <tr>{['Tour', 'Date', 'Joiners', 'Collected', 'At Regular Rate', 'Balance due'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {summary.perTour.map((t) => (
                    <tr key={`${t.title}-${t.start}`}>
                      <td style={{ ...td, fontWeight: 800 }}>{t.title}</td>
                      <td style={td}>{t.start ? formatYmdRange(t.start, t.end) : '—'}</td>
                      <td style={td}>{t.pax}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{formatPeso(t.collected)}</td>
                      <td style={{ ...td, fontWeight: t.hasRate ? 800 : 600, color: t.hasRate ? '#1A0A00' : '#8C2F1C' }}>{t.hasRate ? formatPeso(t.regular) : 'Not set'}</td>
                      <td style={{ ...td, color: t.balance ? '#8C5216' : '#7A3A18', fontWeight: t.balance ? 800 : 600 }}>{t.balance ? formatPeso(t.balance) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button type="button" onClick={() => setShowBalances((v) => !v)} aria-expanded={showBalances} style={toggleBtn}>
            Unpaid balances ({summary.balances.length})
            <ChevronDown size={15} style={{ transform: showBalances ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {showBalances && (summary.balances.length === 0 ? (
            <p style={muted}>Everyone is fully paid. 🎉</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="stack-table" style={table}>
                <thead>
                  <tr>{['Name', 'Reference', 'Tour', 'Tour date', 'Balance'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {summary.balances.map((r) => (
                    <tr key={r.ref}>
                      <td style={{ ...td, fontWeight: 800 }}>{r.name || '—'}{r.contact ? <span style={{ display: 'block', fontWeight: 600, fontSize: 11.5, color: '#7A3A18' }}>{r.contact}</span> : null}</td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{r.ref}</td>
                      <td style={td}>{r.what}</td>
                      <td style={td}>{r.date ? formatYmdRange(r.date, '') : '—'}</td>
                      <td style={{ ...td, fontWeight: 900, color: '#8C5216' }}>{formatPeso(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </section>
  );
};

const Stat = ({ icon, label, value, sub, tone }) => (
  <div style={{ background: tone === 'warn' ? 'rgba(232,162,101,0.18)' : '#F2E4D0', borderRadius: 16, padding: '14px 16px' }}>
    <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: tone === 'warn' ? '#8C5216' : '#7A3A18', margin: 0 }}>
      {icon} {label}
    </p>
    <p style={{ fontSize: 'clamp(18px, 6.5vw, 24px)', fontWeight: 900, color: '#1A0A00', margin: '6px 0 0', letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{value}</p>
    {sub && <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>{sub}</p>}
  </div>
);

const card = {
  background: '#FDF6EE', borderRadius: 22, padding: '1.5rem',
  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.05)',
};
const selectStyle = {
  background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '9px 12px',
  fontSize: 12.5, fontWeight: 800, color: '#1A0A00', fontFamily: 'inherit', cursor: 'pointer',
};
const subTitle = { fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', margin: '20px 0 8px' };
const toggleBtn = {
  ...subTitle, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0,
  cursor: 'pointer', fontFamily: 'inherit', margin: '20px 0 8px',
};
const muted = { fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0 };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 };
const th = { textAlign: 'left', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', padding: '8px 10px', borderBottom: '1px solid rgba(180,81,30,0.18)' };
const td = { padding: '9px 10px', color: '#1A0A00', fontWeight: 600, borderBottom: '1px solid rgba(180,81,30,0.08)', verticalAlign: 'top' };

export default SalesSummary;
