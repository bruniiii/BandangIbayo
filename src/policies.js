import { supabase } from './supabaseClient';
import { RULES } from './bookingRules';

// ─────────────────────────────────────────────
// POLICIES (System Maintenance → Policies & Content)
// The current Terms & Conditions from the database (site_policies). Words
// in {braces} are the Booking Rules, filled in when shown, e.g.
// {cancellation_cutoff_days} → 14. "## " starts a section.
// ─────────────────────────────────────────────

export const POLICY_WORDS = [
  ['downpayment_percent', 'downpayment %'], ['private_downpayment_percent', 'private tour downpayment %'],
  ['cancellation_cutoff_days', 'cancellation cutoff (days)'], ['weather_choice_hours', 'time to choose after bad weather (hours)'],
  ['weather_refund_percent', 'weather refund %'], ['payment_hold_minutes', 'payment hold (minutes)'],
];

export const fillPolicy = (text) => String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in RULES ? String(RULES[k]) : m));

// "## Title\ntext…" → [{ title, text }]
export const policySections = (body) => {
  const out = [];
  let cur = null;
  fillPolicy(body).split('\n').forEach((line) => {
    if (line.startsWith('## ')) { cur = { title: line.slice(3).trim(), text: '' }; out.push(cur); return; }
    if (!cur) { cur = { title: '', text: '' }; out.push(cur); }
    cur.text += (cur.text ? '\n' : '') + line;
  });
  return out.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.title || s.text);
};

const cache = {};
// The current version of a policy, or null (then the built-in text is used).
export const loadPolicy = async (slug = 'terms') => {
  if (cache[slug] !== undefined) return cache[slug];
  const { data, error } = await supabase.from('site_policies').select('slug, title, body, version, published_at').eq('slug', slug).eq('is_current', true).maybeSingle();
  cache[slug] = error ? null : data || null;
  return cache[slug];
};
export const forgetPolicy = (slug = 'terms') => { delete cache[slug]; };
