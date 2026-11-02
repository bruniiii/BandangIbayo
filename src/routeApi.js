import { supabase } from './supabaseClient';
import { errorDetail } from './Email';
import { placesAlongFromBrowser } from './osmPlaces';

// ─────────────────────────────────────────────
// MAPS: place search and driving routes, through the `routes` Edge Function
// (OpenRouteService; the key stays on the server). Admins only.
// Each helper returns { ok, data } or { ok: false, error }.
// ─────────────────────────────────────────────

const call = async (body) => {
  try {
    const { data, error } = await supabase.functions.invoke('routes', { body });
    if (error) {
      let message = '';
      try {
        if (error.context && typeof error.context.json === 'function') message = (await error.context.clone().json())?.error || '';
      } catch { /* not JSON */ }
      return { ok: false, error: message || await errorDetail(error) };
    }
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not reach the map service. Please try again.' };
  }
};

// Places in the Philippines matching the text: [{ name, label, lat, lng }].
export const searchPlaces = (text) => call({ action: 'geocode', text });

// The driving road through the places, in order: points are { lat, lng }.
// → { coords: [[lng, lat]…], distance_km, duration_min, legs: [{ distance_km, duration_min }] }
export const findRoute = (points) => call({ action: 'route', points: points.map((p) => [p.lng, p.lat]) });

// Possible pickup points within 300 m of the road (OpenStreetMap): gas
// stations, malls, bus terminals, convenience stores, fast food →
// [{ name, kind, lat, lng, city, alongKm, offKm }].
//   1. the road's close shape from the routes function (or the saved shape),
//   2. OpenStreetMap asked straight from the browser (not blocked like the
//      shared server address),
//   3. if the browser can't reach it, the routes function asks instead.
// Places already found for the same road (saved for 30 days, shared by the
// admins, from the 20261203 update), so busy map servers matter less.
const cacheKey = (route) => (route?.start && route?.end
  ? [route.start.lat, route.start.lng, route.end.lat, route.end.lng].map((n) => Number(n).toFixed(3)).join(',')
  : null);
const savedPlaces = async (key) => {
  if (!key) return null;
  try {
    const { data, error } = await supabase.from('route_place_cache').select('places, saved_at').eq('key', key).maybeSingle();
    if (error || !Array.isArray(data?.places)) return null;
    return data.places;
  } catch { return null; }
};
const savePlaces = (key, places) => {
  if (!key || !Array.isArray(places) || places.length === 0) return;
  supabase.from('route_place_cache').upsert([{ key, places, saved_at: new Date().toISOString() }], { onConflict: 'key' }).then(() => {}, () => {});
};

export const findPlacesAlongRoute = async (route, { fresh = false } = {}) => {
  const key = cacheKey(route);
  if (!fresh) {
    const saved = await savedPlaces(key);
    if (saved) return { ok: true, data: { places: saved, saved: true } };
  }
  const result = await findPlacesFresh(route);
  if (result.ok && !result.data?.partial) savePlaces(key, result.data?.places);
  return result;
};

const findPlacesFresh = async (route) => {
  const points = route?.start && route?.end
    ? [[route.start.lng, route.start.lat], [route.end.lng, route.end.lat]]
    : null;
  let line = route?.coords;
  if (points) {
    const road = await call({ action: 'road-line', points });
    if (road.ok && Array.isArray(road.data?.line) && road.data.line.length > 1) line = road.data.line;
  }
  // (Only from the browser: the free servers refuse Supabase's shared server
  // addresses, so asking through the server just failed slowly with 503.)
  return placesAlongFromBrowser(line);
};
