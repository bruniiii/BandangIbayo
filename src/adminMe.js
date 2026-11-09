import { useEffect, useState } from 'react';
import { supabase, currentUser } from './supabaseClient';

// ─────────────────────────────────────────────
// The signed-in admin: their name (top-right card) and whether they're the
// main admin (only the main admin sees Admin Settings).
// ─────────────────────────────────────────────

const ADMIN_ME_CHANGED = 'ibayo:admin-me-changed';
// patch (optional): what changed, e.g. { name }, shown at once everywhere
// (before the fresh copy from the database arrives).
export const adminMeChanged = (patch = null) => window.dispatchEvent(new CustomEvent(ADMIN_ME_CHANGED, { detail: patch }));

export const useAdminMe = () => {
  const [me, setMe] = useState({ name: '', email: '', isMain: false, loaded: false });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const user = await currentUser();
      if (!user) return;
      const { data } = await supabase.from('profiles')
        .select('first_name, last_name, username, is_main_admin').eq('id', user.id).maybeSingle();
      if (!alive) return;
      const name = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim() || data?.username || user.email || 'Admin';
      setMe({ name, email: user.email || '', isMain: !!data?.is_main_admin, loaded: true });
    };
    load();
    const onChange = (e) => {
      if (e?.detail && alive) setMe((m) => ({ ...m, ...e.detail }));
      load();
    };
    window.addEventListener(ADMIN_ME_CHANGED, onChange);
    return () => { alive = false; window.removeEventListener(ADMIN_ME_CHANGED, onChange); };
  }, []);
  return me;
};
