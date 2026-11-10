import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// TOUR MONEY (Reports): one place that works out, per tour date, what joiners
// paid and what the tour cost, so Income per Tour, Expenses and the PDF all
// show the same numbers.
//   Joiner fees: each paid booking's total; for cancelled bookings, what was
//     already paid (payments are non-refundable).
//   Cost: the actual amounts once the tour's expenses are final, otherwise
//     the estimates (and it says which).
// ─────────────────────────────────────────────

export const paidOf = (b) => (b.payment_method === 'Downpayment' && !b.balance_settled ? Number(b.amount_paid) || 0 : Number(b.total_price) || 0);

// A tour's kind: 'private' (private tour package), 'requested' (posted from
// a joiner's request) or 'joiner' (made in Tour Management).
export const TOUR_TYPES = [['joiner', 'Joiner tour'], ['private', 'Private tour'], ['requested', 'Requested tour']];
export const TOUR_TYPE_LABEL = Object.fromEntries(TOUR_TYPES);

export const loadTourFinance = async () => {
  const [t, b, l, r, s, rt] = await Promise.all([
    supabase.from('tours').select('id, title, destination, start_date, end_date, price, is_exclusive, weather_status, expenses_final_at'),
    supabase.from('bookings').select('id, tour_id, booking_number, full_name, slots_booked, total_price, amount_paid, payment_method, payment_status, booking_status, balance_settled')
      .eq('payment_status', 'Complete'),
    supabase.from('tour_expense_lines').select('*').order('sort_order'),
    supabase.from('exclusive_requests').select('request_type, package_details').eq('request_type', 'request'),
    supabase.from('suppliers').select('id, name, supplier_type'),
    supabase.rpc('supplier_rating_summary'),
  ]);
  const error = t.error || b.error || l.error || null;
  const linesByTour = {};
  (l.data || []).forEach((x) => { (linesByTour[x.tour_id] ||= []).push(x); });
  const bookingsByTour = {};
  (b.data || []).forEach((x) => { (bookingsByTour[x.tour_id] ||= []).push(x); });
  const requested = new Set((r.data || []).map((x) => x.package_details?.tour_id).filter(Boolean).map(String));
  const suppliers = Object.fromEntries((s.data || []).map((x) => [x.id, x]));
  const ratings = Object.fromEntries((Array.isArray(rt.data) ? rt.data : []).map((x) => [x.supplier_id, { avg: Number(x.avg_rating) || 0, count: Number(x.ratings) || 0 }]));
  return { tours: t.data || [], linesByTour, bookingsByTour, requested, suppliers, ratings, error };
};

export const tourTypeOf = (tour, requested) => (tour.is_exclusive ? 'private' : requested?.has(String(tour.id)) ? 'requested' : 'joiner');

// Money of one tour date.
export const tourMoney = (tour, data) => {
  const list = (data.bookingsByTour[tour.id] || []).filter((x) => x.booking_status !== 'Rejected');
  const active = list.filter((x) => x.booking_status !== 'Cancelled');
  const cancelled = list.filter((x) => x.booking_status === 'Cancelled');
  const fees = active.reduce((s, x) => s + (Number(x.total_price) || 0), 0) + cancelled.reduce((s, x) => s + paidOf(x), 0);
  const collected = list.reduce((s, x) => s + paidOf(x), 0);
  const rows = data.linesByTour[tour.id] || [];
  const final = !!tour.expenses_final_at;
  const lines = rows.map((x) => {
    const estimated = x.is_unplanned ? 0 : Number(x.estimated_amount) || 0;
    const actual = x.actual_amount != null ? Number(x.actual_amount) : null;
    return {
      ...x, estimated, actual,
      cost: final ? (actual ?? estimated) : estimated,
      supplierName: x.supplier_id ? data.suppliers[x.supplier_id]?.name || '' : '',
    };
  }).filter((x) => final || !x.is_unplanned);
  const estimated = rows.reduce((s, x) => s + (x.is_unplanned ? 0 : Number(x.estimated_amount) || 0), 0);
  const hasActuals = rows.some((x) => x.actual_amount != null);
  const actual = hasActuals ? rows.reduce((s, x) => s + (x.actual_amount != null ? Number(x.actual_amount) : (x.is_unplanned ? 0 : Number(x.estimated_amount) || 0)), 0) : null;
  const cost = lines.reduce((s, x) => s + x.cost, 0);
  const net = fees - cost;
  return {
    tour, type: tourTypeOf(tour, data.requested), active, cancelled, fees, collected, toCollect: Math.max(0, fees - collected),
    pax: active.reduce((s, x) => s + (x.slots_booked || 1), 0),
    lines, hasLines: rows.length > 0, final, estimated, actual, cost, net, margin: fees > 0 ? (net / fees) * 100 : null,
    basis: final ? 'Actual (final)' : 'Estimated',
  };
};

// Tour start dates in a period: 'all', 'y:2026' or 'm:2026-11'.
export const inPeriod = (ymd, p) => {
  if (!ymd) return false;
  if (p === 'all') return true;
  return p.startsWith('y:') ? ymd.startsWith(`${p.slice(2)}-`) : ymd.startsWith(p.slice(2));
};
