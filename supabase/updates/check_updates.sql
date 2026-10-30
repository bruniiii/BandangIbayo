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
              where n.nspname = 'public' and p.proname = 'reactivate_my_account'))
) as u(update_file, installed);
