import { placeOnRoute } from './geo';

// ─────────────────────────────────────────────
// Possible pickup points along a road, asked from OpenStreetMap (free)
// straight from the browser. The free servers often block busy shared server
// addresses (like Supabase's: "429/503"), but answer a person's own
// connection. Gas stations, malls, bus terminals, the well-known convenience
// stores and fast food within 300 m of the road.
// ─────────────────────────────────────────────

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const kindOf = (t) =>
  t.amenity === 'fuel' ? 'gas'
    : t.shop === 'mall' || t.shop === 'department_store' ? 'mall'
      : t.amenity === 'bus_station' ? 'terminal'
        : t.shop === 'convenience' ? 'store'
          : t.amenity === 'fast_food' ? 'food' : 'other';

// Only the well-known chains for stores and fast food.
const BRANDS = {
  store: /7-?\s?eleven|alfamart|ministop|uncle john/i,
  food: /mcdonald|jollibee|chowking|kfc|mang inasal|greenwich/i,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// line: the road as [[lng, lat], …] → { ok, data: { places } } or { ok: false, error }.
export const placesAlongFromBrowser = async (line) => {
  if (!Array.isArray(line) || line.length < 2) return { ok: false, error: 'Find the route first.' };
  const pts = line.map(([lng, lat]) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`).join(',');
  const query = `[out:json][timeout:60];
nwr(around:300,${pts})["name"][~"^(amenity|shop)$"~"^(fuel|mall|department_store|bus_station|convenience|fast_food)$"];
out center tags 2000;`;
  let last = '';
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(45000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && Array.isArray(body.elements)) {
          const places = body.elements.map((e) => {
            const t = e.tags || {};
            const kind = kindOf(t);
            const lat = e.lat ?? e.center?.lat;
            const lng = e.lon ?? e.center?.lon;
            if (kind === 'other' || !t.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            if (BRANDS[kind] && !BRANDS[kind].test(t.name)) return null;
            const at = placeOnRoute({ lat, lng }, line);
            return {
              name: String(t.name).trim(), kind, lat, lng,
              city: t['addr:city'] || t['addr:municipality'] || t['addr:town'] || '',
              alongKm: Math.round(at.alongKm * 100) / 100,
              offKm: Math.round(at.offKm * 1000) / 1000,
            };
          }).filter((p) => p && p.offKm <= 0.35);
          return { ok: true, data: { places } };
        }
      }
      last = String(res.status);
    } catch (err) {
      last = err?.name === 'TimeoutError' ? 'timeout' : (err?.message || 'no connection');
    }
    await wait(1200); // a moment before the next server
  }
  return { ok: false, error: `The map's place list is busy right now (${last}). Please try again in a minute.` };
};
