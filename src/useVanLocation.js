import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// Where the van is now (van_locations), live: the driver's phone sends it
// about every 20 seconds while its trip page is open. null when nobody is
// sharing (or before the 20261201 database update).
// ─────────────────────────────────────────────
export const useVanLocation = (tourId) => {
  const [van, setVan] = useState(null);
  useEffect(() => {
    if (!tourId) return undefined;
    let alive = true;
    supabase.from('van_locations').select('*').eq('tour_id', tourId).maybeSingle()
      .then(({ data }) => { if (alive) setVan(data || null); }, () => {});
    const channel = supabase
      .channel(`van-${tourId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'van_locations', filter: `tour_id=eq.${tourId}` }, (payload) => {
        if (!alive) return;
        setVan(payload.eventType === 'DELETE' ? null : payload.new);
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [tourId]);
  return van;
};

// "just now", "3 min ago", "1 hr ago"
export const agoText = (iso, now = Date.now()) => {
  if (!iso) return '';
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} hr ago`;
};

// A clock for live ETAs and "updated 2 min ago" (ticks every 30 seconds).
export const useNow = (every = 30000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
};
