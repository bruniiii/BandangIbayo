import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// SUPPLIERS (System Maintenance → Suppliers; the tour checklist)
// The agency's regular suppliers. Admins only: joiners never read them.
// ─────────────────────────────────────────────

// [value, label, what joiners usually see]
export const SUPPLIER_TYPES = [
  ['van_rental', 'Van rental', 'Van roundtrip'],
  ['tour_guide', 'Tour guide', 'Tour guide'],
  ['boat', 'Boat', 'Boat ride'],
  ['accommodation', 'Accommodation', 'Accommodation'],
  ['attraction', 'Attraction', 'Entrance fee'],
  ['food', 'Food', 'Meals'],
  ['other', 'Other', ''],
];
export const TYPE_LABEL = Object.fromEntries(SUPPLIER_TYPES.map(([v, l]) => [v, l]));
export const TYPE_INCLUSION = Object.fromEntries(SUPPLIER_TYPES.map(([v, , i]) => [v, i]));
export const BASIS_LABEL = { per_person: 'per person', per_trip: 'per trip' };

// Same words, ignoring capitals and extra spaces.
export const sameText = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Does a supplier serve this tour destination? "Baguio City" serves
// "Baguio City, Benguet"; "Sagada" serves "Sagada, Mountain Province".
export const servesDestination = (supplier, destination) => {
  const d = String(destination || '').toLowerCase();
  if (!d.trim()) return false;
  return (supplier.destinations || []).some((x) => {
    const s = String(x || '').trim().toLowerCase();
    return s && (d.includes(s) || s.includes(d.trim()));
  });
};

// The database's checks, in plain words.
export const supplierErrorText = (err) => {
  const m = String(err?.message || err || '');
  if (/suppliers_name_unique|already saved/i.test(m)) return m.includes('already saved') ? m : 'A supplier with that name is already saved.';
  if (/suppliers_phone_check/.test(m)) return 'The contact number must be a Philippine number like 0917 123 4567.';
  if (/suppliers_rate_check/.test(m)) return 'The rate must be ₱0 or more.';
  if (/suppliers_name_check/.test(m)) return 'The name must be 2 to 120 characters.';
  if (/suppliers_inclusion_check/.test(m)) return 'The inclusion name must be 2 to 80 characters.';
  return m;
};

// Average joiner rating per supplier: { [supplierId]: { avg, count } }.
// (Empty until the ratings update is installed.)
export const loadSupplierRatings = async () => {
  const { data, error } = await supabase.rpc('supplier_rating_summary');
  if (error || !Array.isArray(data)) return {};
  return Object.fromEntries(data.map((r) => [r.supplier_id, { avg: Number(r.avg_rating) || 0, count: Number(r.ratings) || 0 }]));
};

export const loadSuppliers = async ({ activeOnly = false } = {}) => {
  let q = supabase.from('suppliers').select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  return { suppliers: data || [], error };
};
