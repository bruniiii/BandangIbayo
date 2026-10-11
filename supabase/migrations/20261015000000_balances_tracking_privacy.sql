-- Balance reminders, tracking privacy, and account deletion (Data Privacy Act).
--
-- Requires 20261010000000 … 20261014000000.

-- ═════════════════════════════════════════════
-- 1. Balance reminders
-- ═════════════════════════════════════════════
-- The send-email function's daily reminder run also reminds joiners who paid
-- a downpayment that their balance is due, 2–3 days before the tour, once.

alter table public.bookings add column if not exists balance_reminder_sent_at timestamptz;

-- ═════════════════════════════════════════════
-- 2. Tracking privacy
-- ═════════════════════════════════════════════
-- Pickup points, live tracking updates and the van/driver were readable by
-- every logged-in user for every tour. Now: admins, and joiners with an
-- active booking on that tour.

create or replace function public.has_active_booking_on_tour(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings
    where tour_id = p_tour_id
      and user_id = auth.uid()
      and booking_status not in ('Cancelled', 'Rejected')
  );
$$;

revoke all on function public.has_active_booking_on_tour from public;
grant execute on function public.has_active_booking_on_tour to authenticated;

drop policy if exists "tracking read (authenticated)" on public.tour_meetups;
drop policy if exists "tracking read (authenticated)" on public.tour_tracking_logs;
drop policy if exists "tracking read (authenticated)" on public.tour_vehicles;

drop policy if exists "tracking_read_own_tour_or_admin" on public.tour_meetups;
create policy "tracking_read_own_tour_or_admin" on public.tour_meetups
  for select to authenticated
  using (public.is_admin() or public.has_active_booking_on_tour(tour_id));

drop policy if exists "tracking_read_own_tour_or_admin" on public.tour_tracking_logs;
create policy "tracking_read_own_tour_or_admin" on public.tour_tracking_logs
  for select to authenticated
  using (public.is_admin() or public.has_active_booking_on_tour(tour_id));

drop policy if exists "tracking_read_own_tour_or_admin" on public.tour_vehicles;
create policy "tracking_read_own_tour_or_admin" on public.tour_vehicles
  for select to authenticated
  using (public.is_admin() or public.has_active_booking_on_tour(tour_id));

-- ═════════════════════════════════════════════
-- 3. Account deletion
-- ═════════════════════════════════════════════
-- A joiner can delete their account (Profile Settings). The send-email
-- function (service role) calls purge_user_data(), deletes their files, then
-- deletes the login. Booking records are kept for the agency's accounts but
-- stripped of personal details and unlinked from the user.

-- Bookings must be able to outlive the account: user_id becomes nullable and
-- its foreign key (if any) sets null instead of blocking the delete.
alter table public.bookings alter column user_id drop not null;

do $$
declare
  c record;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.conrelid = 'public.bookings'::regclass
      and con.contype = 'f'
      and a.attname = 'user_id'
      and pg_get_constraintdef(con.oid) not ilike '%on delete set null%'
  loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
    execute format('alter table public.bookings add constraint %I %s on delete set null',
                   c.conname, regexp_replace(c.def, '\s+on delete (no action|restrict|cascade|set null|set default)', '', 'i'));
  end loop;
end;
$$;

-- Personal fields scrubbed from bookings and from their activity history.
create or replace function public.purge_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'Asia/Manila')::date;
  v_receipts  text[];
  v_bookings  bigint;
  personal    constant text[] := array[
    'full_name', 'email', 'contact_number', 'gcash_number', 'gcash_reference_no',
    'receipt_url', 'companions', 'cancellation_reason'
  ];
begin
  if p_user_id is null then
    raise exception 'Missing user.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'Admin accounts can''t be deleted here.';
  end if;

  if exists (
    select 1 from public.bookings b join public.tours t on t.id = b.tour_id
    where b.user_id = p_user_id
      and b.booking_status not in ('Cancelled', 'Rejected')
      and coalesce(t.end_date, t.start_date) >= v_today
  ) then
    raise exception 'You still have an upcoming booking. Cancel it first (or contact us), then delete your account.';
  end if;

  select array_agg(receipt_url) filter (where receipt_url is not null), count(*)
    into v_receipts, v_bookings
  from public.bookings where user_id = p_user_id;

  -- Activity history: drop personal values and the user's name.
  update public.booking_activity
  set changes = changes - personal
  where booking_id in (select id from public.bookings where user_id = p_user_id);
  update public.booking_activity
  set actor_id = null, actor_name = 'Deleted account'
  where actor_id = p_user_id;

  -- Keep the booking (amounts, dates) for the agency's records, without personal details.
  perform set_config('app.skip_activity_log', 'on', true);
  update public.bookings
  set full_name = 'Deleted account', email = 'N/A', contact_number = 'N/A',
      gcash_number = null, gcash_reference_no = null, receipt_url = null,
      companions = '[]'::jsonb, cancellation_reason = null, user_id = null
  where user_id = p_user_id;
  perform set_config('app.skip_activity_log', 'off', true);

  delete from public.tour_waitlist where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.feed_reactions where user_id = p_user_id;
  delete from public.feed_comments where user_id = p_user_id;
  delete from public.reviews where user_id = p_user_id;
  delete from public.exclusive_requests where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;

  return jsonb_build_object('receipts', coalesce(to_jsonb(v_receipts), '[]'::jsonb), 'bookings_kept', v_bookings);
end;
$$;

revoke all on function public.purge_user_data from public, anon, authenticated;
grant execute on function public.purge_user_data to service_role;

-- Activity log: skip while purge_user_data() scrubs a booking, and count
-- balance reminders as reminder emails.
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
  if coalesce(current_setting('app.skip_activity_log', true), '') = 'on' then
    return null;
  end if;

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
    when (v_changes - 'reminder_sent_at' - 'balance_reminder_sent_at') = '{}'::jsonb then 'Reminder email sent'
    else 'Edited'
  end;

  insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes)
  values (new.id, v_actor, v_name, v_action, v_changes);
  return null;
end;
$$;
