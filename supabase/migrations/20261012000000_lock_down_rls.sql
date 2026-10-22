-- Row Level Security fixes for bookings, tours and profiles.
--
-- Before this migration:
--   * bookings had RLS disabled: anyone with the public (anon) key could read,
--     change or delete every booking.
--   * tours allowed INSERT and UPDATE for everyone, including logged-out visitors.
--   * profiles were readable by logged-out visitors (emails, phones, addresses).
--   * nothing stopped a joiner from setting their own profiles.role to 'admin'.
--
-- Requires 20261010000000_create_booking_function.sql (joiners create bookings
-- through create_booking(), which bypasses RLS) and
-- 20261011000000_tour_slots_booked.sql (public slot counts).

-- ─────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────

-- True when the logged-in user's profile has role 'admin'.
-- security definer so policies on profiles can call it without recursing.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

revoke all on function public.is_admin from public;
grant execute on function public.is_admin to anon, authenticated, service_role;

-- True when the current statement comes from the website (the anon or
-- authenticated API roles). False for the SQL Editor, the dashboard, and the
-- send-email function's service-role key.
create or replace function public.is_client_request()
returns boolean
language sql
stable
as $$
  select coalesce(
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) in ('anon', 'authenticated'),
    false
  );
$$;

-- ─────────────────────────────────────────────
-- bookings
-- ─────────────────────────────────────────────

alter table public.bookings enable row level security;

drop policy if exists "bookings_select_own_or_admin" on public.bookings;
create policy "bookings_select_own_or_admin" on public.bookings
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Joiners update their own booking only to submit a receipt or cancel;
-- bookings_guard_joiner_update() below limits which columns they may change.
drop policy if exists "bookings_update_own_or_admin" on public.bookings;
create policy "bookings_update_own_or_admin" on public.bookings
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Joiners create bookings through create_booking(), never by direct insert.
drop policy if exists "bookings_insert_admin" on public.bookings;
create policy "bookings_insert_admin" on public.bookings
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "bookings_delete_admin" on public.bookings;
create policy "bookings_delete_admin" on public.bookings
  for delete to authenticated
  using (public.is_admin());

-- A joiner may only:
--   * submit or resubmit payment: gcash_number, gcash_reference_no, receipt_url,
--     payment_method, amount_paid, with payment_status set to 'Pending'
--   * cancel: booking_status 'Cancelled' plus cancellation_reason
-- Everything else (price, slots, tour, owner, confirming payment, balance...)
-- stays admin-only.
create or replace function public.bookings_guard_joiner_update()
returns trigger
language plpgsql
as $$
declare
  joiner_editable constant text[] := array[
    'gcash_number', 'gcash_reference_no', 'receipt_url', 'payment_method',
    'amount_paid', 'payment_status', 'booking_status', 'cancellation_reason', 'updated_at'
  ];
begin
  -- Separate IFs: Postgres doesn't promise to skip the second half of an OR.
  if not public.is_client_request() then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - joiner_editable) is distinct from (to_jsonb(old) - joiner_editable) then
    raise exception 'You can only update payment details or cancel this booking.';
  end if;

  if new.payment_status is distinct from old.payment_status and new.payment_status <> 'Pending' then
    raise exception 'Payment status can only be changed by an admin.';
  end if;

  if new.booking_status is distinct from old.booking_status and new.booking_status <> 'Cancelled' then
    raise exception 'Booking status can only be changed by an admin.';
  end if;

  if old.booking_status in ('Cancelled', 'Rejected') and new is distinct from old then
    raise exception 'This booking is closed.';
  end if;

  if new.payment_method is not null and new.payment_method not in ('Full Payment', 'Downpayment') then
    raise exception 'Invalid payment method.';
  end if;

  if new.amount_paid is not null and (new.amount_paid < 0 or new.amount_paid > coalesce(old.total_price, 0)) then
    raise exception 'Invalid payment amount.';
  end if;

  return new;
end;
$$;

-- "a_" so it runs before any updated_at trigger (triggers fire in name order).
drop trigger if exists a_bookings_guard_joiner_update on public.bookings;
create trigger a_bookings_guard_joiner_update
  before update on public.bookings
  for each row execute function public.bookings_guard_joiner_update();

-- ─────────────────────────────────────────────
-- tours: anyone may read; only admins may write
-- ─────────────────────────────────────────────

drop policy if exists "Enable insert access for all users" on public.tours;
drop policy if exists "Enable update access for all users" on public.tours;

drop policy if exists "tours_insert_admin" on public.tours;
create policy "tours_insert_admin" on public.tours
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "tours_update_admin" on public.tours;
create policy "tours_update_admin" on public.tours
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tours_delete_admin" on public.tours;
create policy "tours_delete_admin" on public.tours
  for delete to authenticated
  using (public.is_admin());

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────

-- Logged-out visitors no longer read profiles. The remaining
-- "Allow read access to profiles for authenticated users" policy still lets
-- logged-in users read profiles (the feed and reviews show other joiners'
-- names and avatars).
drop policy if exists "Enable read access for all users" on public.profiles;

-- Login by username used to read profiles.email as a logged-out visitor.
-- This returns just the one email the login form needs.
create or replace function public.email_for_login(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.profiles where lower(username) = lower(trim(p_username)) limit 1;
$$;

revoke all on function public.email_for_login from public;
grant execute on function public.email_for_login to anon, authenticated;

-- New profiles always start as 'joiner', whatever the sign-up form sends:
-- both website inserts and inserts made by another trigger (such as a
-- "create profile on sign-up" trigger on auth.users). A row inserted directly
-- in the SQL Editor or dashboard keeps its role. Only an admin, or the SQL
-- Editor/dashboard, can change a role afterwards.
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client_request() or pg_trigger_depth() > 1 then
      new.role := 'joiner';
    end if;
    return new;
  end if;

  if public.is_client_request() then
    if (new.role is distinct from old.role or new.id is distinct from old.id) and not public.is_admin() then
      raise exception 'You cannot change this field.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a_profiles_guard_role on public.profiles;
create trigger a_profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_role();
