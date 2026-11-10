import { supabase } from './supabaseClient';

// Loads the saved pickup spots: { spots, available } (available is false
// before the 20261130 database update, so the map features stay hidden).
export const loadPickupSpots = async () => {
  const { data, error } = await supabase.from('pickup_spots').select('*').order('name');
  // Archived spots (System Maintenance → Pickup Points) aren't offered.
  return { spots: (data || []).filter((s) => s.is_active !== false), available: !error };
};
