import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// BOOKING RULES (System Maintenance → Booking Rules)
//
// The business rules live in the database (public.booking_rules), so the main
// admin can change them without editing code. The website reads them once
// at startup through get_booking_rules() and keeps a copy in this browser,
// so the next visit starts with them right away.
//
// The values below are the ones the website used before the rules moved to
// the database; they're used only until the rules are loaded (or if they
// can't be). The database checks every rule again on its own, so a stale
// copy here can never let something through.
// ─────────────────────────────────────────────

export const DEFAULT_RULES = Object.freeze({
  cancellation_cutoff_days: 14,
  cancellation_approval_hours: 12,
  downpayment_percent: 50,
  payment_hold_minutes: 30,
  requested_hold_hours: 48,
  sale_discount_percent: 5,
  weather_refund_percent: 50,
  weather_choice_hours: 48,
  reminder_lead_days: 1,
  balance_reminder_days: 3,
  private_downpayment_percent: 50,
  private_downpayment_due_hours: 24,
  private_budget_min: 3000,
  private_budget_max: 100000,
  request_lead_days: 21,
  request_approval_cutoff_days: 14,
  request_review_days: 30,
  request_gap_days: 14,
  regular_rate_min: 1300,
  regular_rate_max: 7500,
  joiner_rate_min: 1800,
  joiner_rate_max: 7500,
  joiner_rate_margin: 500,
  tour_lead_days: 21,
  max_tour_days: 7,
  max_tour_slots: 14,
  van_seats: 14,
  max_vans: 5,
  van_rent_min: 15000,
  van_rent_max: 30000,
  tour_guide_min: 1300,
  tour_guide_max: 2000,
  bag_tag_fee: 260,
});

const CACHE_KEY = 'bi_booking_rules';

// The rules in use right now (always a full set: defaults filled in).
export let RULES = { ...DEFAULT_RULES };

// Named rules, used all over the website. They're live bindings: when the
// rules are loaded, every file that imports them sees the new values.
export let CANCELLATION_CUTOFF_DAYS = DEFAULT_RULES.cancellation_cutoff_days;
export let CANCELLATION_APPROVAL_HOURS = DEFAULT_RULES.cancellation_approval_hours;
export let DOWNPAYMENT_PERCENT = DEFAULT_RULES.downpayment_percent;
export let PAYMENT_HOLD_MINUTES = DEFAULT_RULES.payment_hold_minutes;
export let REQUESTED_HOLD_HOURS = DEFAULT_RULES.requested_hold_hours;
export let SALE_DISCOUNT = DEFAULT_RULES.sale_discount_percent / 100;
export let WEATHER_REFUND_PERCENT = DEFAULT_RULES.weather_refund_percent;
export let WEATHER_CHOICE_HOURS = DEFAULT_RULES.weather_choice_hours;
export let PRIVATE_DOWNPAYMENT_PERCENT = DEFAULT_RULES.private_downpayment_percent;
export let PRIVATE_DOWNPAYMENT_DUE_HOURS = DEFAULT_RULES.private_downpayment_due_hours;
export let EXCLUSIVE_RATE_MIN = DEFAULT_RULES.private_budget_min;
export let EXCLUSIVE_RATE_MAX = DEFAULT_RULES.private_budget_max;
export let TRIP_REQUEST_LEAD_DAYS = DEFAULT_RULES.request_lead_days;
export let EXCLUSIVE_APPROVAL_CUTOFF_DAYS = DEFAULT_RULES.request_approval_cutoff_days;
export let REQUEST_REVIEW_DAYS = DEFAULT_RULES.request_review_days;
export let REQUEST_GAP_DAYS = DEFAULT_RULES.request_gap_days;
export let REGULAR_RATE_MIN = DEFAULT_RULES.regular_rate_min;
export let REGULAR_RATE_MAX = DEFAULT_RULES.regular_rate_max;
export let JOINER_RATE_MIN = DEFAULT_RULES.joiner_rate_min;
export let JOINER_RATE_MAX = DEFAULT_RULES.joiner_rate_max;
export let JOINER_RATE_MARGIN = DEFAULT_RULES.joiner_rate_margin;
export let TOUR_LEAD_DAYS = DEFAULT_RULES.tour_lead_days;
export let MAX_TOUR_DAYS = DEFAULT_RULES.max_tour_days;
export let MAX_TOUR_SLOTS = DEFAULT_RULES.max_tour_slots;
export let VAN_SEATS = DEFAULT_RULES.van_seats;
export let MAX_VANS = DEFAULT_RULES.max_vans;
export let VAN_RENT_MIN = DEFAULT_RULES.van_rent_min;
export let VAN_RENT_MAX = DEFAULT_RULES.van_rent_max;
export let TOUR_GUIDE_MIN = DEFAULT_RULES.tour_guide_min;
export let TOUR_GUIDE_MAX = DEFAULT_RULES.tour_guide_max;
export let BAG_TAG_FEE = DEFAULT_RULES.bag_tag_fee;
export let RATE_HINT = '';

// "₱1,300.00"
const peso = (n) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// 1300 → "1,300.00"
export const amountText = (n) => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Placeholder of a money box: "1,300.00 – 7,500.00"
export const rangeText = (min, max) => `${amountText(min)} – ${amountText(max)}`;
// 50 → "50", 12.5 → "12.5"
export const pctText = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
// 14 → "14 days", 1 → "1 day"
export const daysText = (n) => `${n} day${Number(n) === 1 ? '' : 's'}`;
// 21 → "3 weeks", 14 → "2 weeks", 7 → "1 week", 10 → "10 days"
export const periodText = (n) => {
  const d = Number(n) || 0;
  return d > 0 && d % 7 === 0 ? `${d / 7} week${d === 7 ? '' : 's'}` : daysText(d);
};
// 48 → "2 days", 36 → "36 hours"
export const holdText = (hours) => {
  const h = Number(hours) || 0;
  return h > 0 && h % 24 === 0 ? daysText(h / 24) : hoursText(h);
};
// 48 → "48 hours", 1 → "1 hour"
export const hoursText = (n) => `${n} hour${Number(n) === 1 ? '' : 's'}`;
// 30 → "30 minutes", 90 → "1 hour 30 minutes", 120 → "2 hours"
export const minutesText = (n) => {
  const m = Number(n) || 0;
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${hoursText(h)} ${rest} minute${rest === 1 ? '' : 's'}` : hoursText(h);
};

const clean = (raw) => {
  const out = { ...DEFAULT_RULES };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_RULES)) {
      const v = Number(raw[k]);
      if (raw[k] !== null && raw[k] !== '' && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
};

export const applyBookingRules = (raw) => {
  const r = clean(raw);
  RULES = r;
  CANCELLATION_CUTOFF_DAYS = r.cancellation_cutoff_days;
  CANCELLATION_APPROVAL_HOURS = r.cancellation_approval_hours;
  DOWNPAYMENT_PERCENT = r.downpayment_percent;
  PAYMENT_HOLD_MINUTES = r.payment_hold_minutes;
  REQUESTED_HOLD_HOURS = r.requested_hold_hours;
  SALE_DISCOUNT = r.sale_discount_percent / 100;
  WEATHER_REFUND_PERCENT = r.weather_refund_percent;
  WEATHER_CHOICE_HOURS = r.weather_choice_hours;
  PRIVATE_DOWNPAYMENT_PERCENT = r.private_downpayment_percent;
  PRIVATE_DOWNPAYMENT_DUE_HOURS = r.private_downpayment_due_hours;
  EXCLUSIVE_RATE_MIN = r.private_budget_min;
  EXCLUSIVE_RATE_MAX = r.private_budget_max;
  TRIP_REQUEST_LEAD_DAYS = r.request_lead_days;
  EXCLUSIVE_APPROVAL_CUTOFF_DAYS = r.request_approval_cutoff_days;
  REQUEST_REVIEW_DAYS = r.request_review_days;
  REQUEST_GAP_DAYS = r.request_gap_days;
  REGULAR_RATE_MIN = r.regular_rate_min;
  REGULAR_RATE_MAX = r.regular_rate_max;
  JOINER_RATE_MIN = r.joiner_rate_min;
  JOINER_RATE_MAX = r.joiner_rate_max;
  JOINER_RATE_MARGIN = r.joiner_rate_margin;
  TOUR_LEAD_DAYS = r.tour_lead_days;
  MAX_TOUR_DAYS = r.max_tour_days;
  MAX_TOUR_SLOTS = r.max_tour_slots;
  VAN_SEATS = r.van_seats;
  MAX_VANS = r.max_vans;
  VAN_RENT_MIN = r.van_rent_min;
  VAN_RENT_MAX = r.van_rent_max;
  TOUR_GUIDE_MIN = r.tour_guide_min;
  TOUR_GUIDE_MAX = r.tour_guide_max;
  BAG_TAG_FEE = r.bag_tag_fee;
  RATE_HINT = `Admins only, never shown to joiners. Regular Rate ${peso(REGULAR_RATE_MIN)} – ${peso(REGULAR_RATE_MAX)}; Joiner Rate (what joiners pay) ${peso(JOINER_RATE_MIN)} – ${peso(JOINER_RATE_MAX)}, at least ${peso(JOINER_RATE_MARGIN)} more than the Regular Rate.`;
  return r;
};

// The copy saved in this browser, applied right away (before anything renders).
const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const cached = readCache();
applyBookingRules(cached);
export const hasCachedRules = () => !!cached;

// Loads the rules from the database (and saves them for the next visit).
export const loadBookingRules = async () => {
  const { data, error } = await supabase.rpc('get_booking_rules');
  if (error || !data) return RULES;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  return applyBookingRules(data);
};

// ── Rules a booking was made under ──
// Each booking remembers its cancellation cutoff, downpayment and weather
// refund (bookings.rule_… columns), so a later change to the rules never
// touches it. Older rows without them use today's rules.
const own = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const cancelDaysOf = (booking) => own(booking?.rule_cancel_days) ?? CANCELLATION_CUTOFF_DAYS;
export const downpaymentPercentOf = (booking) => own(booking?.rule_downpayment_percent) ?? DOWNPAYMENT_PERCENT;
export const weatherRefundPercentOf = (booking) => own(booking?.rule_weather_refund_percent) ?? WEATHER_REFUND_PERCENT;
