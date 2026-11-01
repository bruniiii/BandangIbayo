import { supabase } from './supabaseClient';

// Loads the saved pickup spots: { spots, available } (available is false
// before the 20261130 database update, so the map features stay hidden).
export const loadPickupSpots = async () => {
  const { data, error } = await supabase.from('pickup_spots').select('*').order('name');
  return { spots: data || [], available: !error };
};
