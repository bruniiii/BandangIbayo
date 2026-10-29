import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─────────────────────────────────────────────
// SIDEBAR PIN: each user chooses whether the desktop sidebar stays open
// ("pinned") or opens only while the mouse is over it. It starts unpinned,
// and the choice is saved on the account (auth user_metadata.sidebar_pinned),
// so it's the same in every browser. This browser keeps a copy so the page
// opens right away.
// ─────────────────────────────────────────────

const keyFor = (userId) => `ibayo-sidebar-pinned:${userId || 'guest'}`;
const readLocal = (userId) => {
  try { return localStorage.getItem(keyFor(userId)) === '1'; } catch { return false; }
};
const writeLocal = (userId, pinned) => {
  try { localStorage.setItem(keyFor(userId), pinned ? '1' : '0'); } catch { /* private mode */ }
};

export const useSidebarPin = () => {
  const [userId, setUserId] = useState(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data?.session?.user;
      const id = user?.id || null;
      const saved = user?.user_metadata?.sidebar_pinned;
      const value = typeof saved === 'boolean' ? saved : readLocal(id);
      setUserId(id);
      setPinned(value);
      writeLocal(id, value);
    });
    return () => { active = false; };
  }, []);

  const togglePinned = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    writeLocal(userId, next);
    if (userId) {
      supabase.auth.updateUser({ data: { sidebar_pinned: next } })
        .then(({ error }) => { if (error) console.warn('Could not save the sidebar setting:', error.message); });
    }
  }, [userId, pinned]);

  return [pinned, togglePinned];
};
