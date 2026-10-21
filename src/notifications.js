import { supabase } from './supabaseClient';

/* ─────────────────────────────────────────────
   NOTIFICATIONS HELPER
   Central place for writing rows into the `notifications`
   table so every part of the app (joiner actions, admin
   actions) notifies the right people the same way.

   Table shape expected (create if missing — see SQL below):
     notifications (
       id           uuid primary key default gen_random_uuid(),
       user_id      uuid not null references profiles(id),
       title        text not null,
       message      text not null,
       type         text,            -- e.g. 'booking', 'payment', 'review'...
       related_id   uuid,            -- id of the booking/request/tour/etc.
       is_read      boolean default false,
       created_at   timestamptz default now()
     );

   SQL to run once in Supabase if the table doesn't exist yet:
   ------------------------------------------------------------
   create table if not exists notifications (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references profiles(id) on delete cascade,
     title text not null,
     message text not null,
     type text,
     related_id uuid,
     is_read boolean not null default false,
     created_at timestamptz not null default now()
   );

   alter table notifications enable row level security;

   create policy "Users can view their own notifications"
     on notifications for select
     using (auth.uid() = user_id);

   create policy "Users can update their own notifications"
     on notifications for update
     using (auth.uid() = user_id);

   -- Insert rules now live in
   -- supabase/migrations/20261013000000_privacy_cancellation_receipts.sql:
   -- admins can notify anyone; joiners can only notify admins.
   ------------------------------------------------------------
───────────────────────────────────────────── */

/**
 * Send a notification to a single user (joiner or admin).
 */
export const notifyUser = async (userId, { title, message, type = null, related_id = null }) => {
  if (!userId) return;
  try {
    const { error } = await supabase.from('notifications').insert([{
      user_id: userId,
      title,
      message,
      type,
      related_id,
    }]);
    if (error) console.error('Error creating notification:', error.message);
  } catch (err) {
    console.error('Error creating notification:', err.message);
  }
};

/**
 * Send the same notification to every admin account.
 * Used for joiner-side activity the admin team needs to react to
 * (new bookings, payment submissions, cancellations, new reviews,
 * new exclusive/request tour submissions, new registrations, etc.)
 */
export const notifyAdmins = async ({ title, message, type = null, related_id = null }) => {
  try {
    const { data: admins, error } = await supabase
      .from('public_profiles')
      .select('id')
      .eq('role', 'admin');
    if (error) throw error;
    if (!admins || admins.length === 0) return;

    const rows = admins.map((a) => ({
      user_id: a.id,
      title,
      message,
      type,
      related_id,
    }));
    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) console.error('Error notifying admins:', insertError.message);
  } catch (err) {
    console.error('Error notifying admins:', err.message);
  }
};

/**
 * Send the same notification to every joiner account.
 * Used for admin-side activity that affects everyone
 * (e.g. a brand-new tour posting going live).
 */
export const notifyAllJoiners = async ({ title, message, type = null, related_id = null }) => {
  try {
    const { data: joiners, error } = await supabase
      .from('public_profiles')
      .select('id')
      .neq('role', 'admin');
    if (error) throw error;
    if (!joiners || joiners.length === 0) return;

    const rows = joiners.map((j) => ({
      user_id: j.id,
      title,
      message,
      type,
      related_id,
    }));
    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) console.error('Error notifying joiners:', insertError.message);
  } catch (err) {
    console.error('Error notifying joiners:', err.message);
  }
};
/* ── Keeping the bell and the Notification page in sync ──
   Both read the same rows. Whenever one of them changes a notification
   (read, delete, clear), it calls notificationsChanged() and the other one
   re-loads straight away, instead of waiting on realtime. */
const CHANGED_EVENT = 'ibayo:notifications-changed';

export const notificationsChanged = () => {
  try { window.dispatchEvent(new Event(CHANGED_EVENT)); } catch { /* not in a browser */ }
};

export const onNotificationsChanged = (fn) => {
  window.addEventListener(CHANGED_EVENT, fn);
  return () => window.removeEventListener(CHANGED_EVENT, fn);
};

/* ── Payment notices clear themselves ──
   Joiners' "payment received" notifications (type 'payment') are removed
   3 minutes after they arrive. */
export const PAYMENT_NOTICE_MS = 3 * 60 * 1000;

const isOldPaymentNotice = (n, now = Date.now()) =>
  n.type === 'payment' && now - new Date(n.created_at).getTime() >= PAYMENT_NOTICE_MS;

// Drops expired payment notices from a list and deletes them from the database.
// Returns the list without them.
export const clearOldPaymentNotices = (list) => {
  const now = Date.now();
  const old = list.filter((n) => isOldPaymentNotice(n, now));
  if (old.length) {
    supabase.from('notifications').delete().in('id', old.map((n) => n.id))
      .then(({ error }) => { if (error) console.warn('Could not clear old payment notices:', error.message); });
  }
  return old.length ? list.filter((n) => !isOldPaymentNotice(n, now)) : list;
};

// Milliseconds until the next payment notice in the list expires (or null).
export const nextPaymentNoticeExpiry = (list) => {
  const waits = list.filter((n) => n.type === 'payment')
    .map((n) => PAYMENT_NOTICE_MS - (Date.now() - new Date(n.created_at).getTime()));
  return waits.length ? Math.max(1000, Math.min(...waits) + 500) : null;
};
