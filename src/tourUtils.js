import { supabase } from './supabaseClient';

// Archives tours whose end date has passed (archive_past_tours() in the
// database, which also runs nightly). Called before tour lists load; runs
// at most once per page load and never blocks the list if it fails.
let archiveRun = null;
export const archivePastTours = () => {
  if (!archiveRun) {
    archiveRun = Promise.resolve(supabase.rpc('archive_past_tours')).then(() => {}, () => {});
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

// "Nov 1 - 3, 2026" from a YYYY-MM-DD start date and a duration like "3 Days".
export const formatDateRange = (dateString, duration) => {
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
