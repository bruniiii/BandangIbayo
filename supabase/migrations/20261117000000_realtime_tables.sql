-- ─────────────────────────────────────────────
-- Live updates for every table the app listens to
--
-- The app subscribes to changes (Supabase Realtime) on these tables, but a
-- table only sends changes once it's in the supabase_realtime publication.
-- Only the group chat tables were added before, so the notification bell,
-- the Notification page and other live lists didn't update until a reload.
-- Row level security still applies: everyone only gets changes to rows
-- they're allowed to see.
--
-- Run after 20261116000000_group_limits.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'notifications', 'admin_messages', 'bookings', 'exclusive_requests',
    'feed_posts', 'feed_comments', 'feed_reactions', 'profiles', 'reviews',
    'tours', 'tour_meetups', 'tour_tracking_logs', 'tour_vehicles',
    'tour_chat_messages', 'tour_chat_reactions'
  ] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
