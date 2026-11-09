import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// Maintenance Mode (System Maintenance → System Settings, main admin only).
// useMaintenance() reads get_maintenance() (anyone can, also logged out) and
// checks again every minute and when the tab comes back into view, so the
// joiner side locks and unlocks by itself.
//   const { on, message, until, agency, loaded } = useMaintenance();
// After the main admin changes it: maintenanceChanged().
// ─────────────────────────────────────────────

const EVENT = 'ibayo:maintenance-changed';
export const maintenanceChanged = () => window.dispatchEvent(new Event(EVENT));

let cache = null;

export const loadMaintenance = async () => {
  const { data, error } = await supabase.rpc('get_maintenance');
  // Before the database update is installed (or if it can't be reached), the site stays open.
  cache = error || !data ? { on: false, agency: {} } : { ...data, on: !!data.on, agency: data.agency || {} };
  return cache;
};

export const useMaintenance = () => {
  const [state, setState] = useState(() => (cache ? { ...cache, loaded: true } : { on: false, agency: {}, loaded: false }));
  useEffect(() => {
    let live = true;
    const check = () => loadMaintenance().then((m) => { if (live) setState({ ...m, loaded: true }); });
    check();
    const timer = setInterval(check, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(EVENT, check);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(EVENT, check);
    };
  }, []);
  return state;
};
