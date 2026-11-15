// ─────────────────────────────────────────────
// ACCOMMODATION: the admin ticks which kinds a tour offers (they differ per
// tour), and joiners choose one of those when they book or pay.
// The choices are edited in System Maintenance → Lists & FAQ (the database
// checks them, accommodation_choices()).
// ─────────────────────────────────────────────

import { ACCOMMODATION_OPTIONS } from './optionLists';

export { ACCOMMODATION_OPTIONS };

// The tour's choices in the usual order (the list's order first, then any
// older choice no longer in the list, so past tours keep theirs).
export const cleanAccommodation = (list) => {
  const items = (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && x.trim());
  return [...ACCOMMODATION_OPTIONS.filter((o) => items.includes(o)), ...items.filter((x) => !ACCOMMODATION_OPTIONS.includes(x))];
};
