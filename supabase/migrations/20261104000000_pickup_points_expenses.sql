-- ─────────────────────────────────────────────
-- Pickup point choice and tour expenses
--
-- 1. bookings.pickup_point: the pickup point the joiner picks when booking
--    (one of the tour's pickup stops, tour_meetups). Joiners may set or change
--    it on their own booking; it must be one of that tour's stops.
--    tour_pickup_points() lists a tour's stops for the booking window (anyone).
-- 2. tour_expenses: what a tour date costs the agency: Van Rent (at least
--    ₱15,000), Tour Guide (at least ₱1,300), Bag Tag (₱260) and any other
--    expenses (e.g. entrance fees, jeep). Admins edit them; joiners booked on
--    that tour can read them (shown on their booking and receipt).
--
-- Run after 20261103000000_cancel_chat_rates.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Pickup point ───────────────────────────
alter table public.bookings add column if not exists pickup_point text;

-- Joiners may also change pickup_point (otherwise the same rules as before).
create or replace function public.bookings_guard_joiner_update()
returns trigger
language plpgsql
as $$
declare
  joiner_editable constant text[] := array[
    'gcash_number', 'gcash_reference_no', 'receipt_url', 'payment_method',
    'amount_paid', 'payment_status', 'cancellation_reason', 'cancellation_requested_at', 'updated_at',
    'pickup_point'
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
    if new.booking_status = 'Cancelled' and old.booking_status is distinct from 'Cancelled' then
      raise exception 'Cancellations are approved by Bandang IBAYO. Please send a cancellation request instead.';
    end if;
    raise exception 'You can only update payment details or ask to cancel this booking.';
  end if;

  if new.payment_status is distinct from old.payment_status and new.payment_status <> 'Pending' then
    raise exception 'Payment status can only be changed by an admin.';
  end if;

  if old.booking_status in ('Cancelled', 'Rejected') and new is distinct from old then
    raise exception 'This booking is closed.';
  end if;

  if new.cancellation_requested_at is distinct from old.cancellation_requested_at then
    if old.cancellation_requested_at is not null or new.cancellation_requested_at is null then
      raise exception 'A cancellation request was already sent for this booking.';
    end if;
    select start_date into v_start_date from public.tours where id = old.tour_id;
    if v_start_date - (now() at time zone 'Asia/Manila')::date < public.cancellation_cutoff_days() then
      raise exception 'Cancellations are not accepted within % days of the tour date.', public.cancellation_cutoff_days();
    end if;
    if length(btrim(coalesce(new.cancellation_reason, ''))) < 5 then
      raise exception 'Please give a short reason for cancelling.';
    end if;
    new.cancellation_requested_at := now(); -- the server's clock, not the browser's
  end if;

  if new.pickup_point is distinct from old.pickup_point then
    select start_date into v_start_date from public.tours where id = old.tour_id;
    if v_start_date <= (now() at time zone 'Asia/Manila')::date then
      raise exception 'The pickup point can''t be changed on or after the tour date. Please message us instead.';
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

-- The pickup point must be one of the tour's stops (stored with its exact name).
-- A booking moved to another date keeps it only if that date has the same stop.
create or replace function public.bookings_check_pickup_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.pickup_point is null or btrim(new.pickup_point) = '' then
    new.pickup_point := null;
    return new;
  end if;
  select m.location_name into v_name
    from public.tour_meetups m
   where m.tour_id = new.tour_id and lower(btrim(m.location_name)) = lower(btrim(new.pickup_point))
   limit 1;
  if v_name is null then
    if tg_op = 'UPDATE' and new.tour_id is distinct from old.tour_id then
      new.pickup_point := null;
      return new;
    end if;
    raise exception 'Please choose one of this tour''s pickup points.';
  end if;
  new.pickup_point := v_name;
  return new;
end;
$$;

drop trigger if exists bookings_check_pickup_point on public.bookings;
create trigger bookings_check_pickup_point
  before insert or update of pickup_point, tour_id on public.bookings
  for each row execute function public.bookings_check_pickup_point();

-- A tour's pickup stops, in order, for the booking window (works logged out too).
create or replace function public.tour_pickup_points(p_tour_id public.tours.id%type)
returns table (location_name text, scheduled_time text)
language sql
stable
security definer
set search_path = public
as $$
  select m.location_name, m.scheduled_time::text
    from public.tour_meetups m
   where m.tour_id = p_tour_id and coalesce(btrim(m.location_name), '') <> ''
   order by m.created_at, m.id
$$;

revoke all on function public.tour_pickup_points from public;
grant execute on function public.tour_pickup_points to anon, authenticated;

-- ── 2. Tour expenses ──────────────────────────
do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.tour_expenses (
      tour_id %s primary key references public.tours(id) on delete cascade,
      van_rent numeric(12,2) not null check (van_rent >= 15000),
      tour_guide numeric(12,2) not null check (tour_guide >= 1300),
      bag_tag numeric(12,2) not null default 260 check (bag_tag = 260),
      others jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    )$f$, tour_id_type);
end;
$$;

alter table public.tour_expenses enable row level security;
grant select, insert, update, delete on public.tour_expenses to authenticated;

drop policy if exists "tour_expenses_read" on public.tour_expenses;
create policy "tour_expenses_read" on public.tour_expenses
  for select to authenticated using (public.is_admin() or public.has_active_booking_on_tour(tour_id));

drop policy if exists "tour_expenses_admin_write" on public.tour_expenses;
create policy "tour_expenses_admin_write" on public.tour_expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Other expenses: a list of { "name": text, "amount": number ≥ 0 }.
create or replace function public.tour_expenses_check()
returns trigger
language plpgsql
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(new.others) <> 'array' then
    raise exception 'Other expenses must be a list.';
  end if;
  for v_item in select * from jsonb_array_elements(new.others) loop
    if coalesce(btrim(v_item ->> 'name'), '') = '' or (v_item ->> 'amount') is null
       or (v_item ->> 'amount')::numeric < 0 then
      raise exception 'Each other expense needs a name and an amount of ₱0 or more.';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tour_expenses_check on public.tour_expenses;
create trigger tour_expenses_check
  before insert or update on public.tour_expenses
  for each row execute function public.tour_expenses_check();
