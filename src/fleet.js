import { supabase } from './supabaseClient';

// The saved drivers and vans (Tracking Management → Drivers & Vans). Admins only.
export const loadFleet = async () => {
  const [d, v] = await Promise.all([
    supabase.from('fleet_drivers').select('*').eq('is_active', true).order('name'),
    supabase.from('fleet_vans').select('*').eq('is_active', true).order('car_type'),
  ]);
  return { drivers: d.data || [], vans: v.data || [], error: d.error?.message || v.error?.message || '' };
};
