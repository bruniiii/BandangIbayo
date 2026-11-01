import { supabase } from './supabaseClient';
import { errorDetail } from './Email';

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
// stations, malls, bus terminals, fast food → [{ name, kind, lat, lng, city }].
export const findPlacesAlongRoute = (coords) => call({ action: 'places-along', coords });
