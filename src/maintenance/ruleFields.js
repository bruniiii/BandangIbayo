// The booking rules on System Maintenance → Booking Rules (and its search):
// what each one is called, its unit, the allowed range and what it does.

// [key, label, unit, min, max, whole number?, what it does]
export const GROUPS = [
  ['Bookings and payment', [
    ['cancellation_cutoff_days', 'Cancellation cutoff', 'days', 0, 365, true, 'Joiners can cancel or move a booking up to this many days before the tour.'],
    ['cancellation_approval_hours', 'Cancellation request approval', 'hours', 1, 720, true, 'Older cancellation requests not answered within this time are approved automatically.'],
    ['downpayment_percent', 'Downpayment', '%', 1, 100, false, 'Share of the total a joiner pays when they choose the downpayment.'],
    ['payment_hold_minutes', 'Payment hold', 'minutes', 5, 1440, true, 'Slots are held this long while the joiner pays online; unpaid, they open again.'],
    ['requested_hold_hours', 'Requested tour slot hold', 'hours', 1, 720, true, 'When a requested tour is posted, the requester\'s slots are held this long for them to pay.'],
    ['sale_discount_percent', 'Sale discount', '%', 0, 100, false, 'How much less joiners pay on a date that is on sale.'],
  ]],
  ['Weather changes', [
    ['weather_refund_percent', 'Weather refund', '%', 0, 100, false, 'Share of what a joiner paid that is refunded when a date is postponed or cancelled.'],
    ['weather_choice_hours', 'Time to choose', 'hours', 1, 720, true, 'Joiners choose (new date, other date or refund) within this time; no choice = refund.'],
  ]],
  ['Reminders', [
    ['reminder_lead_days', 'Tour reminder', 'days before', 1, 30, true, 'The trip reminder email goes out this many days before the tour (in the evening).'],
    ['balance_reminder_days', 'Balance reminder', 'days before', 1, 60, true, 'Joiners who still owe a balance are reminded when the tour is this many days away (or one day less).'],
  ]],
  ['Private tours and tour requests', [
    ['private_downpayment_percent', 'Private tour downpayment', '%', 1, 100, false, 'Share of the budget paid after a private tour request is approved.'],
    ['private_downpayment_due_hours', 'Private tour downpayment due', 'hours', 1, 720, true, 'Time to pay that downpayment after approval; unpaid, the request closes.'],
    ['private_budget_min', 'Private tour budget, lowest', '₱', 0, 10000000, false, 'Also the lowest Package Price and Regular Rate of a private tour.'],
    ['private_budget_max', 'Private tour budget, highest', '₱', 0, 10000000, false, 'Also the highest Package Price and Regular Rate of a private tour.'],
    ['request_lead_days', 'Earliest trip date', 'days ahead', 0, 365, true, 'Private tours and tour requests can be for trips at least this many days from today.'],
    ['request_approval_cutoff_days', 'Approval cutoff', 'days before', 0, 365, true, 'A request must be approved, and its package sent, at least this many days before the trip.'],
    ['request_review_days', 'Time to send the package', 'days', 1, 365, true, 'Requests without a tour package after this many days are rejected automatically.'],
    ['request_gap_days', 'Time between requests', 'days', 0, 365, true, 'A joiner can send one request (of either kind) every this many days.'],
  ]],
  ['Tour rates', [
    ['regular_rate_min', 'Regular Rate, lowest', '₱', 0, 10000000, false, 'Per person, for tours (not private tours).'],
    ['regular_rate_max', 'Regular Rate, highest', '₱', 0, 10000000, false, 'Per person, for tours (not private tours).'],
    ['joiner_rate_min', 'Joiner Rate, lowest', '₱', 0, 10000000, false, 'What joiners pay per person.'],
    ['joiner_rate_max', 'Joiner Rate, highest', '₱', 0, 10000000, false, 'What joiners pay per person.'],
    ['joiner_rate_margin', 'Joiner Rate above Regular Rate', '₱', 0, 10000000, false, 'The Joiner Rate must be at least this much more than the Regular Rate.'],
  ]],
  ['Tour expenses', [
    ['van_rent_min', 'Van rental, lowest', '₱', 0, 10000000, false, 'The lowest van rental (per trip) allowed in a tour\'s expenses and in private tour packages.'],
    ['van_rent_max', 'Van rental, highest', '₱', 0, 10000000, false, 'The highest van rental (per trip) allowed in a tour\'s expenses and in private tour packages.'],
    ['tour_guide_min', 'Tour guide, lowest', '₱', 0, 10000000, false, 'The lowest tour guide fee allowed in a tour\'s expenses and in private tour packages.'],
    ['tour_guide_max', 'Tour guide, highest', '₱', 0, 10000000, false, 'The highest tour guide fee allowed in a tour\'s expenses and in private tour packages.'],
  ]],
  ['Tours and vans', [
    ['tour_lead_days', 'New tour start', 'days ahead', 0, 365, true, 'A new tour date in Tour Management must start at least this many days from today.'],
    ['max_tour_days', 'Longest trip', 'days', 1, 60, true, 'Tours and requested trips can last at most this many days.'],
    ['max_tour_slots', 'Slots per tour date', 'slots', 1, 500, true, 'The most joiners one tour date can take.'],
    ['van_seats', 'Seats per van', 'people', 1, 100, true, 'Also the biggest group for a tour request (one van).'],
    ['max_vans', 'Vans per private tour', 'vans', 1, 50, true, 'A private tour group can fill up to this many vans.'],
  ]],
];
export const FIELDS = GROUPS.flatMap(([group, list]) => list.map((f) => ({ key: f[0], label: f[1], unit: f[2], min: f[3], max: f[4], whole: f[5], help: f[6], group })));
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
// Pairs that must stay in order: [lower, higher, message].
export const PAIRS = [
  ['private_budget_min', 'private_budget_max', 'The lowest budget can\'t be more than the highest.'],
  ['regular_rate_min', 'regular_rate_max', 'The lowest Regular Rate can\'t be more than the highest.'],
  ['joiner_rate_min', 'joiner_rate_max', 'The lowest Joiner Rate can\'t be more than the highest.'],
  ['van_rent_min', 'van_rent_max', 'The lowest van rental can\'t be more than the highest.'],
  ['tour_guide_min', 'tour_guide_max', 'The lowest tour guide fee can\'t be more than the highest.'],
  ['request_approval_cutoff_days', 'request_lead_days', 'The approval cutoff can\'t be more than the earliest trip date.'],
];

export const shown = (f, v) => (f.unit === '₱'
  ? `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : f.unit === '%' ? `${v}%` : `${v} ${f.unit}`);

// What's wrong with one value ('' = fine).
export const fieldError = (f, raw) => {
  const text = String(raw ?? '').trim();
  if (text === '') return 'Enter a value.';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return text.startsWith('-') ? 'It can\'t be negative.' : 'Enter a number (up to 2 decimals).';
  const v = Number(text);
  if (f.whole && !Number.isInteger(v)) return 'Enter a whole number.';
  if (v < f.min) return `It must be at least ${f.min}.`;
  if (v > f.max) return f.unit === '%' ? 'A percentage can be at most 100.' : `It can be at most ${f.max.toLocaleString('en-PH')}.`;
  return '';
};
