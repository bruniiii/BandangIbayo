import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────
// PHILIPPINE ADDRESSES
// Province → city/municipality lists come from the PSGC (Philippine Standard
// Geographic Code) data in the MIT-licensed `psgc` package
// (github.com/pcofilada/psgc), trimmed to src/data/phLocations.json.
// Loaded on demand so it doesn't slow down other pages.
// ─────────────────────────────────────────────

let cache = null;

export const usePhLocations = () => {
  const [locations, setLocations] = useState(cache);
  useEffect(() => {
    if (cache) return;
    import('./data/phLocations.json').then((m) => {
      cache = m.default;
      setLocations(cache);
    });
  }, []);
  return locations; // { [province]: [city/municipality, ...] } or null while loading
};

// The single "address" line other screens (bookings, reports) still use.
export const composeAddress = ({ street, city, province }) =>
  [street, city, province].map((s) => (s || '').trim()).filter(Boolean).join(', ');
