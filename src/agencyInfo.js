import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// AGENCY INFORMATION (System Maintenance → Agency Information)
// The agency's name, email, phone, Facebook page, address and logo, shown on
// the landing page, receipts and the help button. Loaded once at startup
// (get_agency_info, readable by everyone) and kept in this browser for the
// next visit. These defaults are what the website showed before.
// ─────────────────────────────────────────────

export const DEFAULT_AGENCY = Object.freeze({
  name: 'Bandang IBAYO',
  email: 'bandangibayo@gmail.com',
  phone: '+63 999 307 1958',
  facebook: 'https://www.facebook.com/bandangibayo',
  address: 'Bulacan, Philippines',
  logo_url: '',
});

const CACHE_KEY = 'bi_agency_info';
export let AGENCY = { ...DEFAULT_AGENCY };

export const applyAgencyInfo = (raw) => {
  const next = { ...DEFAULT_AGENCY };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_AGENCY)) {
      if (typeof raw[k] === 'string' && raw[k].trim()) next[k] = raw[k].trim();
    }
  }
  AGENCY = next;
  return next;
};

try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) applyAgencyInfo(JSON.parse(raw));
} catch { /* nothing saved */ }

export const loadAgencyInfo = async () => {
  const { data, error } = await supabase.rpc('get_agency_info');
  if (error || !data) return AGENCY;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  return applyAgencyInfo(data);
};
