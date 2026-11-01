-- ─────────────────────────────────────────────
-- Restoring an archived admin needs their email verified again
--
-- Admin Settings → Restore emails a 6-digit code to the admin (auth function,
-- "restore-admin"; the code expires after 10 minutes). Until the code is
-- entered ("restore-admin-verify") the account stays archived, can't log in,
-- and shows as "Pending verification" (profiles.admin_restore_pending_at).
--
-- Run after 20261125000000_departure_reminder.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists admin_restore_pending_at timestamptz;

-- Restoring now goes through the email code; the old one-click restore is off.
create or replace function public.restore_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Restoring an admin needs their email verified. Use Restore in Admin Settings.';
end;
$$;

drop function if exists public.list_archived_admins();
create function public.list_archived_admins()
returns table (id uuid, name text, email text, was_main_admin boolean, archived_at timestamptz, pending boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.archived_was_main, p.admin_archived_at,
         p.admin_restore_pending_at is not null
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'archived_admin' and public.is_main_admin()
   order by p.admin_archived_at desc;
$$;

revoke all on function public.list_archived_admins() from public, anon;
grant execute on function public.list_archived_admins() to authenticated;
