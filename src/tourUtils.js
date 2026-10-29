import { supabase } from './supabaseClient';

// Archives tours whose end date has passed (archive_past_tours() in the
// database, which also runs nightly), and sends joiners their "Pickup Starts
// Today" and "How was your trip?" notices (daily_notices(), also nightly). Called
// before tour lists load; runs at most once per page load and never blocks
// the list if it fails.
let archiveRun = null;
export const archivePastTours = () => {
  if (!archiveRun) {
    archiveRun = Promise.resolve(supabase.rpc('archive_past_tours')).then(() => {}, () => {});
    Promise.resolve(supabase.rpc('daily_notices')).catch(() => {});
    // Cancellation requests left unanswered for 12 hours are approved (also every 15 minutes on the server).
    Promise.resolve(supabase.rpc('run_overdue_cancellations')).catch(() => {});
  }
  return archiveRun;
};

// Filter for .or(): tours that haven't ended yet (end date, or start date
// when a tour has no end date, is today or later in Philippine time).
// Joiner-facing lists use it so a finished tour disappears even before
// it's archived.
export const notEndedFilter = () => {
  const today = todayManila();
  return `end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`;
};

// Same fallback the create_booking database function uses when a tour has no group_size.
export const DEFAULT_GROUP_SIZE = 15;

// Adds current_booked / available_slots to each tour. Slot totals come from the
// tour_slots_booked() database function, which returns counts only — so this works
// for logged-out visitors without exposing anyone's bookings.
export const withAvailableSlots = async (tours) => {
  const { data, error } = await supabase.rpc('tour_slots_booked');
  if (error) console.error('Error fetching slot counts:', error.message);
  const bookedByTour = Object.fromEntries((data || []).map((r) => [r.tour_id, Number(r.slots_booked) || 0]));

  return (tours || []).map((tour) => {
    const currentBooked = bookedByTour[tour.id] || 0;
    return {
      ...tour,
      current_booked: currentBooked,
      available_slots: Math.max(0, (tour.group_size || DEFAULT_GROUP_SIZE) - currentBooked),
    };
  });
};

// "Fri – Sun" (or "Sat" for one day) from a YYYY-MM-DD start date and a duration like "3 Days".
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayRange = (dateString, duration) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const daysMatch = duration ? String(duration).match(/(\d+)\s*day/i) : null;
  const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
  const first = new Date(year, month - 1, day).getDay();
  if (numDays <= 1) return WEEKDAYS[first];
  return `${WEEKDAYS[first]} – ${WEEKDAYS[(first + numDays - 1) % 7]}`;
};

// "Nov 1 - 3, 2026 (Sun – Tue)" from a YYYY-MM-DD start date and a duration like "3 Days".
export const formatDateRange = (dateString, duration) => {
  const dates = formatDateNumbers(dateString, duration);
  return dates ? `${dates} (${weekdayRange(dateString, duration)})` : '';
};

const formatDateNumbers = (dateString, duration) => {
  if (!dateString) return "";
  const [year, month, day] = dateString.split('-').map(Number);
  const daysMatch = duration ? duration.match(/(\d+)\s*day/i) : null;
  const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const startDate = new Date(year, month - 1, day);
  const endDate = new Date(year, month - 1, day + numDays - 1);
  const startMonth = monthNames[startDate.getMonth()];
  const endMonth = monthNames[endDate.getMonth()];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (numDays <= 1) {
    return `${startMonth} ${startDate.getDate()}, ${startYear}`;
  } else if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDate.getDate()} - ${endDate.getDate()}, ${startYear}`;
  } else if (startYear === endYear) {
    return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${startYear}`;
  }
  return `${startMonth} ${startDate.getDate()}, ${startYear} - ${endMonth} ${endDate.getDate()}, ${endYear}`;
};

// Today in Asia/Manila as YYYY-MM-DD (matches tours.start_date).
export const todayManila = () =>
  new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// Only allow in-app paths as post-login redirects: no "//evil.com", "/\\evil.com"
// (browsers treat a backslash like a slash) or absolute URLs.
export const safeNextPath = (next) =>
  typeof next === 'string' && next.startsWith('/') && !/^\/[/\\]/.test(next) && !next.includes('\\')
    ? next
    : null;

// Terms, section 2: no cancellations within two weeks of the tour date.
// Keep in sync with cancellation_cutoff_days() in the database.
export const CANCELLATION_CUTOFF_DAYS = 14;
// Joiners ask to cancel; the agency approves within this many hours (or it happens automatically).
export const CANCELLATION_APPROVAL_HOURS = 12;
// Exclusive tours and tour requests: the earliest trip date is this many days from today.
export const TRIP_REQUEST_LEAD_DAYS = 21;
// Admins can approve an exclusive tour or tour request only this many days
// before its date. Keep in sync with exclusive_requests_guard_approval().
export const EXCLUSIVE_APPROVAL_CUTOFF_DAYS = 14;

// The agency has this many days to review a request and send its tour package.
// Keep in sync with reject_overdue_requests() in the database.
export const REQUEST_REVIEW_DAYS = 30;

const plusDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// Why a request is rejected automatically: no tour package was sent within
// 1 month of the request, or by 2 weeks before the trip date. The database
// marks these Rejected too (reject_overdue_requests); until it runs, they're
// shown as Rejected anyway.
export const requestOverdueReason = (request) => {
  if (!request || request.package_sent_at || !['Pending', 'Approved'].includes(request.status)) return null;
  if (request.preferred_date && request.preferred_date < plusDays(todayManila(), EXCLUSIVE_APPROVAL_CUTOFF_DAYS)) {
    return "The tour package wasn't ready at least 2 weeks before the trip date.";
  }
  if (request.created_at && Date.now() - new Date(request.created_at).getTime() > REQUEST_REVIEW_DAYS * 86400e3) {
    return "The tour package wasn't ready within 1 month of the request.";
  }
  return null;
};

// What admins and joiners see: For Approval → Approved → Tour Confirmed (the
// package was sent), or Rejected.
export const requestStatusLabel = (request) => {
  if (request.status === 'Rejected' || requestOverdueReason(request)) return 'Rejected';
  if (request.status === 'Pending') return 'For Approval';
  if (request.package_sent_at) return 'Tour Confirmed';
  return 'Approved';
};

// Exclusive tours only: how much is paid.
export const requestPaymentLabel = (request) => {
  if (request.request_type !== 'exclusive' || request.payment_status !== 'Paid') return null;
  return request.balance_settled ? 'Fully Paid' : 'Downpayment Paid';
};

// A request the joiner can still change (the agency hasn't approved it yet).
export const requestEditable = (request) => request.status === 'Pending' && !requestOverdueReason(request);

// Last day a joiner can cancel (YYYY-MM-DD), and whether that's still possible today.
export const cancellationDeadline = (startDate) => {
  if (!startDate) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - CANCELLATION_CUTOFF_DAYS)).toISOString().slice(0, 10);
};

export const isWithinCancellationWindow = (startDate) => {
  const deadline = cancellationDeadline(startDate);
  return !!deadline && todayManila() > deadline;
};

// Money in pesos, always with centavos: "₱2,900.00", "₱1,499.50".
export const formatPeso = (amount) =>
  `₱${(Number(amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// SALE: a tour date can be on sale between its sale_starts and sale_ends
// dates (Philippine time, both included): joiners pay 5% less than the Joiner
// Rate. Keep in sync with tour_effective_price() in the database.
export const SALE_DISCOUNT = 0.05;
export const isOnSale = (tour, today = todayManila()) =>
  !!(tour?.sale_starts && tour?.sale_ends && today >= tour.sale_starts && today <= tour.sale_ends);
export const salePriceOf = (price) => Math.round(Number(price || 0) * (1 - SALE_DISCOUNT) * 100) / 100;
// What a joiner pays per person for this tour date today.
export const effectivePrice = (tour) => (isOnSale(tour) ? salePriceOf(tour.price) : Number(tour?.price || 0));
// For a trip (one card, many dates): on sale if any of its dates is.
export const tripOnSale = (trip) => (trip?.dates?.length ? trip.dates.some((d) => isOnSale(d)) : isOnSale(trip));
export const tripAllOnSale = (trip) => (trip?.dates?.length ? trip.dates.every((d) => isOnSale(d)) : isOnSale(trip));

// 40% downpayment, rounded to the centavo (same rule as the database and payments function).
export const downpaymentFor = (total) => Math.round((Number(total) || 0) * 40) / 100;

// One trip, many dates: tours with the same title, destination and price are
// the same trip on different dates. Each date is still its own tour row (so
// bookings, slots, waitlists and check-in stay per date), but lists show the
// trip once and the joiner picks the date.
export const tripKey = (t) =>
  [t.title, t.destination].map((s) => String(s ?? '').trim().toLowerCase()).concat(Number(t.price || 0).toFixed(2)).join('|');

// Groups a date-ordered tour list into trips, keeping the list's order. Each
// trip is one of its dates (the first with slots left, or the first date when
// openFirst is false) plus `dates`: all of the trip's dates, earliest first.
export const groupTripDates = (tours, { openFirst = true } = {}) => {
  const trips = new Map();
  for (const t of tours || []) {
    const key = tripKey(t);
    if (!trips.has(key)) trips.set(key, []);
    trips.get(key).push(t);
  }
  return [...trips.values()].map((dates) => {
    dates.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    const shown = (openFirst && dates.find((d) => (d.available_slots ?? 1) > 0)) || dates[0];
    return { ...shown, dates };
  });
};

// The trip a tour id belongs to, shown on that date (for shared /tours/:id links).
export const tripForDate = (trips, id) => {
  const trip = trips.find((t) => t.dates.some((d) => String(d.id) === String(id)));
  if (!trip) return null;
  return { ...trip.dates.find((d) => String(d.id) === String(id)), dates: trip.dates };
};

// "04:30" → "4:30 AM"; times already like "4:30 AM" stay as they are (pickup stops).
export const formatPickupTime = (value) => {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value || '').trim());
  if (!m) return value || '';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

// ── Tour rates (Tour Management and requested tours; not exclusive tours) ──
// Keep in sync with tour_rates_check_limit() and tours_check_price_limit().
export const REGULAR_RATE_MIN = 1300;
export const REGULAR_RATE_MAX = 7500;
export const JOINER_RATE_MIN = 1800;
export const JOINER_RATE_MAX = 7500;
// The Joiner Rate stays at least this much above the Regular Rate.
export const JOINER_RATE_MARGIN = 500;
export const RATE_HINT = `Admins only, never shown to joiners. Regular Rate ₱1,300.00 – ₱7,500.00; Joiner Rate (what joiners pay) ₱1,800.00 – ₱7,500.00, at least ₱${JOINER_RATE_MARGIN} more than the Regular Rate.`;

const centavosOnly = (n) => Math.abs(Math.round(n * 100) - n * 100) <= 1e-6;

// [field, message] checks for checkFields() on the Regular Rate and Joiner Rate.
export const rateChecks = (regular, joiner, { regularField = 'regular_rate', joinerField = 'price' } = {}) => [
  [regularField, !Number.isFinite(regular) ? 'Please enter the Regular Rate.'
    : regular < REGULAR_RATE_MIN ? `The Regular Rate must be at least ${formatPeso(REGULAR_RATE_MIN)}.`
      : regular > REGULAR_RATE_MAX ? `The Regular Rate can be at most ${formatPeso(REGULAR_RATE_MAX)}.`
        : !centavosOnly(regular) ? 'The Regular Rate can have at most 2 decimal places (centavos).' : ''],
  [joinerField, !Number.isFinite(joiner) ? 'Please enter the Joiner Rate.'
    : joiner < JOINER_RATE_MIN ? `The Joiner Rate must be at least ${formatPeso(JOINER_RATE_MIN)}.`
      : joiner > JOINER_RATE_MAX ? `The Joiner Rate can be at most ${formatPeso(JOINER_RATE_MAX)}.`
        : !centavosOnly(joiner) ? 'The Joiner Rate can have at most 2 decimal places (centavos).'
          : Number.isFinite(regular) && joiner < regular + JOINER_RATE_MARGIN ? `The Joiner Rate must be at least ₱${JOINER_RATE_MARGIN} more than the Regular Rate (at least ${formatPeso(regular + JOINER_RATE_MARGIN)}).` : ''],
];

// Tours (and requested trips) last at most 1 week.
export const MAX_TOUR_DAYS = 7;
