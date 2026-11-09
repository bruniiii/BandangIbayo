-- ─────────────────────────────────────────────
-- Which database updates are installed?
--
-- Paste into the Supabase SQL Editor and click Run. Each row says whether
-- that update is in the database. Any "NOT YET" means: run
-- supabase/updates/install_updates.sql (it's safe to run again
-- even if some are already installed). Read-only: changes nothing.
-- ─────────────────────────────────────────────

select update_file, case when installed then 'installed' else 'NOT YET' end as status
from (values
  ('20261111 check-in on the tour day',
     coalesce((select pg_get_functiondef(p.oid) ilike '%v_today < t.start_date%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'check_in_booking' limit 1), false)),
  ('20261112 code before the account is made',
     to_regclass('public.signup_challenges') is not null),
  ('20261113 big update (accommodation, profile, notifications seen)',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'notifications_seen_at')),
  ('20261114 names on Request a Tour',
     coalesce((select pg_get_functiondef(p.oid) ilike '%v_companions%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'hold_requested_slots' limit 1), false)),
  ('20261115 sent messages (Messages page)',
     to_regclass('public.admin_messages') is not null),
  ('20261116 14-slot and group limits',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'tours_slot_limit')),
  ('20261117 live updates (realtime)',
     exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications')),
  ('20261118 more admins (Admin Settings, processed by)',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_main_admin')),
  ('20261119 remove another main admin',
     coalesce((select pg_get_functiondef(p.oid) not ilike '%Main admins can''t be removed%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'remove_admin' limit 1), false)),
  ('20261120 50% downpayment (remembers older 40% ones)',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bookings' and column_name = 'downpayment_amount')),
  ('20261121 archive and restore admins',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'restore_admin')
     and exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass and conname = 'role_check'
                    and pg_get_constraintdef(oid) ilike '%archived_admin%')),
  ('20261122 deactivate / reactivate account',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'reactivate_my_account')),
  ('20261123 favorite tours',
     to_regclass('public.tour_favorites') is not null),
  ('20261124 archived joiners + auto-archive setting',
     to_regclass('public.app_settings') is not null),
  ('20261125 reminder 15 minutes before departure',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'notify_departure_soon')),
  ('20261126 restored admins verify their email',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'admin_restore_pending_at')),
  ('20261127 one tour per day',
     exists (select 1 from pg_trigger where tgname = 'tours_no_overlap' and tgrelid = 'public.tours'::regclass)),
  ('20261128 joiners restore their own account',
     coalesce((select pg_get_functiondef(p.oid) not ilike '%Contact Bandang Ibayo%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'reactivate_my_account' limit 1), false)),
  ('20261129 joiners post once every 48 hours',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_feed_post_at')),
  ('20261130 pickup spots along the route (maps)',
     to_regclass('public.pickup_spots') is not null),
  ('20261201 live van location (driver link)',
     to_regclass('public.van_locations') is not null),
  ('20261202 tracking runs by itself (trip-not-started alert)',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'notify_trip_not_started')),
  ('20261203 reliability (notification links, van leaves at, error log)',
     to_regclass('public.client_errors') is not null),
  ('20261204 bad weather: postpone / cancel a tour date',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'weather_cancel')),
  ('20261205 stricter Arrived for the van (100 m, twice in a row)',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tour_meetups' and column_name = 'arrive_hits')),
  ('20261206 old places-along-the-road list removed',
     to_regclass('public.route_place_cache') is null),
  ('20261207 pickup points in driving order',
     coalesce((select pg_get_functiondef(p.oid) ilike '%route_order%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'tour_pickup_points' limit 1), false)),
  ('20261208 archived admins can ask to be restored',
     to_regprocedure('public.approve_admin_restore(uuid)') is not null),
  ('20261209 safer refunds (history, receipts, joiner confirms)',
     to_regclass('public.refund_log') is not null
     and exists (select 1 from pg_trigger where tgname = 'bookings_guard_refund_columns')
     and exists (select 1 from storage.buckets where id = 'refund-proofs')),
  ('20261210 bad weather: only later dates',
     coalesce((select pg_get_functiondef(p.oid) ilike '%must be after%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'weather_postpone' limit 1), false)),
  ('20261211 bad weather: new dates start after the last day',
     coalesce((select pg_get_functiondef(p.oid) ilike '%must start after%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'weather_postpone' limit 1), false)),
  ('20261212 postponed notices say the old dates',
     coalesce((select pg_get_functiondef(p.oid) ilike '%is moved from%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'weather_postpone' limit 1), false)),
  ('20261213 exclusive tours: downpayment first, private tour + booking',
     to_regprocedure('public.exclusive_make_booking(' || (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.exclusive_requests'::regclass and attname = 'id') || ',' || (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.tours'::regclass and attname = 'id') || ')') is not null
     and exists (select 1 from pg_policies where tablename = 'tours' and policyname = 'tours_hide_exclusive')),
  ('20261214 one tour per day counts approved exclusive tours',
     exists (select 1 from pg_trigger where tgname = 'exclusive_requests_one_per_day')),
  ('20261215 exclusive tours: budget and rates ₱3,000 – ₱100,000',
     coalesce((select pg_get_functiondef(p.oid) like '%new.budget < 3000%'
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'exclusive_requests_flow_rules' limit 1), false)),
  ('20261216 panel feedback: payment password, removed accounts, driver ID, survey, comment edits',
     to_regclass('public.admin_password_checks') is not null
     and to_regclass('public.driver_documents') is not null
     and to_regclass('public.system_feedback') is not null
     and exists (select 1 from pg_trigger where tgname = 'bookings_payment_needs_password')
     and exists (select 1 from pg_trigger where tgname = 'feed_comments_guard_edit'))
) as u(update_file, installed);
