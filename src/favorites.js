import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';

// ─────────────────────────────────────────────
// FAVORITES (tour_favorites): joiners star tours on Explore Tours to book
// later. A trip (one card, several dates) is a favorite if any of its dates
// is starred. Everything that shows a star shares this one list.
// ─────────────────────────────────────────────

let state = { ids: new Set(), loaded: false };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getState = () => state;
let loading = null;

export const loadFavorites = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data, error } = await supabase.from('tour_favorites').select('tour_id').eq('user_id', user.id);
  if (error) return;
  state = { ids: new Set((data || []).map((f) => String(f.tour_id))), loaded: true };
  emit();
};

export const useFavorites = () => {
  const s = useSyncExternalStore(subscribe, getState);
  useEffect(() => {
    if (!s.loaded && !loading) loading = loadFavorites().finally(() => { loading = null; });
  }, [s.loaded]);
  return s;
};

const dateIdsOf = (trip) => (trip?.dates?.length ? trip.dates : [trip]).map((d) => String(d.id));

export const isFavorite = (ids, trip) => dateIdsOf(trip).some((id) => ids.has(id));

// Star or unstar a trip. Returns the new value.
export const toggleFavorite = async (trip) => {
  const tripIds = dateIdsOf(trip);
  const on = tripIds.some((id) => state.ids.has(id));
  const next = new Set(state.ids);
  if (on) tripIds.forEach((id) => next.delete(id)); else next.add(tripIds[0]);
  state = { ...state, ids: next };
  emit();
  const { error } = on
    ? await supabase.from('tour_favorites').delete().in('tour_id', tripIds)
    : await supabase.from('tour_favorites').insert({ tour_id: Number(tripIds[0]) || tripIds[0] });
  if (error) {
    toast.error(on ? "Couldn't remove the favorite" : "Couldn't add to favorites", error.message);
    await loadFavorites();
    return on;
  }
  if (on) toast.info('Removed from Favorites', trip.title);
  else toast.success('Added to Favorites', `${trip.title} is saved under the star at the top right.`);
  return !on;
};
