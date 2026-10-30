-- ─────────────────────────────────────────────
-- Admin Settings: archive an admin instead of removing them, and restore them
--
-- An archived admin's role is 'archived_admin': they can't open the admin
-- dashboard (or log in at all), but their account, name and history stay.
-- The main admin can restore them later, as the kind of admin they were.
--
-- Run after 20261120000000_downpayment_50.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists admin_archived_at timestamptz;
alter table public.profiles add column if not exists archived_was_main boolean not null default false;

create or replace function public.archive_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can archive admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t archive yourself.';
  end if;
  update public.profiles
     set archived_was_main = is_main_admin, role = 'archived_admin', is_main_admin = false, admin_archived_at = now()
   where id = p_id and role = 'admin';
  if not found then
    raise exception 'That account isn''t an admin.';
  end if;
end;
$$;

create or replace function public.restore_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can restore admins.';
  end if;
  update public.profiles
     set role = 'admin', is_main_admin = archived_was_main, archived_was_main = false, admin_archived_at = null
   where id = p_id and role = 'archived_admin';
  if not found then
    raise exception 'That admin isn''t archived.';
  end if;
end;
$$;

create or replace function public.list_archived_admins()
returns table (id uuid, name text, email text, was_main_admin boolean, archived_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.archived_was_main, p.admin_archived_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'archived_admin' and public.is_main_admin()
   order by p.admin_archived_at desc;
$$;

revoke all on function public.archive_admin(uuid) from public, anon;
revoke all on function public.restore_admin(uuid) from public, anon;
revoke all on function public.list_archived_admins() from public, anon;
grant execute on function public.archive_admin(uuid) to authenticated;
grant execute on function public.restore_admin(uuid) to authenticated;
grant execute on function public.list_archived_admins() to authenticated;
