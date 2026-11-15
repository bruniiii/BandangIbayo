import { supabase } from './supabaseClient';
import { fillPolicy } from './policies';

// ─────────────────────────────────────────────
// SHORT LISTS AND HELP FAQ (System Maintenance → Lists & FAQ)
// Cancellation reasons, bad-weather reasons, reasons for rejecting a
// request, accommodation choices, difficulty levels and the Help FAQ, kept
// in the database (option_lists, help_faqs). Loaded at startup and saved in
// this browser; these defaults are what the website used before.
// ─────────────────────────────────────────────

export const DEFAULT_LISTS = Object.freeze({
  cancel_reasons: ['Schedule conflict / change of plans', 'Work or school commitments', 'Personal or family emergency', 'Health reasons / feeling unwell', 'Financial reasons', 'Weather or safety concerns', 'Travel companion(s) can’t join', 'Booked the wrong tour or date', 'No longer interested in this tour'],
  weather_reasons: ['Typhoon (PAGASA signal)', 'Heavy rain / flooding', 'Road closure or landslide', 'Trail or park closed (DENR / LGU)', 'Other safety concern'],
  reject_reasons: ['The dates are not available', 'Destination not offered right now', 'Group size not possible', 'Budget is too low for this trip', 'Unsafe, closed or restricted destination', 'Other'],
  accommodation: ['Tent', 'AC Room', 'Non-AC Room'],
  difficulty: ['Easy', 'Moderate', 'Challenging'],
});
export const LIST_NAMES = {
  cancel_reasons: 'Cancellation reasons', weather_reasons: 'Bad-weather reasons', reject_reasons: 'Request rejection reasons',
  accommodation: 'Accommodation choices', difficulty: 'Difficulty levels',
};

export let CANCEL_REASONS = [...DEFAULT_LISTS.cancel_reasons];
export let WEATHER_REASONS = [...DEFAULT_LISTS.weather_reasons];
export let REJECT_REASONS = [...DEFAULT_LISTS.reject_reasons];
export let ACCOMMODATION_OPTIONS = [...DEFAULT_LISTS.accommodation];
export let DIFFICULTY_LEVELS = [...DEFAULT_LISTS.difficulty];
// [{ q, a }] with {braces} filled in from the Booking Rules when shown (null = built-in FAQ).
let faqRows = null;
export const helpFaqs = () => (faqRows ? faqRows.map((f) => ({ q: f.question, a: fillPolicy(f.answer) })) : null);

const CACHE_KEY = 'bi_option_lists';
const apply = (data) => {
  const lists = data?.lists || {};
  const pick = (k) => (Array.isArray(lists[k]) && lists[k].length ? lists[k] : [...DEFAULT_LISTS[k]]);
  CANCEL_REASONS = pick('cancel_reasons');
  WEATHER_REASONS = pick('weather_reasons');
  REJECT_REASONS = pick('reject_reasons');
  ACCOMMODATION_OPTIONS = pick('accommodation');
  DIFFICULTY_LEVELS = pick('difficulty');
  faqRows = Array.isArray(data?.faqs) && data.faqs.length ? data.faqs : null;
};
try { const raw = localStorage.getItem(CACHE_KEY); if (raw) apply(JSON.parse(raw)); } catch { /* nothing saved */ }

export const loadOptionLists = async () => {
  const [o, f] = await Promise.all([
    supabase.from('option_lists').select('list_key, label, sort_order').eq('is_active', true).order('sort_order').order('label'),
    supabase.from('help_faqs').select('question, answer, sort_order').eq('is_active', true).order('sort_order'),
  ]);
  if (o.error) return; // before the 20261231 update: the built-in lists
  const lists = {};
  (o.data || []).forEach((r) => { (lists[r.list_key] ||= []).push(r.label); });
  const data = { lists, faqs: f.error ? [] : f.data || [] };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  apply(data);
};
