import { supabase } from './supabaseClient';

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

// Only allow in-app paths as post-login redirects (no "//evil.com" or absolute URLs).
export const safeNextPath = (next) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null;
