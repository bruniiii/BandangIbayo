import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────
// PHILIPPINE ADDRESSES
// Province → city/municipality → barangay lists come from the PSGC
// (Philippine Standard Geographic Code) data in the MIT-licensed
// `psgc-areas` package, trimmed to src/data/phLocations.json and one
// barangay file per province in src/data/barangays/.
// Everything is loaded on demand so it doesn't slow down other pages.
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

// Same file names the data script writes: "Davao del Sur" → davao-del-sur.json
const provinceSlug = (province) =>
  province.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const barangayFiles = import.meta.glob('./data/barangays/*.json', { import: 'default' });
const barangayCache = {};

// { [city/municipality]: [barangay, ...] } for one province, or null while loading.
export const useBarangays = (province) => {
  const [loaded, setLoaded] = useState({});
  useEffect(() => {
    if (!province || barangayCache[province]) return;
    const load = barangayFiles[`./data/barangays/${provinceSlug(province)}.json`];
    if (!load) return;
    let active = true;
    load().then((data) => {
      barangayCache[province] = data;
      if (active) setLoaded((prev) => ({ ...prev, [province]: data }));
    });
    return () => { active = false; };
  }, [province]);
  if (!province) return null;
  return barangayCache[province] || loaded[province] || null;
};

// The single "address" line other screens (bookings, reports) still use.
export const composeAddress = ({ street, barangay, city, province }) =>
  [street, barangay, city, province].map((s) => (s || '').trim()).filter(Boolean).join(', ');
