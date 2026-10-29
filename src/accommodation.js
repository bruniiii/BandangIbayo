// ─────────────────────────────────────────────
// ACCOMMODATION: the admin ticks which kinds a tour offers (they differ per
// tour), and joiners choose one of those when they book or pay.
// Keep in sync with accommodation_choices() in the database.
// ─────────────────────────────────────────────

export const ACCOMMODATION_OPTIONS = ['Tent', 'AC Room', 'Non-AC Room'];

// Only known choices, in the usual order.
export const cleanAccommodation = (list) =>
  ACCOMMODATION_OPTIONS.filter((o) => Array.isArray(list) && list.includes(o));
