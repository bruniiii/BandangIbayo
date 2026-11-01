-- ═══════════════════════════════════════════════════════════════════════
-- RESET TEST DATA  (run once, before going live)
--
-- Removes everything made while testing:
--   • every tour (and its dates, rates, expenses, pickup points, tracking,
--     vehicles, waitlists, favorites, group chats)
--   • every booking, payment record, check-in and booking log
--   • every exclusive tour / tour request
--   • every feed post, comment and reaction; every review and reaction
--   • every notification and message
--   • login/signup codes, lockouts, the email log, archived-account records
--   • every admin account EXCEPT the main admin
--   • joiner accounts whose email was never verified
--
-- Kept: the main admin account, verified joiner accounts (see the switch
-- below), and the settings in app_settings / app_secrets.
--
-- THIS CANNOT BE UNDONE. Run it in the Supabase SQL Editor: paste it all,
-- click Run. If anything fails, nothing is deleted (it runs as one step).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  -- Switch: true = also delete VERIFIED joiner accounts (every joiner).
  --         false = delete only joiners whose email was never verified.
  v_delete_all_joiners constant boolean := false;

  v_main_admins int;
  v_users uuid[];
  t text;
begin
  -- Safety check: never run without a main admin to keep.
  select count(*) into v_main_admins
  from public.profiles where role = 'admin' and coalesce(is_main_admin, false);
  if v_main_admins = 0 then
    raise exception 'No main admin found (profiles.role = admin and is_main_admin = true). Nothing was deleted.';
  end if;

  -- 1. All test records. TRUNCATE also clears anything that points at these rows.
  foreach t in array array[
    'booking_activity', 'bookings', 'pickup_requests', 'pickup_day_notices',
    'tour_chat_reactions', 'tour_chat_reads', 'tour_chat_messages',
    'tour_tracking_logs', 'tour_vehicles', 'tour_meetups', 'tour_rates', 'tour_expenses',
    'tour_waitlist', 'tour_favorites', 'review_invites', 'review_reactions', 'reviews',
    'feed_reactions', 'feed_comments', 'feed_posts',
    'exclusive_requests', 'notifications', 'admin_messages', 'email_log',
    'login_challenges', 'login_lockouts', 'signup_challenges', 'archived_accounts',
    'tours'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I restart identity cascade', t);
      raise notice 'Cleared %', t;
    end if;
  end loop;

  -- Booking numbers start again from 00001.
  if to_regclass('public.booking_number_seq') is not null then
    alter sequence public.booking_number_seq restart with 1;
  end if;

  -- 2. Accounts to remove: every admin except the main admin (archived admins
  --    too), and joiners who never verified their email (or every joiner, if
  --    the switch above is on).
  select coalesce(array_agg(u.id), '{}') into v_users
  from auth.users u
  left join public.profiles p on p.id = u.id
  where not exists (
          select 1 from public.profiles m
          where m.id = u.id and m.role = 'admin' and coalesce(m.is_main_admin, false)
        )
    and (
          p.role in ('admin', 'archived_admin')
          or (coalesce(p.role, 'joiner') not in ('admin', 'archived_admin')
              and (v_delete_all_joiners or u.email_confirmed_at is null))
        );

  delete from public.profiles where id = any(v_users);
  delete from auth.users where id = any(v_users);
  raise notice 'Removed % account(s)', coalesce(array_length(v_users, 1), 0);

  -- Profiles left without a login (made while testing) go too, except the main admin.
  delete from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id)
    and not (p.role = 'admin' and coalesce(p.is_main_admin, false));

  -- Kept joiners start fresh: no "seen" marker left from the deleted notifications.
  update public.profiles
     set notifications_seen_at = null
   where role not in ('admin', 'archived_admin');
end $$;

-- What's left (check this after running):
select role, count(*) as accounts from public.profiles group by role order by role;
