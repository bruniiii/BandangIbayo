// Date-range helpers for the exclusive tour form (ui/DateRangePicker.jsx).
// Dates are 'YYYY-MM-DD' strings, compared as plain calendar days.

import { daysBetween } from './tripDay';

// Oct 10 – 12 counts as 3 days (both ends included).
export const tripDays = (start, end) => (start && end ? daysBetween(start, end) + 1 : 0);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (ymd) => ymd.split('-').map(Number);

// "Oct 10 – 12, 2026", "Oct 30 – Nov 2, 2026", "Dec 30, 2026 – Jan 2, 2027", or one day.
export const formatYmdRange = (start, end) => {
  if (!start) return '';
  const [y1, m1, d1] = parts(start);
  if (!end || end === start) return `${MONTHS[m1 - 1]} ${d1}, ${y1}`;
  const [y2, m2, d2] = parts(end);
  if (y1 !== y2) return `${MONTHS[m1 - 1]} ${d1}, ${y1} – ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
  if (m1 !== m2) return `${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}, ${y1}`;
  return `${MONTHS[m1 - 1]} ${d1} – ${d2}, ${y1}`;
};

export const daysLabel = (n) => (n ? `${n} day${n === 1 ? '' : 's'}` : '');

// "YYYY-MM-DD" plus n days.
export const addDaysYmd = (ymd, n) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
