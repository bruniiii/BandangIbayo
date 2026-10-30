import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { formatDateRange } from './tourUtils';
import { reportError } from './ui/toast';

// ─────────────────────────────────────────────
// ADMIN MESSAGES: a copy of every message an admin sends a joiner (Email a
// Joiner and Send Email to Joiner in Joiner Accounts, Message Joiners in Tour
// Management). Admins see them per joiner; joiners read them on Messages.
// Table: admin_messages (20261115000000_admin_messages.sql).
// ─────────────────────────────────────────────

// Saves sent messages. rows: [{ userId, subject, message, source, tourId, emailed }].
// Never blocks sending: a failed save is only logged.
export const logAdminMessages = async (rows) => {
  const list = rows.filter((r) => r.userId).map((r) => ({
    user_id: r.userId,
    subject: r.subject,
    message: r.message,
    source: r.source || 'email',
    tour_id: r.tourId != null ? String(r.tourId) : null,
    emailed: !!r.emailed,
  }));
  if (!list.length) return;
  const { error } = await supabase.from('admin_messages').insert(list);
  if (error) reportError("Couldn't save the sent message", error.message);
};

// Messages sent to one joiner (or everyone, without userId), newest first.
export const fetchAdminMessages = async ({ userId = null, limit = 50 } = {}) => {
  let q = supabase.from('admin_messages').select('*').order('created_at', { ascending: false }).limit(limit);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  return { data: data || [], error };
};

export const markAdminMessagesRead = () => supabase.rpc('mark_admin_messages_read');

export const messageSourceLabel = (m) => (m.source === 'tour' ? 'Tour update' : 'Email from Bandang IBAYO');

// Joiner: how many messages they haven't opened yet (for the sidebar badge).
export const useAdminInboxUnread = (refreshKey) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count: n } = await supabase.from('admin_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).is('read_at', null);
      if (alive) setCount(n || 0);
    })().catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);
  return [count, setCount];
};

// Tour titles (with dates) for the tour updates in a list of messages.
export const useTourNames = (rows) => {
  const [names, setNames] = useState({});
  const ids = [...new Set((rows || []).filter((m) => m.source === 'tour' && m.tour_id).map((m) => m.tour_id))].sort().join(',');
  useEffect(() => {
    if (!ids) return undefined;
    let alive = true;
    supabase.from('tours').select('id, title, start_date, duration').in('id', ids.split(',')).then(({ data }) => {
      if (!alive) return;
      setNames(Object.fromEntries((data || []).map((t) => [String(t.id), `${t.title}${t.start_date ? ` (${formatDateRange(t.start_date, t.duration)})` : ''}`])));
    });
    return () => { alive = false; };
  }, [ids]);
  return names;
};
