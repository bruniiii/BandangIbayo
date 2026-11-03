-- ─────────────────────────────────────────────
-- Archived admins can ask to be restored (the main admin approves)
--
-- An archived admin who logs in with the right password is asked whether to
-- send the main admin a restore request. The main admin gets a notification,
-- and the request shows in Admin Settings → Archived Admins with Approve and
-- Decline. Only an approval makes them an admin again (still within the
-- 2-other-admins limit). Asking again while a request waits sends nothing new.
--
-- Run after 20261207000000_pickup_order.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists admin_restore_requested_at timestamptz;

-- The request itself: 'sent', 'already' (one is waiting), 'pending_code'
-- (the main admin already started a restore with an emailed code) or
-- 'not_archived'. Used by the auth function (password login) and below.
create or replace function public.request_admin_restore_for(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_requested timestamptz;
  v_pending timestamptz;
  v_name text;
begin
  v_role := (select p.role from public.profiles p where p.id = p_id);
  if v_role is distinct from 'archived_admin' then
    return 'not_archived';
  end if;
  v_requested := (select p.admin_restore_requested_at from public.profiles p where p.id = p_id);
  v_pending := (select p.admin_restore_pending_at from public.profiles p where p.id = p_id);
  if v_pending is not null then
    return 'pending_code';
  end if;
  if v_requested is not null then
    return 'already';
  end if;

  update public.profiles set admin_restore_requested_at = now() where id = p_id;
  v_name := public.admin_display_name(p_id);
  insert into public.notifications (user_id, title, message, type, related_id)
  select m.id, 'An archived admin wants to come back 🔑',
         format('%s asked to be restored as an admin. Approve or decline it in Admin Settings → Archived Admins.', coalesce(v_name, 'An archived admin')),
         'account', null::uuid
    from public.profiles m
   where m.role = 'admin' and m.is_main_admin;
  return 'sent';
end;
$$;

-- The same, for an archived admin who is signed in (Sign in with Google).
create or replace function public.request_admin_restore()
returns text
language sql
security definer
set search_path = public
as $$
  select public.request_admin_restore_for(auth.uid());
$$;

-- Main admin: approve a request → an admin again (as the kind they were).
create or replace function public.approve_admin_restore(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_main boolean;
  v_others int;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can restore admins.';
  end if;
  v_was_main := (select p.archived_was_main from public.profiles p
                  where p.id = p_id and p.role = 'archived_admin' and p.admin_restore_requested_at is not null);
  if v_was_main is null then
    raise exception 'That admin has no restore request waiting.';
  end if;
  if not v_was_main then
    v_others := (select count(*) from public.profiles p where p.role = 'admin' and not coalesce(p.is_main_admin, false));
    if v_others >= 2 then
      raise exception 'You can have at most 2 other admins. Archive one first to restore another.';
    end if;
  end if;
  update public.profiles
     set role = 'admin', is_main_admin = v_was_main, archived_was_main = false, admin_archived_at = null,
         admin_restore_pending_at = null, admin_restore_requested_at = null
   where id = p_id;
  insert into public.notifications (user_id, title, message, type, related_id)
  values (p_id, 'Welcome back 🎉', 'The main admin approved your request. Your admin account is restored.', 'account', null::uuid);
end;
$$;

-- Main admin: decline a request (they stay archived and can ask again later).
create or replace function public.decline_admin_restore(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can decline restore requests.';
  end if;
  update public.profiles set admin_restore_requested_at = null
   where id = p_id and role = 'archived_admin';
end;
$$;

-- Archiving again starts with no old request.
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
     set archived_was_main = is_main_admin, role = 'archived_admin', is_main_admin = false, admin_archived_at = now(),
         admin_restore_requested_at = null
   where id = p_id and role = 'admin';
  if not found then
    raise exception 'That account isn''t an admin.';
  end if;
end;
$$;

drop function if exists public.list_archived_admins();
create function public.list_archived_admins()
returns table (id uuid, name text, email text, was_main_admin boolean, archived_at timestamptz, pending boolean, requested_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.archived_was_main, p.admin_archived_at,
         p.admin_restore_pending_at is not null, p.admin_restore_requested_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'archived_admin' and public.is_main_admin()
   order by p.admin_restore_requested_at desc nulls last, p.admin_archived_at desc;
$$;

revoke all on function public.request_admin_restore_for(uuid) from public, anon, authenticated;
revoke all on function public.request_admin_restore() from public, anon;
revoke all on function public.approve_admin_restore(uuid) from public, anon;
revoke all on function public.decline_admin_restore(uuid) from public, anon;
revoke all on function public.archive_admin(uuid) from public, anon;
revoke all on function public.list_archived_admins() from public, anon;
grant execute on function public.request_admin_restore_for(uuid) to service_role;
grant execute on function public.request_admin_restore() to authenticated;
grant execute on function public.approve_admin_restore(uuid) to authenticated;
grant execute on function public.decline_admin_restore(uuid) to authenticated;
grant execute on function public.archive_admin(uuid) to authenticated;
grant execute on function public.list_archived_admins() to authenticated;
