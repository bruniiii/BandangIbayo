import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// DESTINATIONS (System Maintenance → Destinations): the saved list of
// destinations, suggested in the tour, package, supplier and request forms
// so everyone uses the same names.
// ─────────────────────────────────────────────

export const PH_REGIONS = [
  'NCR (Metro Manila)', 'CAR (Cordillera)', 'Ilocos Region', 'Cagayan Valley', 'Central Luzon', 'CALABARZON', 'MIMAROPA', 'Bicol Region',
  'Western Visayas', 'Central Visayas', 'Eastern Visayas', 'Negros Island Region', 'Zamboanga Peninsula', 'Northern Mindanao', 'Davao Region', 'SOCCSKSARGEN', 'Caraga', 'BARMM',
];

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
let cache = null;

// Active destinations (everyone), or all of them for the Destinations tab.
export const loadDestinations = async ({ all = false, fresh = false } = {}) => {
  if (!all && cache && !fresh) return cache;
  let q = supabase.from('destinations').select('*').order('name');
  if (!all) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return all ? { rows: [], error } : [];
  if (all) return { rows: data || [], error: null };
  cache = data || [];
  return cache;
};
export const forgetDestinations = () => { cache = null; };

// Admins: a tour saved with a new destination adds it to the list (so the
// next form suggests it). Quietly does nothing if it's there or can't be added.
export const ensureDestination = async (name) => {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return false;
  const list = await loadDestinations({ fresh: true });
  if (list.some((d) => norm(d.name) === norm(clean))) return false;
  const { error } = await supabase.from('destinations').insert([{ name: clean }]);
  forgetDestinations();
  return !error;
};
