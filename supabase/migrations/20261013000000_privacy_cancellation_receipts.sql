-- Profile privacy, cancellation window, notification limits, private receipts.
--
-- Requires 20261012000000_lock_down_rls.sql (is_admin(), is_client_request(),
-- bookings_guard_joiner_update()).

-- ─────────────────────────────────────────────
-- 1. Profile privacy
-- ─────────────────────────────────────────────
-- Logged-in users could read every profile: phone, address, birthday, email.
-- Now: your own profile, or every profile if you're an admin. Other users'
-- names and photos (feed, reviews) come from the public_profiles view, which
-- has only those columns.

drop policy if exists "Allow read access to profiles for authenticated users" on public.profiles;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using (public.is_admin());

-- Runs as its owner, so it can show these columns of every row
-- without opening up the profiles table itself.
create or replace view public.public_profiles as
  select id, first_name, last_name, username, avatar_url, role
  from public.profiles;

revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

-- ─────────────────────────────────────────────
-- 2. Cancellation window (Terms, section 2)
-- ─────────────────────────────────────────────
-- "Cancellations are not accepted within two (2) weeks of the scheduled tour date."
-- Change the number here (and CANCELLATION_CUTOFF_DAYS in src/tourUtils.js)
-- if the policy changes.
create or replace function public.cancellation_cutoff_days()
returns integer
language sql
immutable
as $$ select 14 $$;

-- Same checks as before, plus the cancellation window.
create or replace function public.bookings_guard_joiner_update()
returns trigger
language plpgsql
as $$
declare
  joiner_editable constant text[] := array[
    'gcash_number', 'gcash_reference_no', 'receipt_url', 'payment_method',
    'amount_paid', 'payment_status', 'booking_status', 'cancellation_reason', 'updated_at'
  ];
  v_start_date date;
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

  if new.booking_status = 'Cancelled' and old.booking_status is distinct from 'Cancelled' then
    select start_date into v_start_date from public.tours where id = old.tour_id;
    if v_start_date - (now() at time zone 'Asia/Manila')::date < public.cancellation_cutoff_days() then
      raise exception 'Cancellations are not accepted within % days of the tour date.', public.cancellation_cutoff_days();
    end if;
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

-- ─────────────────────────────────────────────
-- 3. Notifications
-- ─────────────────────────────────────────────
-- Any logged-in user could insert a notification for anyone. Now:
--   * admins can notify anyone
--   * joiners can only notify admins (new booking, cancellation, review...)
-- Users can also delete their own notifications (the Notifications page's
-- delete button had no policy and silently did nothing).

create or replace function public.user_is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_user_id and role = 'admin');
$$;

revoke all on function public.user_is_admin from public;
grant execute on function public.user_is_admin to authenticated, service_role;

drop policy if exists "Allow authenticated users to insert notifications" on public.notifications;
drop policy if exists "Admins can insert notifications" on public.notifications;

drop policy if exists "notifications_insert_admin_or_to_admin" on public.notifications;
create policy "notifications_insert_admin_or_to_admin" on public.notifications
  for insert to authenticated
  with check (public.is_admin() or public.user_is_admin(user_id));

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- "New Joiner Registered" used to be sent from the sign-up page, often before
-- the new user was logged in. The database sends it now.
create or replace function public.notify_admins_new_joiner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from 'admin' then
    insert into public.notifications (user_id, title, message, type, related_id)
    select a.id,
           'New Joiner Registered',
           coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), new.username, 'A new joiner')
             || ' just created an account.',
           'account',
           new.id
    from public.profiles a
    where a.role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists notify_admins_new_joiner on public.profiles;
create trigger notify_admins_new_joiner
  after insert on public.profiles
  for each row execute function public.notify_admins_new_joiner();

-- ─────────────────────────────────────────────
-- 4. Private receipts
-- ─────────────────────────────────────────────
-- The booking-receipts bucket was public: anyone with a receipt link could open
-- it. Now it's private. Joiners upload into a folder named after their user id
-- and admins view receipts through short-lived signed links.

update storage.buckets set public = false where id = 'booking-receipts';

-- Remove the old policies for this bucket. A policy that also covers the
-- 'tours' bucket (tour photos, avatars) is not dropped automatically: the
-- migration stops instead, so nothing else breaks.
do $$
declare
  p record;
begin
  for p in
    select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    if p.expr like '%booking-receipts%' and p.policyname not like 'receipts\_%' then
      if p.expr like '%''tours''%' then
        raise exception 'Storage policy "%" covers both booking-receipts and tours. Send this message to Claude.', p.policyname;
      end if;
      execute format('drop policy %I on storage.objects', p.policyname);
    end if;
  end loop;
end;
$$;

drop policy if exists "receipts_insert_own_folder" on storage.objects;
create policy "receipts_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'booking-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_select_own_or_admin" on storage.objects;
create policy "receipts_select_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Last step: list storage policies that don't name any bucket. Such a policy
-- applies to every bucket, so it could still let people read receipts.
-- No rows = all good. Any rows: send a screenshot to Claude.
select policyname as "check_these_storage_policies", cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and coalesce(qual, '') || coalesce(with_check, '') not like '%bucket_id%';
