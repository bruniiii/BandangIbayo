-- ─────────────────────────────────────────────
-- Requested tours: the requester's slots are held for 2 days
--
-- When an admin posts a joiner's requested tour (Exclusive Requests → Tour
-- Package), the requester gets first priority: hold_requested_slots() books
-- their group's slots right away as "Awaiting Payment", held for 2 days.
-- They pay from My Bookings (full or 40% downpayment, like any booking).
-- If they don't pay in time, the usual expire-payment-holds job releases the
-- slots, and they're told.
--
-- bookings.request_id links such a booking to its request.
--
-- Run after 20261107000000_feed_approval_checkin.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  req_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                       where attrelid = 'public.exclusive_requests'::regclass and attname = 'id');
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.bookings'::regclass and attname = 'request_id' and not attisdropped) then
    execute format('alter table public.bookings add column request_id %s references public.exclusive_requests(id) on delete set null', req_id_type);
  end if;
end;
$$;

-- How long the requester's slots are held.
create or replace function public.requested_tour_hold_hours()
returns integer language sql immutable as $$ select 48 $$;

-- Admins: hold the requester's slots on the tour posted for their request.
create or replace function public.hold_requested_slots(
  p_request_id public.exclusive_requests.id%type,
  p_tour_id    public.tours.id%type
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.exclusive_requests%rowtype;
  t         public.tours%rowtype;
  v_profile public.profiles%rowtype;
  v_email   text;
  v_name    text;
  v_slots   integer;
  v_booked  integer;
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can hold slots for a request.';
  end if;

  select * into r from public.exclusive_requests where id = p_request_id;
  if not found or r.request_type is distinct from 'request' or r.status is distinct from 'Approved' then
    raise exception 'Only an approved tour request can get held slots.';
  end if;
  if r.user_id is null then
    raise exception 'This request has no account to hold slots for.';
  end if;

  -- Already held (or booked) for this request: keep it.
  select * into v_booking from public.bookings
   where request_id = p_request_id and booking_status not in ('Cancelled', 'Rejected')
   limit 1;
  if found then
    return v_booking;
  end if;
  -- The requester already booked this tour themselves.
  select * into v_booking from public.bookings
   where tour_id = p_tour_id and user_id = r.user_id and booking_status not in ('Cancelled', 'Rejected')
   limit 1;
  if found then
    return v_booking;
  end if;

  select * into t from public.tours where id = p_tour_id for update;
  if not found then
    raise exception 'Tour not found.';
  end if;

  select coalesce(sum(slots_booked), 0) into v_booked
    from public.bookings where tour_id = p_tour_id and booking_status not in ('Cancelled', 'Rejected');
  v_slots := least(greatest(coalesce(r.group_size, 1), 1), coalesce(t.group_size, 15) - v_booked);
  if v_slots < 1 then
    raise exception 'This tour has no free slots left to hold.';
  end if;

  select * into v_profile from public.profiles where id = r.user_id;
  select email into v_email from auth.users where id = r.user_id;
  v_name := nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), '');

  perform set_config('app.trusted_booking_write', 'on', true);
  insert into public.bookings (
    tour_id, user_id, request_id, booking_number, full_name, email, contact_number,
    slots_booked, total_price, amount_paid, payment_method, companions,
    payment_status, booking_status, hold_expires_at
  ) values (
    p_tour_id, r.user_id, p_request_id,
    'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
    coalesce(v_name, nullif(trim(r.full_name), ''), 'N/A'),
    coalesce(v_email, nullif(trim(r.email), ''), 'N/A'),
    coalesce(nullif(trim(v_profile.phone_number), ''), nullif(trim(r.contact_number), ''), 'N/A'),
    v_slots, coalesce(t.price, 0) * v_slots, 0, 'Full Payment', '[]'::jsonb,
    'Awaiting Payment', 'Active', now() + make_interval(hours => public.requested_tour_hold_hours())
  )
  returning * into v_booking;
  perform set_config('app.trusted_booking_write', 'off', true);

  insert into public.notifications (user_id, title, message, type)
  values (r.user_id, 'Your requested tour is posted! 🎉',
          format('%s is now open on Explore Tours, and we''re holding %s slot%s for you until %s. Pay in My Bookings to keep them, or they''ll be released to other joiners.',
                 t.title, v_slots, case when v_slots = 1 then '' else 's' end,
                 to_char(v_booking.hold_expires_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')),
          'booking');

  return v_booking;
end;
$$;

revoke all on function public.hold_requested_slots from public, anon;
grant execute on function public.hold_requested_slots to authenticated;

-- Payments function (service role): before paying a held booking, the joiner
-- picks full payment or downpayment and names the people joining them.
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

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_id', p_user_id::text, true);
  update public.bookings
     set payment_method = case p_payment_type when 'full' then 'Full Payment' else 'Downpayment' end,
         companions = v_companions,
         total_price = coalesce(t.price, 0) * b.slots_booked
   where id = p_booking_id
   returning * into b;
  perform set_config('app.trusted_booking_write', 'off', true);
  return b;
end;
$$;

revoke all on function public.prepare_held_booking from public, anon, authenticated;
grant execute on function public.prepare_held_booking to service_role;

-- Tell the requester when their held slots run out unpaid.
create or replace function public.bookings_notify_request_hold_released()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.request_id is not null and new.user_id is not null
     and new.payment_status = 'Expired' and old.payment_status = 'Awaiting Payment' then
    select title into v_title from public.tours where id = new.tour_id;
    insert into public.notifications (user_id, title, message, type)
    values (new.user_id, 'Your held slots were released',
            format('Your held slots for %s were released because the payment wasn''t completed in time. You can still book on Explore Tours while slots last.', coalesce(v_title, 'your requested tour')),
            'booking');
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_notify_request_hold_released on public.bookings;
create trigger bookings_notify_request_hold_released
  after update of payment_status on public.bookings
  for each row execute function public.bookings_notify_request_hold_released();
