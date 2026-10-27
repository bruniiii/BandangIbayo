import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// TOUR EXPENSES (tour_expenses table): what a tour date costs the agency.
// Admins set them in Tour Management; joiners booked on the tour can read them.
// ─────────────────────────────────────────────

export const BAG_TAG_FEE = 260;

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
