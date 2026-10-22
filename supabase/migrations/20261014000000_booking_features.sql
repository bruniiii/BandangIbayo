-- Payment-first bookings, companions, waitlist, rescheduling, verified reviews,
-- booking activity log, data cleanup, and policy fixes from the policy review.
--
-- Requires 20261010000000 … 20261013000000.

-- ═════════════════════════════════════════════
-- 1. Policy fixes from the policy review
-- ═════════════════════════════════════════════

-- The old tours insert policy's name ends with a space, so the earlier
-- migration's DROP missed it: anyone could still create tours.
drop policy if exists "Enable insert access for all users " on public.tours;
drop policy if exists "Enable insert access for all users" on public.tours;

-- tours storage bucket (tour photos, feed media, review media, avatars):
-- any logged-in user could upload, overwrite or delete any file. Now admins can
-- do anything; joiners can only add files to their own avatar and review folders.
drop policy if exists "Allow Admin Uploads 1tthy3_0" on storage.objects;
drop policy if exists "Allow Admin Uploads 1tthy3_1" on storage.objects;
drop policy if exists "Allow Admin Uploads 1tthy3_2" on storage.objects;
drop policy if exists "Allow Admin Uploads 1tthy3_3" on storage.objects;

drop policy if exists "tours_bucket_select" on storage.objects;
create policy "tours_bucket_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'tours');

drop policy if exists "tours_bucket_insert" on storage.objects;
create policy "tours_bucket_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tours'
    and (
      public.is_admin()
      or ((storage.foldername(name))[1] in ('avatars', 'review-media')
          and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

drop policy if exists "tours_bucket_update_admin" on storage.objects;
create policy "tours_bucket_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'tours' and public.is_admin())
  with check (bucket_id = 'tours' and public.is_admin());

drop policy if exists "tours_bucket_delete_admin" on storage.objects;
create policy "tours_bucket_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tours' and public.is_admin());

-- Exclusive / custom tour requests: a joiner could insert a request already
-- marked approved, or with an admin response or package filled in.
create or replace function public.exclusive_requests_guard_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_request() then
    if not public.is_admin() then
      new.status := 'Pending';
      new.admin_response := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.package_details := null;
      new.package_sent_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a_exclusive_requests_guard_insert on public.exclusive_requests;
create trigger a_exclusive_requests_guard_insert
  before insert on public.exclusive_requests
  for each row execute function public.exclusive_requests_guard_insert();

-- ═════════════════════════════════════════════
-- 2. Verified reviews
-- ═════════════════════════════════════════════
-- Only joiners whose payment was confirmed for a tour that has ended can
-- review it, once per tour.

create or replace function public.can_review_tour(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.tours t on t.id = b.tour_id
    where b.tour_id = p_tour_id
      and b.user_id = auth.uid()
      and (b.payment_status = 'Complete' or b.booking_status = 'Completed')
      and b.booking_status not in ('Cancelled', 'Rejected')
      and coalesce(t.end_date, t.start_date) < (now() at time zone 'Asia/Manila')::date
  );
$$;

create or replace function public.has_reviewed_tour(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reviews where tour_id = p_tour_id and user_id = auth.uid());
$$;

revoke all on function public.can_review_tour from public;
revoke all on function public.has_reviewed_tour from public;
grant execute on function public.can_review_tour to authenticated;
grant execute on function public.has_reviewed_tour to authenticated;

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_review_tour(tour_id)
    and not public.has_reviewed_tour(tour_id)
  );

-- Editing your own review can't move it to a tour you didn't go on.
drop policy if exists "reviews_update_own_or_admin" on public.reviews;
create policy "reviews_update_own_or_admin" on public.reviews
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check ((user_id = auth.uid() and public.can_review_tour(tour_id)) or public.is_admin());

-- ═════════════════════════════════════════════
-- 3. New columns and tables
-- ═════════════════════════════════════════════

-- Everyone on a group booking other than the person who booked:
-- [{ "full_name": "...", "contact_number": "..." }, ...]
alter table public.bookings add column if not exists companions jsonb not null default '[]'::jsonb;

-- tour_waitlist and booking_activity reference tours.id / bookings.id, whose
-- types are read from the live tables.
do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
  booking_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                           where attrelid = 'public.bookings'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.tour_waitlist (
      id bigint generated always as identity primary key,
      tour_id %s not null references public.tours(id) on delete cascade,
      user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
      slots_wanted integer not null default 1 check (slots_wanted between 1 and 10),
      created_at timestamptz not null default now(),
      notified_at timestamptz,
      emailed_at timestamptz,
      unique (tour_id, user_id)
    )$f$, tour_id_type);

  execute format($f$
    create table if not exists public.booking_activity (
      id bigint generated always as identity primary key,
      booking_id %s not null references public.bookings(id) on delete cascade,
      actor_id uuid,
      actor_name text not null,
      action text not null,
      changes jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )$f$, booking_id_type);
end;
$$;

create index if not exists booking_activity_booking_id_idx on public.booking_activity (booking_id, created_at);

alter table public.tour_waitlist enable row level security;
alter table public.booking_activity enable row level security;

grant select, insert, delete on public.tour_waitlist to authenticated;
grant select on public.booking_activity to authenticated;

drop policy if exists "waitlist_select_own_or_admin" on public.tour_waitlist;
create policy "waitlist_select_own_or_admin" on public.tour_waitlist
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "waitlist_insert_own" on public.tour_waitlist;
create policy "waitlist_insert_own" on public.tour_waitlist
  for insert to authenticated
  with check (user_id = auth.uid() and notified_at is null and emailed_at is null);

drop policy if exists "waitlist_delete_own_or_admin" on public.tour_waitlist;
create policy "waitlist_delete_own_or_admin" on public.tour_waitlist
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Activity rows are written only by the trigger below; admins can read them.
drop policy if exists "booking_activity_select_admin" on public.booking_activity;
create policy "booking_activity_select_admin" on public.booking_activity
  for select to authenticated
  using (public.is_admin());

-- ═════════════════════════════════════════════
-- 4. Joiner update guard: allow trusted server functions
-- ═════════════════════════════════════════════
-- reschedule_booking() changes tour_id on the joiner's behalf after its own
-- checks; it sets app.trusted_booking_write for its transaction only.
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
  if coalesce(current_setting('app.trusted_booking_write', true), '') = 'on' then
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

-- ═════════════════════════════════════════════
-- 5. Payment-first booking with companions
-- ═════════════════════════════════════════════
-- A booking is created only together with its payment: GCash number, reference
-- number and an uploaded receipt are required. Nothing holds slots unpaid.

do $$
declare
  f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc
           where proname = 'create_booking' and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || f;
  end loop;
end;
$$;

create function public.create_booking(
  p_tour_id            public.tours.id%type,
  p_slots              integer,
  p_payment_method     text,
  p_receipt_path       text,
  p_gcash_number       text,
  p_gcash_reference_no text,
  p_companions         jsonb default '[]'::jsonb
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_tour       public.tours%rowtype;
  v_capacity   integer;
  v_booked     integer;
  v_available  integer;
  v_profile    public.profiles%rowtype;
  v_email      text;
  v_name       text;
  v_companions jsonb := '[]'::jsonb;
  v_person     jsonb;
  v_total      numeric;
  v_booking    public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Please log in to book a tour.';
  end if;

  if p_slots is null or p_slots < 1 or p_slots > 10 then
    raise exception 'You can book between 1 and 10 slots at a time.';
  end if;

  if p_payment_method is null or p_payment_method not in ('Full Payment', 'Downpayment') then
    raise exception 'Please choose full payment or downpayment.';
  end if;

  if nullif(trim(p_gcash_number), '') is null or nullif(trim(p_gcash_reference_no), '') is null then
    raise exception 'Please enter your GCash number and reference number.';
  end if;

  -- The receipt must be a file this joiner uploaded (their own folder).
  if p_receipt_path is null or p_receipt_path not like v_user_id::text || '/%' then
    raise exception 'Please upload your GCash receipt.';
  end if;

  -- Everyone besides the person booking needs a name and contact number.
  if jsonb_typeof(coalesce(p_companions, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_companions, '[]'::jsonb)) <> p_slots - 1 then
    raise exception 'Please enter the name and contact number of each person joining you.';
  end if;
  for v_person in select * from jsonb_array_elements(coalesce(p_companions, '[]'::jsonb)) loop
    if nullif(trim(v_person ->> 'full_name'), '') is null or nullif(trim(v_person ->> 'contact_number'), '') is null then
      raise exception 'Please enter the name and contact number of each person joining you.';
    end if;
    v_companions := v_companions || jsonb_build_array(jsonb_build_object(
      'full_name', left(trim(v_person ->> 'full_name'), 120),
      'contact_number', left(trim(v_person ->> 'contact_number'), 40)
    ));
  end loop;

  -- Lock the tour row: a second booking for this tour waits here until the first commits.
  select * into v_tour from public.tours where id = p_tour_id for update;

  if not found or coalesce(v_tour.is_archived, false) then
    raise exception 'This tour is no longer available.';
  end if;

  if v_tour.start_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'This tour has already started.';
  end if;

  if exists (
    select 1 from public.bookings
    where tour_id = p_tour_id
      and user_id = v_user_id
      and booking_status not in ('Cancelled', 'Rejected')
  ) then
    raise exception 'You already have an active booking for this tour. Please check My Bookings.';
  end if;

  v_capacity := coalesce(v_tour.group_size, 15);

  select coalesce(sum(slots_booked), 0) into v_booked
  from public.bookings
  where tour_id = p_tour_id
    and booking_status not in ('Cancelled', 'Rejected');

  v_available := v_capacity - v_booked;

  if v_available <= 0 then
    raise exception 'Sorry, this tour just became fully booked. Your payment was not recorded; please contact us about your GCash transfer.';
  end if;

  if p_slots > v_available then
    raise exception 'Only % slot(s) remaining. Your payment was not recorded; please contact us about your GCash transfer.', v_available;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  select email into v_email from auth.users where id = v_user_id;

  v_name := nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), '');
  v_total := coalesce(v_tour.price, 0) * p_slots;

  insert into public.bookings (
    tour_id, user_id, booking_number, full_name, email, contact_number,
    slots_booked, total_price, amount_paid, payment_method, receipt_url,
    gcash_number, gcash_reference_no, companions,
    payment_status, booking_status
  ) values (
    p_tour_id,
    v_user_id,
    'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
    coalesce(v_name, 'N/A'),
    coalesce(v_email, 'N/A'),
    coalesce(nullif(trim(v_profile.phone_number), ''), 'N/A'),
    p_slots,
    v_total,
    -- Amount the joiner says they sent (pending admin verification); same 40% rule as the booking screens.
    case p_payment_method when 'Full Payment' then v_total else round(v_total * 0.4) end,
    p_payment_method,
    p_receipt_path,
    left(trim(p_gcash_number), 40),
    left(trim(p_gcash_reference_no), 60),
    v_companions,
    'Pending',
    'Active'
  )
  returning * into v_booking;

  -- Booked: no longer waiting for this tour.
  delete from public.tour_waitlist where tour_id = p_tour_id and user_id = v_user_id;

  return v_booking;
end;
$$;

revoke all on function public.create_booking from public, anon;
grant execute on function public.create_booking to authenticated;

-- ═════════════════════════════════════════════
-- 6. Waitlist notices
-- ═════════════════════════════════════════════
-- When slots open on a tour (cancelled or rejected booking, a booking moved to
-- another date, or a bigger group size), everyone waiting for that many slots
-- or fewer gets an in-app notification, once. Emails are sent by the
-- send-email function ("waitlist-openings"), which the app calls right after
-- such a change.

create or replace function public.notify_waitlist(p_tour_id public.tours.id%type)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour      public.tours%rowtype;
  v_available integer;
  v_count     integer;
begin
  select * into v_tour from public.tours where id = p_tour_id;
  if not found or coalesce(v_tour.is_archived, false)
     or v_tour.start_date < (now() at time zone 'Asia/Manila')::date then
    return 0;
  end if;

  select coalesce(v_tour.group_size, 15) - coalesce(sum(slots_booked), 0) into v_available
  from public.bookings
  where tour_id = p_tour_id and booking_status not in ('Cancelled', 'Rejected');

  if v_available <= 0 then
    return 0;
  end if;

  with ready as (
    update public.tour_waitlist w
    set notified_at = now()
    where w.tour_id = p_tour_id and w.notified_at is null and w.slots_wanted <= v_available
    returning w.user_id, w.slots_wanted
  )
  insert into public.notifications (user_id, title, message, type, related_id)
  select r.user_id,
         'A slot opened up! 🎉',
         format('%s slot(s) just opened on %s (%s). Book now before they fill up again.',
                v_available, v_tour.title, to_char(v_tour.start_date, 'Mon DD, YYYY')),
         'waitlist',
         null
  from ready r;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_waitlist from public;

create or replace function public.bookings_after_update_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.booking_status not in ('Cancelled', 'Rejected') and new.booking_status in ('Cancelled', 'Rejected'))
     or (new.tour_id is distinct from old.tour_id)
     or (new.slots_booked < old.slots_booked) then
    perform public.notify_waitlist(old.tour_id);
  end if;
  return null;
end;
$$;

drop trigger if exists bookings_after_update_waitlist on public.bookings;
create trigger bookings_after_update_waitlist
  after update on public.bookings
  for each row execute function public.bookings_after_update_waitlist();

create or replace function public.tours_after_update_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.group_size, 15) > coalesce(old.group_size, 15) then
    perform public.notify_waitlist(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists tours_after_update_waitlist on public.tours;
create trigger tours_after_update_waitlist
  after update on public.tours
  for each row execute function public.tours_after_update_waitlist();

-- ═════════════════════════════════════════════
-- 7. Move a booking to another date
-- ═════════════════════════════════════════════
-- Allowed while the booking could still be cancelled (14+ days before the
-- tour). The new date must be the same trip (same destination) at the same
-- price per person, so the payment carries over unchanged.

create or replace function public.reschedule_booking(
  p_booking_id  public.bookings.id%type,
  p_new_tour_id public.tours.id%type
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking   public.bookings%rowtype;
  v_old       public.tours%rowtype;
  v_new       public.tours%rowtype;
  v_booked    integer;
  v_today     date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found or (v_booking.user_id is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'Booking not found.';
  end if;
  if v_booking.booking_status in ('Cancelled', 'Rejected') then
    raise exception 'This booking is closed.';
  end if;
  if v_booking.tour_id = p_new_tour_id then
    raise exception 'Please choose a different date.';
  end if;

  -- Lock both tours in a fixed order so two moves can't deadlock.
  perform 1 from public.tours where id in (v_booking.tour_id, p_new_tour_id) order by id for update;
  select * into v_old from public.tours where id = v_booking.tour_id;
  select * into v_new from public.tours where id = p_new_tour_id;

  if not public.is_admin() and v_old.start_date - v_today < public.cancellation_cutoff_days() then
    raise exception 'Bookings can''t be moved within % days of the tour date.', public.cancellation_cutoff_days();
  end if;

  if v_new.id is null or coalesce(v_new.is_archived, false) or v_new.start_date <= v_today then
    raise exception 'That date is no longer available.';
  end if;
  if lower(trim(coalesce(v_new.destination, ''))) <> lower(trim(coalesce(v_old.destination, '')))
     or coalesce(v_new.price, 0) <> coalesce(v_old.price, 0) then
    raise exception 'You can only move to another date of the same trip at the same price.';
  end if;

  if exists (
    select 1 from public.bookings
    where tour_id = p_new_tour_id and user_id = v_booking.user_id
      and booking_status not in ('Cancelled', 'Rejected')
  ) then
    raise exception 'You already have a booking on that date.';
  end if;

  select coalesce(sum(slots_booked), 0) into v_booked
  from public.bookings
  where tour_id = p_new_tour_id and booking_status not in ('Cancelled', 'Rejected');
  if coalesce(v_new.group_size, 15) - v_booked < v_booking.slots_booked then
    raise exception 'Not enough slots left on that date.';
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
  set tour_id = p_new_tour_id, reminder_sent_at = null
  where id = p_booking_id
  returning * into v_booking;
  perform set_config('app.trusted_booking_write', 'off', true);

  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id,
         'Booking Moved',
         format('%s moved booking %s from %s (%s) to %s.',
                coalesce(nullif(v_booking.full_name, 'N/A'), 'A joiner'), v_booking.booking_number,
                v_old.title, to_char(v_old.start_date, 'Mon DD'), to_char(v_new.start_date, 'Mon DD, YYYY')),
         'booking',
         null
  from public.profiles a
  where a.role = 'admin';

  return v_booking;
end;
$$;

revoke all on function public.reschedule_booking from public, anon;
grant execute on function public.reschedule_booking to authenticated;

-- ═════════════════════════════════════════════
-- 8. Booking activity log
-- ═════════════════════════════════════════════
-- Every booking change is recorded with who made it, what changed and when.

create or replace function public.log_booking_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_name    text;
  v_changes jsonb := '{}'::jsonb;
  v_action  text;
  k         text;
  v_old     jsonb;
  v_new     jsonb := to_jsonb(new);
begin
  if v_actor is not null then
    select coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), username)
           || case when role = 'admin' then ' (admin)' else '' end
      into v_name
    from public.profiles where id = v_actor;
  end if;
  v_name := coalesce(v_name, 'System');

  if tg_op = 'INSERT' then
    insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes)
    values (new.id, v_actor, v_name, 'Booked', jsonb_build_object(
      'slots', new.slots_booked, 'total_price', new.total_price, 'payment_method', new.payment_method));
    return null;
  end if;

  v_old := to_jsonb(old);
  for k in select jsonb_object_keys(v_new) loop
    if k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k) then
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
    end if;
  end loop;

  if v_changes = '{}'::jsonb then
    return null;
  end if;

  v_action := case
    when v_changes ? 'payment_status' and new.payment_status = 'Complete' then 'Payment confirmed'
    when v_changes ? 'payment_status' and new.payment_status = 'Rejected' then 'Payment rejected'
    when v_changes ? 'booking_status' and new.booking_status = 'Cancelled' then 'Cancelled'
    when v_changes ? 'tour_id' then 'Moved to another date'
    when v_changes ? 'balance_settled' and new.balance_settled then 'Balance settled'
    when v_changes ? 'receipt_url' or v_changes ? 'gcash_reference_no' then 'Payment submitted'
    when (v_changes - 'reminder_sent_at') = '{}'::jsonb then 'Reminder email sent'
    else 'Edited'
  end;

  insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes)
  values (new.id, v_actor, v_name, v_action, v_changes);
  return null;
end;
$$;

drop trigger if exists log_booking_activity on public.bookings;
create trigger log_booking_activity
  after insert or update on public.bookings
  for each row execute function public.log_booking_activity();

-- ═════════════════════════════════════════════
-- 9. Data cleanup (runs once)
-- ═════════════════════════════════════════════

create temporary table if not exists migration_summary (step text, rows_changed integer);
truncate migration_summary;

do $$
declare
  n integer;
begin
  -- Bookings saved with "N/A" (or blank) name, phone or email: fill from the joiner's profile/login.
  update public.bookings b
  set full_name = coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), b.full_name),
      contact_number = coalesce(nullif(trim(p.phone_number), ''), b.contact_number),
      email = coalesce(nullif(trim(p.email), ''), u.email, b.email)
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = b.user_id
    and (coalesce(nullif(trim(b.full_name), ''), 'N/A') = 'N/A'
         or coalesce(nullif(trim(b.contact_number), ''), 'N/A') = 'N/A'
         or coalesce(nullif(trim(b.email), ''), 'N/A') = 'N/A');
  get diagnostics n = row_count;
  insert into migration_summary values ('Bookings with N/A details filled in from profiles', n);

  -- Open bookings with no payment submitted at all: cancel them and free the slots.
  update public.bookings
  set booking_status = 'Cancelled',
      cancellation_reason = 'Automatically cancelled: no payment was submitted.'
  where booking_status not in ('Cancelled', 'Rejected', 'Completed')
    and payment_status is distinct from 'Complete'
    and receipt_url is null
    and gcash_reference_no is null;
  get diagnostics n = row_count;
  insert into migration_summary values ('Unpaid bookings cancelled (slots released)', n);
end;
$$;

-- Shown in the SQL Editor's results.
select * from migration_summary;
