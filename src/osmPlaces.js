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

// Fewer points for the question: one every ~500 m (the 300 m band around the
// line between them still follows the road). A long road's full shape has
// thousands of points, which made the question too big for the free servers
// (504 time-outs, 406 refused).
const thin = (piece) => {
  const out = [piece[0]];
  for (let i = 1; i < piece.length - 1; i += 1) {
    const [lng1, lat1] = out[out.length - 1];
    const [lng2, lat2] = piece[i];
    if (distanceKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) >= 0.5) out.push(piece[i]);
  }
  out.push(piece[piece.length - 1]);
  return out;
};

// One request to one server: { ok, elements } or { ok: false, error }.
const askOne = async (url, query, signal) => {
  const data = encodeURIComponent(query);
  try {
    // A short question goes as a plain link (GET), a long one as a form (POST).
    const res = data.length < 6000
      ? await fetch(`${url}?data=${data}`, { signal })
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${data}`, signal });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && Array.isArray(body.elements)) return { ok: true, elements: body.elements };
    }
    return { ok: false, error: String(res.status) };
  } catch (err) {
    return { ok: false, error: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : (err?.message || 'no connection') };
  }
};

// One piece: two servers asked at the same time, the first answer wins (the
// other is stopped); if both fail, the other two. Never past the deadline.
const askPiece = async (piece, first, deadline = Infinity) => {
  const pts = thin(piece).map(([lng, lat]) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`).join(',');
  const query = `[out:json][timeout:15];
nwr(around:300,${pts})["name"][~"^(amenity|shop)$"~"^(fuel|mall|department_store|bus_station|convenience|fast_food)$"];
out center tags 1000;`;
  let last = 'timeout';
  for (let k = 0; k < SERVERS.length; k += 2) {
    const left = deadline - Date.now();
    if (left < 2000) break;
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), Math.min(15000, left));
    const urls = [SERVERS[(first + k) % SERVERS.length], SERVERS[(first + k + 1) % SERVERS.length]];
    const result = await new Promise((resolve) => {
      let pending = urls.length;
      urls.forEach((url) => askOne(url, query, stop.signal).then((r) => {
        if (r.ok) resolve(r);
        else { last = r.error; pending -= 1; if (pending === 0) resolve(null); }
      }));
    });
    clearTimeout(timer);
    stop.abort();
    if (result) return result;
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

  // Three pieces at a time, and never more than 35 seconds in all: then
  // whatever loaded is shown (the admin can Try again for the rest).
  const parts = pieces(line);
  const deadline = Date.now() + 35000;
  const results = new Array(parts.length);
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next; next += 1;
      results[i] = await askPiece(parts[i], i % SERVERS.length, deadline);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  // Some pieces of a long road may still fail: show what did load (and say
  // so) instead of nothing. Only when every piece failed is it an error.
  const failed = results.filter((r) => !r?.ok);
  if (failed.length === results.length) return { ok: false, error: `The map's place list is busy right now (${failed[0].error}). Please try again in a minute.` };

  const seen = new Set();
  const places = [];
  results.filter((r) => r?.ok).forEach((r) => r.elements.forEach((e) => {
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
  // A partial answer isn't remembered, so Try again asks for the missing parts.
  if (failed.length) return { ok: true, data: { places, partial: true } };
  saveCache(key, places);
  return { ok: true, data: { places } };
};
