-- ─────────────────────────────────────────────
-- Tour sales are paid in full
--
-- While a tour date is on sale (tours.sale_starts..sale_ends), joiners must
-- pay in full: checkout and the requester's held slots refuse a downpayment.
--
-- Run after 20261109000000_tour_sales.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.start_online_booking(
  p_user_id      uuid,
  p_tour_id      public.tours.id%type,
  p_slots        integer,
  p_payment_type text,
  p_companions   jsonb default '[]'::jsonb
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour       public.tours%rowtype;
  v_booked     integer;
  v_available  integer;
  v_profile    public.profiles%rowtype;
  v_email      text;
  v_name       text;
  v_companions jsonb := '[]'::jsonb;
  v_person     jsonb;
  v_booking    public.bookings%rowtype;
begin
  if p_user_id is null then
    raise exception 'Please log in to book a tour.';
  end if;
  if p_slots is null or p_slots < 1 or p_slots > 10 then
    raise exception 'You can book between 1 and 10 slots at a time.';
  end if;
  if p_payment_type not in ('full', 'down') then
    raise exception 'Please choose full payment or downpayment.';
  end if;

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

  select * into v_tour from public.tours where id = p_tour_id for update;
  if not found or coalesce(v_tour.is_archived, false) then
    raise exception 'This tour is no longer available.';
  end if;
  if v_tour.start_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'This tour has already started.';
  end if;
  -- A date on sale is paid in full: no downpayment.
  if p_payment_type = 'down' and public.tour_effective_price(v_tour) < coalesce(v_tour.price, 0) then
    raise exception 'This date is on sale, so it must be paid in full.';
  end if;

  -- Activity log: what happens from here is the joiner's doing, not "System".
  perform set_config('app.actor_id', p_user_id::text, true);

  -- Starting over replaces this joiner's own unfinished checkout for the tour.
  update public.bookings
  set booking_status = 'Cancelled', payment_status = 'Expired',
      cancellation_reason = 'Replaced by a new checkout.'
  where tour_id = p_tour_id and user_id = p_user_id
    and payment_status = 'Awaiting Payment' and booking_status not in ('Cancelled', 'Rejected');

  if exists (
    select 1 from public.bookings
    where tour_id = p_tour_id and user_id = p_user_id
      and booking_status not in ('Cancelled', 'Rejected')
  ) then
    raise exception 'You already have an active booking for this tour. Please check My Bookings.';
  end if;

  select coalesce(sum(slots_booked), 0) into v_booked
  from public.bookings
  where tour_id = p_tour_id and booking_status not in ('Cancelled', 'Rejected');
  v_available := coalesce(v_tour.group_size, 15) - v_booked;

  if v_available <= 0 then
    raise exception 'Sorry, this tour is now fully booked.';
  end if;
  if p_slots > v_available then
    raise exception 'Only % slot(s) remaining. Please reduce the number of persons.', v_available;
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  select email into v_email from auth.users where id = p_user_id;
  v_name := nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), '');

  insert into public.bookings (
    tour_id, user_id, booking_number, full_name, email, contact_number,
    slots_booked, total_price, amount_paid, payment_method, companions,
    payment_status, booking_status, hold_expires_at, sale_discount
  ) values (
    p_tour_id, p_user_id,
    'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
    coalesce(v_name, 'N/A'), coalesce(v_email, 'N/A'), coalesce(nullif(trim(v_profile.phone_number), ''), 'N/A'),
    p_slots, public.tour_effective_price(v_tour) * p_slots, 0,
    case p_payment_type when 'full' then 'Full Payment' else 'Downpayment' end,
    v_companions,
    'Awaiting Payment', 'Active', now() + interval '30 minutes',
    (coalesce(v_tour.price, 0) - public.tour_effective_price(v_tour)) * p_slots
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.start_online_booking from public, anon, authenticated;
grant execute on function public.start_online_booking to service_role;

create or replace function public.prepare_held_booking(
  p_booking_id   public.bookings.id%type,
  p_user_id      uuid,
  p_payment_type text,
  p_companions   jsonb default '[]'::jsonb
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b            public.bookings%rowtype;
  t            public.tours%rowtype;
  v_companions jsonb := '[]'::jsonb;
  v_person     jsonb;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.user_id is distinct from p_user_id then
    raise exception 'Booking not found.';
  end if;
  if b.request_id is null or b.payment_status is distinct from 'Awaiting Payment'
     or b.booking_status in ('Cancelled', 'Rejected') then
    raise exception 'This booking is not waiting for payment.';
  end if;
  if b.hold_expires_at is not null and b.hold_expires_at < now() then
    raise exception 'Your held slots have expired. Please book again on Explore Tours.';
  end if;
  if p_payment_type not in ('full', 'down') then
    raise exception 'Please choose full payment or downpayment.';
  end if;

  if jsonb_typeof(coalesce(p_companions, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_companions, '[]'::jsonb)) <> b.slots_booked - 1 then
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

  select * into t from public.tours where id = b.tour_id;
  if p_payment_type = 'down' and public.tour_effective_price(t) < coalesce(t.price, 0) then
    raise exception 'This date is on sale, so it must be paid in full.';
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_id', p_user_id::text, true);
  update public.bookings
     set payment_method = case p_payment_type when 'full' then 'Full Payment' else 'Downpayment' end,
         companions = v_companions,
         total_price = public.tour_effective_price(t) * b.slots_booked,
         sale_discount = (coalesce(t.price, 0) - public.tour_effective_price(t)) * b.slots_booked
   where id = p_booking_id
   returning * into b;
  perform set_config('app.trusted_booking_write', 'off', true);
  return b;
end;
$$;

revoke all on function public.prepare_held_booking from public, anon, authenticated;
grant execute on function public.prepare_held_booking to service_role;
