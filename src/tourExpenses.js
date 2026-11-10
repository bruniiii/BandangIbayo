import { supabase } from './supabaseClient';
import { BAG_TAG_FEE } from './bookingRules';

// ─────────────────────────────────────────────
// TOUR EXPENSES (tour_expenses table): what a tour date costs the agency.
// Admins set them in Tour Management; joiners booked on the tour can read them.
// ─────────────────────────────────────────────

// The Bag Tag fee is a booking rule (System Maintenance → Booking Rules).
export { BAG_TAG_FEE };

// [{ label, amount }] in the order shown everywhere (van, guide, bag tag, others).
export const expenseItems = (e) => (e ? [
  { label: 'Van Rent', amount: Number(e.van_rent) || 0 },
  { label: 'Tour Guide', amount: Number(e.tour_guide) || 0 },
  { label: 'Bag Tag', amount: Number(e.bag_tag ?? BAG_TAG_FEE) || 0 },
  ...(Array.isArray(e.others) ? e.others : []).map((o) => ({ label: o.name, amount: Number(o.amount) || 0 })),
] : []);

export const expensesTotal = (e) => expenseItems(e).reduce((sum, i) => sum + i.amount, 0);

export const fetchTourExpenses = async (tourId) => {
  const { data, error } = await supabase.from('tour_expenses').select('*').eq('tour_id', tourId).maybeSingle();
  return error ? null : data;
};

// ─────────────────────────────────────────────
// EXPENSE LINES (tour_expense_lines, the supplier checklist)
// A tour's costs: ticked suppliers and one-off costs, each with its own rate.
// Admins only; joiners get the names through tour_inclusion_names().
// ─────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  ['van_rental', 'Van rental'], ['tour_guide', 'Tour guide'], ['boat', 'Boat'], ['accommodation', 'Accommodation'],
  ['attraction', 'Attraction'], ['food', 'Food'], ['other', 'Other'], ['bag_tag', 'Bag Tag'],
];
export const CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES);

let lineKey = 0;
export const newLineKey = () => `line-${Date.now()}-${++lineKey}`;

// A line in the form: { key, id?, supplier_id, category, label, rate (text), rate_basis, is_unplanned }.
export const bagTagLine = () => ({ key: newLineKey(), supplier_id: null, category: 'bag_tag', label: 'Bag Tag', rate: String(BAG_TAG_FEE), rate_basis: 'per_trip', is_unplanned: false });

// Saved lines → form lines (the Bag Tag is always there).
export const formLinesOf = (rows) => {
  const lines = (rows || []).filter((r) => !r.is_unplanned)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({ key: newLineKey(), id: r.id, supplier_id: r.supplier_id || null, category: r.category, label: r.label, rate: String(Number(r.rate) || 0), rate_basis: r.rate_basis, is_unplanned: false }));
  return lines.some((l) => l.category === 'bag_tag') ? lines : [...lines, bagTagLine()];
};

// Old-style expenses ({ van_rent, tour_guide, others }, e.g. a template) → form lines.
export const linesFromLegacy = (e) => {
  if (!e) return [bagTagLine()];
  const lines = [];
  if (Number(e.van_rent) > 0) lines.push({ key: newLineKey(), supplier_id: null, category: 'van_rental', label: 'Van Rent', rate: String(e.van_rent), rate_basis: 'per_trip', is_unplanned: false });
  if (Number(e.tour_guide) > 0) lines.push({ key: newLineKey(), supplier_id: null, category: 'tour_guide', label: 'Tour Guide', rate: String(e.tour_guide), rate_basis: 'per_trip', is_unplanned: false });
  (Array.isArray(e.others) ? e.others : []).filter((o) => String(o.name || '').trim())
    .forEach((o) => lines.push({ key: newLineKey(), supplier_id: null, category: 'other', label: String(o.name).trim(), rate: String(Number(o.amount) || 0), rate_basis: 'per_trip', is_unplanned: false }));
  return [...lines, bagTagLine()];
};

export const lineQuantity = (line, people) => (line.rate_basis === 'per_person' ? Math.max(0, Number(people) || 0) : 1);
export const lineAmount = (line, people) => Math.round((Number(line.rate) || 0) * lineQuantity(line, people) * 100) / 100;
export const linesTotal = (lines, people) => (lines || []).reduce((s, l) => s + lineAmount(l, people), 0);

// What's wrong with the checklist (messages), checked again by the database.
export const linesErrors = (lines, people, rules) => {
  const out = [];
  (lines || []).forEach((l) => {
    const name = l.label.trim() || 'An expense';
    const rate = String(l.rate ?? '').trim();
    if (!l.label.trim()) out.push('Every expense line needs a name.');
    if (rate === '' || !/^\d+(\.\d{1,2})?$/.test(rate)) out.push(`${name}: enter a rate of ₱0 or more.`);
    const amount = lineAmount(l, people);
    if (l.category === 'van_rental' && (amount < rules.vanMin || amount > rules.vanMax)) out.push(`${name}: van rent must be from ₱${rules.vanMin.toLocaleString('en-PH')} to ₱${rules.vanMax.toLocaleString('en-PH')} (now ₱${amount.toLocaleString('en-PH')}).`);
    if (l.category === 'tour_guide' && (amount < rules.guideMin || amount > rules.guideMax)) out.push(`${name}: a tour guide must be from ₱${rules.guideMin.toLocaleString('en-PH')} to ₱${rules.guideMax.toLocaleString('en-PH')} (now ₱${amount.toLocaleString('en-PH')}).`);
  });
  return [...new Set(out)];
};

// For saving (save_tour_expense_lines).
export const linesPayload = (lines) => (lines || []).map((l, i) => ({
  id: l.id || null, supplier_id: l.supplier_id || null, category: l.category, label: l.label.trim(),
  rate: Math.round((Number(l.rate) || 0) * 100) / 100, rate_basis: l.rate_basis, is_unplanned: false, sort_order: i + 1,
}));

// Saves one tour date's lines. people: joiners for per-person lines.
export const saveTourLines = async (tourId, people, lines) => {
  const { error } = await supabase.rpc('save_tour_expense_lines', { p_tour_id: tourId, p_people: Math.max(0, Number(people) || 0), p_lines: linesPayload(lines) });
  if (error) throw error;
};

// Every tour's lines, grouped: { [tourId]: rows }.
export const loadLinesByTour = async (tourIds = null) => {
  let q = supabase.from('tour_expense_lines').select('*').order('sort_order');
  if (tourIds) q = q.in('tour_id', tourIds);
  const { data, error } = await q;
  const by = {};
  (data || []).forEach((r) => { (by[r.tour_id] ||= []).push(r); });
  return { byTour: by, error };
};

// What a joiner sees a tour covers: names only.
export const fetchInclusionNames = async (tourId) => {
  if (tourId == null) return [];
  const { data, error } = await supabase.rpc('tour_inclusion_names', { p_tour_id: tourId });
  if (!error && Array.isArray(data)) return data;
  // Before the expense lines update: the old table.
  const old = await fetchTourExpenses(tourId);
  return old ? expenseItems(old).map((i) => i.label) : [];
};

// The same checklist saved on another date of the trip: each line keeps that
// date's own line (matched by id, supplier, or name and category), so its
// actual amounts and ratings stay attached.
export const matchLineIds = (lines, existingRows) => {
  const free = [...(existingRows || [])];
  const take = (pred) => { const i = free.findIndex(pred); return i < 0 ? null : free.splice(i, 1)[0]; };
  return lines.map((l) => {
    const hit = (l.id && take((r) => r.id === l.id))
      || (l.supplier_id && take((r) => r.supplier_id === l.supplier_id))
      || take((r) => !r.supplier_id && r.category === l.category && String(r.label).trim().toLowerCase() === l.label.trim().toLowerCase());
    return { ...l, id: hit ? hit.id : undefined };
  });
};

// What a saved line cost: the actual amount once the tour's expenses are
// entered (Part 3), otherwise the estimate. finalOnly: use actuals only when
// the tour's expenses are final.
export const lineCost = (row, { useActual = true } = {}) =>
  (useActual && row.actual_amount != null ? Number(row.actual_amount) : (row.is_unplanned ? 0 : Number(row.estimated_amount))) || 0;
