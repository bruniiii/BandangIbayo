// ─────────────────────────────────────────────
// ITINERARY: one box per day. Day 0 is the day before the tour starts
// (travel / meet-up night), Day 1 is the start date, and so on up to the end
// date.
//
// Saved as text in tours.itinerary, which ItineraryTimeline shows:
//   Day 0:
//   Meet up at the pickup point
//   Day 1:
//   04:00 AM – Hike to the summit
// The calendar dates aren't saved (one trip can run on several dates); they
// come from each date's start date when the itinerary is shown.
// ─────────────────────────────────────────────
import { addDaysYmd, tripDays } from './dateRange';

const DAY_RE = /^day\s*(\d+)\b[^:]*:?\s*$/i;

// Text → { [dayNumber]: 'that day's lines' }. Lines before any "Day" header
// (older itineraries) go into Day 1, so nothing is lost.
export const parseItinerary = (text) => {
  const days = {};
  let day = 1;
  (text || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((line) => {
    const d = line.match(DAY_RE);
    if (d) { day = Number(d[1]); days[day] = days[day] || ''; return; }
    days[day] = days[day] ? `${days[day]}\n${line}` : line;
  });
  return days;
};

// { [day]: text } → text (days with nothing written are left out).
export const serializeItinerary = (days) => Object.keys(days).map(Number).sort((a, b) => a - b)
  .filter((n) => (days[n] || '').trim())
  .map((n) => [`Day ${n}:`, ...days[n].split('\n').map((s) => s.trim()).filter(Boolean)].join('\n'))
  .join('\n');

// Days 0…N for a tour from start to end ("Day 0" is the day before).
export const itineraryDays = (start, end) => {
  const n = start ? Math.max(1, tripDays(start, end || start)) : 0;
  return Array.from({ length: n + 1 }, (_, i) => ({ day: i, date: start ? addDaysYmd(start, i - 1) : '' }));
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Fri, Oct 24"
export const shortDate = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
};

// The date of "Day n" for a tour starting on start (Day 1 = start).
export const dateOfDay = (start, n) => (start ? addDaysYmd(start, n - 1) : '');
