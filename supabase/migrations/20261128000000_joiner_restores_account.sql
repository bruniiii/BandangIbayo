-- ─────────────────────────────────────────────
-- Joiners decide whether to restore their archived account
--
-- An archived joiner (deactivated, deleted, or no login for a long time) is
-- asked when they log in with the right password whether they want their
-- account back. Only their "yes" restores it; admins no longer restore
-- joiners. The password login does it in the auth function; this function
-- does it for Sign in with Google (the joiner is already signed in then).
--
-- Run after 20261127000000_one_tour_per_day.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.reactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'archived_admin')) then
    raise exception 'Admin accounts are restored by the main admin.';
  end if;
  update public.profiles
     set archived_at = null, archive_reason = null, deactivated_at = null
   where id = auth.uid() and archived_at is not null;
end;
$$;

revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.reactivate_my_account() to authenticated;
