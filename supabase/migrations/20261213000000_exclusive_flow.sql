-- ─────────────────────────────────────────────
-- Exclusive tours: new flow, and connected to the rest of the site
--
-- 1. Rules for requests (Exclusive and Request a Tour):
--    • one request every 2 weeks per joiner (both kinds together);
--    • an exclusive tour budget is ₱30,000 to ₱100,000.
-- 2. Approving an exclusive tour asks the joiner for the downpayment right
--    away: 50% of their budget, due within 24 hours
--    (exclusive_requests.downpayment_due_at). The tour package can only be
--    sent after it's paid. Not paid in time = the joiner didn't continue (the
--    admin sees these as "Unpaid"). Paid requests are never rejected
--    automatically for a late package.
-- 3. Once the package is sent (and paid), the exclusive tour gets a private
--    tour date (tours.is_exclusive) and a booking for the joiner, so it shows
--    in My Bookings and works with the group chat (joiner + admins), Tracking,
--    the Calendar, check-in and bad-weather postpone/cancel. Only admins and
--    the joiner who booked it can see that date.
--    Payments stay on the exclusive request; the booking follows them.
--
-- Run after 20261212000000_weather_moved_from.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists downpayment_due_at timestamptz;
alter table public.tours add column if not exists is_exclusive boolean not null default false;

-- tours.exclusive_request_id: the same type as exclusive_requests.id.
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.tours'::regclass and attname = 'exclusive_request_id' and not attisdropped) then
    execute format('alter table public.tours add column exclusive_request_id %s',
      (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
        where a.attrelid = 'public.exclusive_requests'::regclass and a.attname = 'id'));
  end if;
end;
$$;

-- ── 1 + 2. Request rules ──
create or replace function public.exclusive_requests_flow_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  -- One request every 2 weeks (Exclusive and Request a Tour together).
  if tg_op = 'INSERT' and new.user_id is not null and not public.is_admin() then
    v_last := (select max(r.created_at) from public.exclusive_requests r where r.user_id = new.user_id);
    if v_last is not null and v_last > now() - interval '14 days' then
      raise exception 'You can send one request every 2 weeks. You can send your next request on %.',
        to_char((v_last + interval '14 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY "at" FMHH12:MI AM');
    end if;
  end if;

  -- Exclusive tour budget: ₱30,000 to ₱100,000.
  if new.request_type = 'exclusive' and new.budget is not null
     and (tg_op = 'INSERT' or new.budget is distinct from old.budget) then
    if new.budget < 30000 then raise exception 'The budget for an exclusive tour must be at least ₱30,000.'; end if;
    if new.budget > 100000 then raise exception 'The budget for an exclusive tour can be up to ₱100,000.'; end if;
  end if;

  if tg_op = 'UPDATE' and new.request_type = 'exclusive' then
    -- Approved: the downpayment (50% of the budget) is due within 24 hours.
    if new.status = 'Approved' and old.status is distinct from 'Approved' and new.payment_status <> 'Paid' then
      new.downpayment_due_at := now() + interval '24 hours';
      if new.budget is not null then
        new.downpayment_amount := round(new.budget * 0.5, 2);
      end if;
    end if;
    -- The package waits for the downpayment.
    if new.package_sent_at is not null and old.package_sent_at is null
       and new.downpayment_due_at is not null and new.payment_status <> 'Paid' then
      raise exception 'Wait for the joiner''s downpayment before sending the tour package.';
    end if;
    -- The package price can't be less than what the joiner already paid.
    if new.package_sent_at is not null and new.payment_status = 'Paid'
       and coalesce((new.package_details ->> 'price')::numeric, 0) > 0
       and (new.package_details ->> 'price')::numeric < coalesce(new.amount_paid, 0) then
      raise exception 'The package price can''t be less than the ₱% the joiner already paid.', to_char(new.amount_paid, 'FM999,999,990.00');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_flow_rules on public.exclusive_requests;
create trigger exclusive_requests_flow_rules
  before insert or update on public.exclusive_requests
  for each row execute function public.exclusive_requests_flow_rules();

-- Paid requests are never rejected for a late package (the admin sends it).
create or replace function public.reject_overdue_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_count integer := 0;
begin
  perform set_config('app.joiner_request_edit', 'on', true);
  for v_r in
    update public.exclusive_requests r
       set status = 'Rejected',
           admin_response = case
             when r.preferred_date is not null and r.preferred_date < (now() at time zone 'Asia/Manila')::date + 14
               then 'The tour package wasn''t ready at least 2 weeks before the trip date.'
             else 'The tour package wasn''t ready within 1 month of the request.' end,
           reviewed_at = now(),
           updated_at = now()
     where r.status in ('Pending', 'Approved')
       and r.package_sent_at is null
       and coalesce(r.payment_status, 'Unpaid') <> 'Paid'
       and ((r.preferred_date is not null and r.preferred_date < (now() at time zone 'Asia/Manila')::date + 14)
            or r.created_at < now() - interval '30 days')
    returning r.id, r.user_id, r.destination, r.request_type, r.admin_response
  loop
    v_count := v_count + 1;
    if v_r.user_id is not null then
      insert into public.notifications (user_id, title, message, type, related_id)
      values (v_r.user_id,
              case when v_r.request_type = 'exclusive' then 'Exclusive Tour Update' else 'Tour Request Update' end,
              format('Your request for %s was not approved. %s You''re welcome to send a new request for a later date.', v_r.destination, v_r.admin_response),
              'exclusive_request', public.request_ref(v_r.id::text));
    end if;
  end loop;
  perform set_config('app.joiner_request_edit', 'off', true);
  return v_count;
end;
$$;
revoke all on function public.reject_overdue_requests() from public, anon, authenticated;

-- ── 3. Private exclusive tour dates ──
-- Only admins and the joiner who booked it can see an exclusive tour date.
create or replace function public.booked_this_tour(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings b where b.tour_id = p_tour_id and b.user_id = auth.uid());
$$;
revoke all on function public.booked_this_tour(public.tours.id%type) from public;
grant execute on function public.booked_this_tour(public.tours.id%type) to anon, authenticated;

drop policy if exists "tours_hide_exclusive" on public.tours;
create policy "tours_hide_exclusive" on public.tours as restrictive
  for select
  using (not coalesce(is_exclusive, false) or public.is_admin() or public.booked_this_tour(id));

-- The joiner's booking for their exclusive tour (made or updated when the
-- package is sent). Payments stay on the request; the booking follows them.
create or replace function public.exclusive_make_booking(
  p_request_id public.exclusive_requests.id%type, p_tour_id public.tours.id%type)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.exclusive_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_name text;
  v_email text;
  v_phone text;
  v_slots integer;
  v_companions jsonb;
  v_price numeric;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.'; end if;
  r := (select x from public.exclusive_requests x where x.id = p_request_id);
  if r.id is null or r.request_type <> 'exclusive' then raise exception 'Exclusive request not found.'; end if;
  if r.payment_status <> 'Paid' then raise exception 'The joiner hasn''t paid the downpayment yet.'; end if;
  if not exists (select 1 from public.tours t where t.id = p_tour_id and t.is_exclusive) then
    raise exception 'That isn''t this exclusive tour''s date.';
  end if;
  update public.tours set exclusive_request_id = p_request_id where id = p_tour_id;

  v_price := coalesce((r.package_details ->> 'price')::numeric, 0);
  v_slots := greatest(coalesce(r.group_size, 1), 1);
  v_name := (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') from public.profiles p where p.id = r.user_id);
  v_phone := (select nullif(btrim(p.phone_number), '') from public.profiles p where p.id = r.user_id);
  v_email := (select u.email::text from auth.users u where u.id = r.user_id);
  v_companions := (select coalesce(jsonb_agg(jsonb_build_object(
                      'full_name', left(btrim(p ->> 'full_name'), 120),
                      'contact_number', left(btrim(coalesce(p ->> 'contact_number', '')), 40)) order by n), '[]'::jsonb)
                     from jsonb_array_elements(coalesce(r.participants, '[]'::jsonb)) with ordinality as x(p, n)
                    where n > 1 and nullif(btrim(p ->> 'full_name'), '') is not null);

  perform set_config('app.trusted_booking_write', 'on', true);
  v_booking := (select b from public.bookings b where b.request_id = p_request_id order by b.created_at desc limit 1);
  if v_booking.id is null then
    insert into public.bookings (
      tour_id, user_id, request_id, booking_number, full_name, email, contact_number,
      slots_booked, total_price, amount_paid, payment_method, companions,
      payment_status, booking_status, accommodation, balance_settled
    ) values (
      p_tour_id, r.user_id, p_request_id,
      'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
      coalesce(v_name, nullif(btrim(r.full_name), ''), 'N/A'),
      coalesce(v_email, nullif(btrim(r.email), ''), 'N/A'),
      coalesce(v_phone, nullif(btrim(r.contact_number), ''), 'N/A'),
      v_slots, v_price, coalesce(r.amount_paid, 0), 'Downpayment', v_companions,
      'Complete', 'Completed', r.accommodation, coalesce(r.balance_settled, false)
    ) returning * into v_booking;
  else
    update public.bookings
       set tour_id = p_tour_id, total_price = v_price, amount_paid = coalesce(r.amount_paid, 0),
           slots_booked = v_slots, accommodation = r.accommodation, balance_settled = coalesce(r.balance_settled, false)
     where id = v_booking.id
    returning * into v_booking;
  end if;
  perform set_config('app.trusted_booking_write', 'off', true);
  return v_booking;
end;
$$;
revoke all on function public.exclusive_make_booking(public.exclusive_requests.id%type, public.tours.id%type) from public, anon;
grant execute on function public.exclusive_make_booking(public.exclusive_requests.id%type, public.tours.id%type) to authenticated;

-- Payments on the request (balance paid online or recorded by an admin, the
-- accommodation chosen) carry over to its booking.
create or replace function public.exclusive_requests_sync_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_type <> 'exclusive' then return new; end if;
  if new.amount_paid is distinct from old.amount_paid or new.balance_settled is distinct from old.balance_settled
     or new.accommodation is distinct from old.accommodation then
    perform set_config('app.trusted_booking_write', 'on', true);
    update public.bookings b
       set amount_paid = coalesce(new.amount_paid, b.amount_paid),
           balance_settled = coalesce(new.balance_settled, false),
           accommodation = coalesce(new.accommodation, b.accommodation)
     where b.request_id = new.id
       and exists (select 1 from public.tours t where t.id = b.tour_id and t.is_exclusive);
    perform set_config('app.trusted_booking_write', 'off', true);
  end if;
  return new;
end;
$$;
drop trigger if exists exclusive_requests_sync_booking on public.exclusive_requests;
create trigger exclusive_requests_sync_booking
  after update on public.exclusive_requests
  for each row execute function public.exclusive_requests_sync_booking();

-- A postponed exclusive tour: its package shows the new dates too.
create or replace function public.tours_sync_exclusive_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_exclusive and new.exclusive_request_id is not null
     and (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date) then
    perform set_config('app.joiner_request_edit', 'on', true);
    update public.exclusive_requests
       set package_details = coalesce(package_details, '{}'::jsonb)
             || jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date)
     where id = new.exclusive_request_id;
    perform set_config('app.joiner_request_edit', 'off', true);
  end if;
  return new;
end;
$$;
drop trigger if exists tours_sync_exclusive_dates on public.tours;
create trigger tours_sync_exclusive_dates
  after update of start_date, end_date on public.tours
  for each row execute function public.tours_sync_exclusive_dates();
