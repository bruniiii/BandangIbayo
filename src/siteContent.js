import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// SITE CONTENT (System Maintenance → Home Page & Banner): the announcement banner,
// the landing page headline and photos, and the no-tour dates. Loaded at
// startup (everyone can read them) and kept in this browser.
// ─────────────────────────────────────────────

export let SITE = { announcement: null, landing: {}, blackouts: [] };
const CACHE_KEY = 'bi_site_content';
try { const raw = localStorage.getItem(CACHE_KEY); if (raw) SITE = { ...SITE, ...JSON.parse(raw) }; } catch { /* nothing saved */ }

export const loadSiteContent = async () => {
  const [c, b] = await Promise.all([
    supabase.rpc('get_site_content'),
    supabase.from('blackout_dates').select('start_date, end_date, reason').eq('is_active', true).order('start_date'),
  ]);
  if (c.error) return SITE; // before the update: nothing changes
  SITE = { announcement: c.data?.announcement || null, landing: c.data?.landing || {}, blackouts: b.error ? [] : b.data || [] };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(SITE)); } catch { /* private mode */ }
  return SITE;
};

// The no-tour date that touches these days, as text ("Christmas (Dec 25 – Dec 26)"), or ''.
export const blackoutOn = (start, end = start) => {
  if (!start) return '';
  const hit = (SITE.blackouts || []).find((b) => b.start_date <= (end || start) && b.end_date >= start);
  if (!hit) return '';
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${hit.reason} (${fmt(hit.start_date)}${hit.end_date !== hit.start_date ? ` – ${fmt(hit.end_date)}` : ''})`;
};
