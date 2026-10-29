-- ─────────────────────────────────────────────
-- Admin Settings: a main admin can also remove another main admin
--
-- (Every admin that existed when 20261118 ran became a main admin.) A main
-- admin still can't remove themselves, so there's always at least one.
--
-- Run after 20261118000000_admin_accounts.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.remove_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can remove admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t remove yourself.';
  end if;
  update public.profiles set role = 'joiner', is_main_admin = false where id = p_id and role = 'admin';
end;
$$;

revoke all on function public.remove_admin(uuid) from public, anon;
grant execute on function public.remove_admin(uuid) to authenticated;
