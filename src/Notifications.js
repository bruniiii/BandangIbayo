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

   -- Notifications are inserted from the client on behalf of *other*
   -- users (e.g. a joiner's booking notifies the admin), so inserts
   -- need to be allowed broadly. If you want tighter control, move
   -- these inserts into a Supabase Edge Function / DB trigger instead.
   create policy "Any authenticated user can insert notifications"
     on notifications for insert
     with check (auth.role() = 'authenticated');
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
      .from('profiles')
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
      .from('profiles')
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