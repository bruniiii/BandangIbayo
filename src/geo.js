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
