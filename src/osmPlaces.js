import { placeOnRoute, distanceKm } from './geo';

// ─────────────────────────────────────────────
// Possible pickup points along a road, asked from OpenStreetMap (free)
// straight from the browser. The free servers often block busy shared server
// addresses (like Supabase's: "429/503"), but answer a person's own
// connection. Gas stations, malls, bus terminals, the well-known convenience
// stores and fast food within 300 m of the road. Long roads are asked in
// pieces, and the answers are remembered in this browser for a week.
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

// The road in pieces of about 60 km: small questions the busy free servers
// answer quickly, instead of one big one they time out on (504).
const PIECE_KM = 60;
const pieces = (line) => {
  const out = [];
  let cur = [line[0]];
  let km = 0;
  for (let i = 1; i < line.length; i += 1) {
    const [lng1, lat1] = line[i - 1];
    const [lng2, lat2] = line[i];
    km += distanceKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
    cur.push(line[i]);
    if (km >= PIECE_KM && i < line.length - 1) { out.push(cur); cur = [line[i]]; km = 0; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
};

// One piece, asked from the servers in turn (each piece starts at a different one).
const askPiece = async (piece, first) => {
  const pts = piece.map(([lng, lat]) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`).join(',');
  const query = `[out:json][timeout:40];
nwr(around:300,${pts})["name"][~"^(amenity|shop)$"~"^(fuel|mall|department_store|bus_station|convenience|fast_food)$"];
out center tags 1000;`;
  let last = '';
  for (let k = 0; k < SERVERS.length + 2; k += 1) {
    const url = SERVERS[(first + k) % SERVERS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && Array.isArray(body.elements)) return { ok: true, elements: body.elements };
      }
      last = String(res.status);
    } catch (err) {
      last = err?.name === 'TimeoutError' ? 'timeout' : (err?.message || 'no connection');
    }
    await wait(k < SERVERS.length ? 1500 : 4000); // a moment before the next server
  }
  return { ok: false, error: last };
};

// Answers are kept in this browser for a week, so the same road loads at once
// (editing a tour, Try again, another tour on the same road).
const CACHE = 'osm-places-v1:';
const keyOf = (line) => CACHE + [line[0], line[line.length - 1], line.length]
  .map((p) => (Array.isArray(p) ? p.map((n) => Number(n).toFixed(3)).join(',') : p)).join('|');
const readCache = (key) => {
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    return hit && Date.now() - hit.at < 7 * 24 * 3600 * 1000 ? hit.places : null;
  } catch { return null; }
};
const saveCache = (key, places) => {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), places })); } catch { /* full or blocked */ }
};

// line: the road as [[lng, lat], …] → { ok, data: { places } } or { ok: false, error }.
export const placesAlongFromBrowser = async (line) => {
  if (!Array.isArray(line) || line.length < 2) return { ok: false, error: 'Find the route first.' };
  const key = keyOf(line);
  const cached = readCache(key);
  if (cached) return { ok: true, data: { places: cached } };

  // Two pieces at a time, so no one server is asked too much at once.
  const parts = pieces(line);
  const results = new Array(parts.length);
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next; next += 1;
      results[i] = await askPiece(parts[i], i % SERVERS.length);
    }
  };
  await Promise.all([worker(), worker()]);
  const failed = results.find((r) => !r?.ok);
  if (failed) return { ok: false, error: `The map's place list is busy right now (${failed.error}). Please try again in a minute.` };

  const seen = new Set();
  const places = [];
  results.forEach((r) => r.elements.forEach((e) => {
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    const t = e.tags || {};
    const kind = kindOf(t);
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (kind === 'other' || !t.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (BRANDS[kind] && !BRANDS[kind].test(t.name)) return;
    const at = placeOnRoute({ lat, lng }, line);
    if (at.offKm > 0.35) return;
    places.push({
      name: String(t.name).trim(), kind, lat, lng,
      city: t['addr:city'] || t['addr:municipality'] || t['addr:town'] || '',
      alongKm: Math.round(at.alongKm * 100) / 100,
      offKm: Math.round(at.offKm * 1000) / 1000,
    });
  }));
  saveCache(key, places);
  return { ok: true, data: { places } };
};
