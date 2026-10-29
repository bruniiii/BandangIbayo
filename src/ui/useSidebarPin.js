import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─────────────────────────────────────────────
// SIDEBAR PIN: each user chooses whether the desktop sidebar stays open
// ("pinned") or opens only while the mouse is over it. Remembered per user
// on this device.
// ─────────────────────────────────────────────

const keyFor = (userId) => `ibayo-sidebar-pinned:${userId || 'guest'}`;
const read = (userId) => {
  try { return localStorage.getItem(keyFor(userId)) === '1'; } catch { return false; }
};

export const useSidebarPin = () => {
  const [userId, setUserId] = useState(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const id = data?.session?.user?.id || null;
      setUserId(id);
      setPinned(read(id));
    });
    return () => { active = false; };
  }, []);

  const togglePinned = useCallback(() => {
    setPinned((was) => {
      const next = !was;
      try { localStorage.setItem(keyFor(userId), next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }, [userId]);

  return [pinned, togglePinned];
};
