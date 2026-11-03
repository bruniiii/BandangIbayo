// ─────────────────────────────────────────────
// Small map math for pickup points along a route (no map service needed).
// Points are { lat, lng }; a route is [[lng, lat], …] as the routes function returns it.
// ─────────────────────────────────────────────

const R = 6371; // km
const rad = (d) => (d * Math.PI) / 180;

// Straight-line distance in km.
export const distanceKm = (a, b) => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// How far a place is from the road (km), and how far along the road its
// nearest point is (km from the start), so stops can be listed in the order
// the van passes them.
export const placeOnRoute = (place, coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return { offKm: Infinity, alongKm: 0 };
  // Flat projection around the place (accurate enough within a few km).
  const kx = 111.32 * Math.cos(rad(place.lat));
  const ky = 110.57;
  const toXY = ([lng, lat]) => [(lng - place.lng) * kx, (lat - place.lat) * ky];
  let best = { offKm: Infinity, alongKm: 0 };
  let along = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [ax, ay] = toXY(coords[i]);
    const [bx, by] = toXY(coords[i + 1]);
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + t * dx; const py = ay + t * dy;
    const off = Math.hypot(px, py);
    const segLen = Math.sqrt(len2);
    if (off < best.offKm) best = { offKm: off, alongKm: along + t * segLen };
    along += segLen;
  }
  return best;
};

// Saved spots within maxKm of the road, in the order the van passes them.
export const spotsAlongRoute = (spots, coords, maxKm = 2) => spots
  .map((s) => ({ ...s, ...placeOnRoute(s, coords) }))
  .filter((s) => s.offKm <= maxKm)
  .sort((a, b) => a.alongKm - b.alongKm);

// "9:00 PM" + 95 minutes → "10:35 PM" (times as shown in Tracking).
export const addMinutesToTime = (time, minutes) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(time || '').trim());
  if (!m) return '';
  let h = Number(m[1]) % 12;
  if (m[3] && m[3].toUpperCase() === 'PM') h += 12;
  if (!m[3]) h = Number(m[1]);
  const total = (((h * 60 + Number(m[2]) + Math.round(minutes)) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60); const mm = total % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};

// Pickup stops in the order the van reaches them (route_order from the tour
// form), then any others in the order they were added.
export const sortStops = (stops) => [...(stops || [])].sort((a, b) => {
  const ao = a?.route_order ?? Infinity; const bo = b?.route_order ?? Infinity;
  if (ao !== bo) return ao - bo;
  return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
});

// When the van leaves: the first time written in the itinerary (the earliest
// day, usually "Day 0: 09:00pm – Assembly Time…"). "9:00 PM", or '' if none.
export const departureFromItinerary = (text) => {
  const lines = String(text || '').split('\n');
  let day = 1; let best = null;
  lines.forEach((raw) => {
    const line = raw.trim();
    const d = line.match(/^day\s*(\d+)\b/i);
    if (d) { day = Number(d[1]); return; }
    const m = line.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|nn|mn)?\b/i);
    if (!m || (best && best.day <= day)) return;
    let h = Number(m[1]); const min = Number(m[2]); const ap = (m[3] || '').toLowerCase();
    if (h > 23 || min > 59) return;
    if ((ap === 'pm' || ap === 'nn') && h < 12) h += 12;
    if ((ap === 'am' || ap === 'mn') && h === 12) h = 0;
    best = { day, time: `${h}:${String(min).padStart(2, '0')}` };
  });
  return best ? addMinutesToTime(best.time, 0) : '';
};

// Live ETAs while the driver shares the van's location: the next stop from
// the van's distance (roads ≈ 1.25 × straight line) and speed, the stops
// after it from the driving time between stops saved with the tour.
//   stops: in route order; van: { lat, lng, speed_kmh, updated_at }
//   → { [stopId]: { minutes, time: "9:42 PM" } }  (empty when the van isn't live)
export const liveEtas = (stops, van, now = Date.now()) => {
  const out = {};
  if (!van || !Number.isFinite(Number(van.lat)) || now - new Date(van.updated_at).getTime() > 10 * 60000) return out;
  const list = (stops || []).filter(Boolean);
  const nextIdx = list.findIndex((s) => s.status !== 'ARRIVED');
  const next = list[nextIdx];
  if (!next || next.lat == null || next.lng == null || !Number.isFinite(Number(next.lat)) || !Number.isFinite(Number(next.lng))) return out;
  const speed = Number(van.speed_kmh) >= 10 ? Number(van.speed_kmh) : 30;
  const km = distanceKm({ lat: Number(van.lat), lng: Number(van.lng) }, { lat: Number(next.lat), lng: Number(next.lng) }) * 1.25;
  const first = Math.max(1, Math.round((km / speed) * 60));
  const clock = (mins) => {
    const d = new Date(now + mins * 60000);
    const manila = new Date(d.getTime() + 8 * 3600000);
    return addMinutesToTime(`${manila.getUTCHours()}:${String(manila.getUTCMinutes()).padStart(2, '0')}`, 0);
  };
  const base = Number(next.minutes_from_start);
  list.slice(nextIdx).forEach((s, i) => {
    if (s.status === 'ARRIVED') return;
    let mins = first;
    if (i > 0) {
      const m = Number(s.minutes_from_start);
      if (!Number.isFinite(m) || !Number.isFinite(base) || s.minutes_from_start == null || next.minutes_from_start == null) return;
      mins = first + Math.max(0, Math.round(m - base));
    }
    out[s.id] = { minutes: mins, time: clock(mins) };
  });
  return out;
};

// "10:00 PM" (or "22:00") → "22:00" for a time input ('' when it can't be read).
export const to24h = (time) => {
  const m = /^(\d{1,2})[:.](\d{2})\s*(AM|PM|NN|MN)?$/i.exec(String(time || '').trim());
  if (!m) return '';
  let h = Number(m[1]); const ap = (m[3] || '').toUpperCase();
  if ((ap === 'PM' || ap === 'NN') && h < 12) h += 12;
  if ((ap === 'AM' || ap === 'MN') && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

// Driving minutes from the start to each stop, from a route through the start,
// the stops (in order) and the end (findRoute's answer). Uses each leg's time
// when the route has them; otherwise (the map service sends legs only with
// turn-by-turn directions) it shares the whole trip's time by how far along
// the road each stop is. A rough ETA either way; the live van refines it.
//   route: { coords, distance_km, duration_min, legs }   stops: [{ lat, lng }]
//   fromFirstStop: count from the first pickup point instead (it gets 0), so
//     "Van leaves at" is the first pickup's time and the others follow.
export const stopMinutes = (route, stops, { fromFirstStop = false } = {}) => {
  const m = stopMinutesFromStart(route, stops);
  if (!fromFirstStop || m[0] == null) return m;
  return m.map((x) => (x == null ? null : Math.max(0, x - m[0])));
};
const stopMinutesFromStart = (route, stops) => {
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  if (legs.length >= stops.length && legs.slice(0, stops.length).some((l) => Number(l?.duration_min) > 0)) {
    let total = 0;
    return stops.map((_, i) => { total += Number(legs[i]?.duration_min) || 0; return total; });
  }
  const coords = route?.coords;
  const km = Number(route?.distance_km) || 0;
  const min = Number(route?.duration_min) || 0;
  if (!Array.isArray(coords) || coords.length < 2 || !km || !min) return stops.map(() => null);
  let last = 0;
  return stops.map((s) => {
    const along = placeOnRoute(s, coords).alongKm;
    // Never earlier than the stop before it (the stops are in driving order).
    last = Math.max(last, Math.round((min * along) / km));
    return last;
  });
};
