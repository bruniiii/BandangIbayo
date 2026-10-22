import { useState } from 'react';

// Extra Explore filters (the selects are in ui/TourFilters.jsx): month, price range and trip length. Works on trips
// from groupTripDates (each trip has `dates`). Used by Explore Tours and the
// public /tours page.

export const NO_TRIP_FILTERS = { month: '', price: '', length: '' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const PRICE_RANGES = [
  { value: 'u2000', label: 'Under ₱2,000', test: (p) => p < 2000 },
  { value: '2000-3999', label: '₱2,000 – ₱3,999', test: (p) => p >= 2000 && p < 4000 },
  { value: '4000-5999', label: '₱4,000 – ₱5,999', test: (p) => p >= 4000 && p < 6000 },
  { value: '6000+', label: '₱6,000 and up', test: (p) => p >= 6000 },
];

export const LENGTHS = [
  { value: '1', label: 'Day trip (1 day)', test: (d) => d <= 1 },
  { value: '2-3', label: '2 – 3 days', test: (d) => d >= 2 && d <= 3 },
  { value: '4+', label: '4 days or more', test: (d) => d >= 4 },
];

// Number of days from "3 Days", else from the start and end dates.
export const tripDays = (t) => {
  const m = /(\d+)\s*day/i.exec(t.duration || '');
  if (m) return Number(m[1]);
  if (t.start_date && t.end_date) return Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000) + 1;
  return 1;
};

const monthKey = (ymd) => String(ymd || '').slice(0, 7); // "2026-11"
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Months that have at least one date, in order.
export const monthOptions = (trips) =>
  [...new Set(trips.flatMap((t) => (t.dates || [t]).map((d) => monthKey(d.start_date))).filter(Boolean))]
    .sort()
    .map((key) => ({ value: key, label: monthLabel(key) }));

// Keeps trips that match; with a month picked, a trip shows only that month's dates.
export const applyTripFilters = (trips, { month, price, length }) => {
  const priceTest = PRICE_RANGES.find((r) => r.value === price)?.test;
  const lengthTest = LENGTHS.find((r) => r.value === length)?.test;
  return trips.flatMap((trip) => {
    if (priceTest && !priceTest(Number(trip.price) || 0)) return [];
    if (lengthTest && !lengthTest(tripDays(trip))) return [];
    if (!month) return [trip];
    const dates = (trip.dates || [trip]).filter((d) => monthKey(d.start_date) === month);
    if (!dates.length) return [];
    const shown = dates.find((d) => (d.available_slots ?? 1) > 0) || dates[0];
    return [{ ...shown, dates }];
  });
};

export const useTripFilters = () => {
  const [filters, setFilters] = useState(NO_TRIP_FILTERS);
  return {
    filters,
    setFilter: (key, value) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => setFilters(NO_TRIP_FILTERS),
    active: Boolean(filters.month || filters.price || filters.length),
  };
};
