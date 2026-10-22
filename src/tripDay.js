import { todayManila } from './tourUtils';

// Which bookings get a Trip Day card (TripDayCard.jsx).

export const TRIP_DAY_LEAD_DAYS = 1; // shown from the day before the trip

export const daysBetween = (fromYmd, toYmd) =>
  Math.round((new Date(`${toYmd}T00:00:00Z`) - new Date(`${fromYmd}T00:00:00Z`)) / 86400000);

// Confirmed bookings whose trip starts within TRIP_DAY_LEAD_DAYS or is on now, soonest first.
export const tripDayBookings = (bookings) => {
  const today = todayManila();
  return bookings
    .filter((b) => {
      const t = b.tours;
      if (!t?.start_date || b.payment_status !== 'Complete') return false;
      if (b.booking_status === 'Cancelled' || b.booking_status === 'Rejected') return false;
      const end = t.end_date || t.start_date;
      return daysBetween(today, t.start_date) <= TRIP_DAY_LEAD_DAYS && end >= today;
    })
    .sort((a, b) => a.tours.start_date.localeCompare(b.tours.start_date));
};
