-- ─────────────────────────────────────────────
-- More than one admin
--
-- 1. A main admin (profiles.is_main_admin). The admins that exist now become
--    main admins. Only a main admin can add or remove admins; every admin can
--    do everything else, the same as before.
-- 2. Admin Settings: list_admins(), make_admin(email) for an existing account,
--    remove_admin(id). New admin accounts are created by the auth function
--    ("create-admin"), which checks is_main_admin() the same way.
-- 3. Who processed a payment: when an admin changes a booking's or exclusive
--    tour's payment, their name is saved (processed_by_name, and
--    balance_processed_by_name for the balance) and shown on the receipt.
--    Online payments (PayMongo) have no admin name.
--
-- Run after 20261117000000_realtime_tables.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Main admin ─────────────────────────────
alter table public.profiles add column if not exists is_main_admin boolean not null default false;

-- The admins there are now become main admins (only the first time).
update public.profiles set is_main_admin = true
 where role = 'admin'
   and not exists (select 1 from public.profiles where is_main_admin);

create or replace function public.is_main_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_main_admin);
$$;

-- Admin name as shown on receipts and the top-right card.
create or replace function public.admin_display_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, u.email, 'Admin')
    from public.profiles p left join auth.users u on u.id = p.id
   where p.id = p_id;
$$;

-- Roles: only a main admin (or the SQL Editor) changes who is an admin, and a
-- main admin can't remove their own admin rights (so there's always one).
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client_request() or pg_trigger_depth() > 1 then
      new.role := 'joiner';
      new.is_main_admin := false;
    end if;
    return new;
  end if;

  if public.is_client_request() then
    if new.id is distinct from old.id then
      raise exception 'You cannot change this field.';
    end if;
    if (new.role is distinct from old.role or new.is_main_admin is distinct from old.is_main_admin)
       and not public.is_main_admin() then
      raise exception 'Only the main admin can add or remove admins.';
    end if;
    if old.id = auth.uid() and (new.role is distinct from 'admin' or not new.is_main_admin) and old.is_main_admin then
      raise exception 'You can''t remove your own main admin rights.';
    end if;
  end if;
  if new.role is distinct from 'admin' then
    new.is_main_admin := false;
  end if;
  return new;
end;
$$;

-- ── 2. Admin Settings ─────────────────────────
create or replace function public.list_admins()
returns table (id uuid, name text, email text, is_main_admin boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.is_main_admin, u.created_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'admin' and public.is_admin()
   order by p.is_main_admin desc, u.created_at;
$$;

create or replace function public.make_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can add admins.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No account uses that email. Create a new admin account instead.';
  end if;
  update public.profiles set role = 'admin' where id = v_id;
  return public.admin_display_name(v_id);
end;
$$;

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
  if exists (select 1 from public.profiles where id = p_id and is_main_admin) then
    raise exception 'Main admins can''t be removed here.';
  end if;
  update public.profiles set role = 'joiner', is_main_admin = false where id = p_id and role = 'admin';
end;
$$;

revoke all on function public.list_admins() from public, anon;
revoke all on function public.make_admin(text) from public, anon;
revoke all on function public.remove_admin(uuid) from public, anon;
revoke all on function public.admin_display_name(uuid) from public, anon;
grant execute on function public.is_main_admin() to authenticated;
grant execute on function public.list_admins() to authenticated;
grant execute on function public.make_admin(text) to authenticated;
grant execute on function public.remove_admin(uuid) to authenticated;
grant execute on function public.admin_display_name(uuid) to authenticated;

-- ── 3. Who processed a payment ────────────────
alter table public.bookings add column if not exists processed_by uuid;
alter table public.bookings add column if not exists processed_by_name text;
alter table public.bookings add column if not exists balance_processed_by_name text;
alter table public.exclusive_requests add column if not exists processed_by uuid;
alter table public.exclusive_requests add column if not exists processed_by_name text;
alter table public.exclusive_requests add column if not exists balance_processed_by_name text;

-- When an admin changes the payment, their name is saved. Nobody else can set
-- these columns.
create or replace function public.stamp_processed_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := auth.uid() is not null and public.is_admin();
  v_name  text;
begin
  -- Only this trigger writes these.
  new.processed_by := old.processed_by;
  new.processed_by_name := old.processed_by_name;
  new.balance_processed_by_name := old.balance_processed_by_name;
  if not v_admin then
    return new;
  end if;
  v_name := public.admin_display_name(auth.uid());

  if new.balance_settled is distinct from old.balance_settled and coalesce(new.balance_settled, false) then
    new.balance_processed_by_name := v_name;
  elsif new.payment_status is distinct from old.payment_status
     or new.amount_paid is distinct from old.amount_paid
     or (tg_table_name = 'bookings' and to_jsonb(new) ->> 'booking_status' is distinct from to_jsonb(old) ->> 'booking_status') then
    new.processed_by := auth.uid();
    new.processed_by_name := v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_bookings_stamp_processed_by on public.bookings;
create trigger zz_bookings_stamp_processed_by
  before update on public.bookings
  for each row execute function public.stamp_processed_by();

drop trigger if exists zz_exclusive_requests_stamp_processed_by on public.exclusive_requests;
create trigger zz_exclusive_requests_stamp_processed_by
  before update on public.exclusive_requests
  for each row execute function public.stamp_processed_by();
