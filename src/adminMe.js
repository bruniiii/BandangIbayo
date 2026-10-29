import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// The signed-in admin: their name (top-right card) and whether they're the
// main admin (only the main admin sees Admin Settings).
// ─────────────────────────────────────────────

const ADMIN_ME_CHANGED = 'ibayo:admin-me-changed';
export const adminMeChanged = () => window.dispatchEvent(new Event(ADMIN_ME_CHANGED));

export const useAdminMe = () => {
  const [me, setMe] = useState({ name: '', email: '', isMain: false, loaded: false });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles')
        .select('first_name, last_name, username, is_main_admin').eq('id', user.id).maybeSingle();
      if (!alive) return;
      const name = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim() || data?.username || user.email || 'Admin';
      setMe({ name, email: user.email || '', isMain: !!data?.is_main_admin, loaded: true });
    };
    load();
    window.addEventListener(ADMIN_ME_CHANGED, load);
    return () => { alive = false; window.removeEventListener(ADMIN_ME_CHANGED, load); };
  }, []);
  return me;
};
