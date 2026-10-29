-- ─────────────────────────────────────────────
-- Request a Tour: the names and numbers of everyone in the group
--
-- Tour requests now list each person's name and contact number, like
-- exclusive tours (exclusive_requests.participants).
-- 1. update_my_request(): a joiner's edit saves the list for both kinds of request.
-- 2. hold_requested_slots(): the requester's held booking starts with the
--    people they listed, so the names are already filled in when they pay.
--
-- Run after 20261113000000_big_update.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Joiner edits ───────────────────────────
create or replace function public.update_my_request(
  p_request_id public.exclusive_requests.id%type,
  p_fields     jsonb
)
returns public.exclusive_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.exclusive_requests%rowtype;
  v_from date := nullif(p_fields ->> 'preferred_date', '')::date;
  v_to   date := nullif(p_fields ->> 'preferred_end_date', '')::date;
begin
  select * into r from public.exclusive_requests where id = p_request_id for update;
  if not found or r.user_id is distinct from auth.uid() then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'Pending' or r.package_sent_at is not null then
    raise exception 'This request was already reviewed, so it can''t be changed. Please message us instead.';
  end if;
  if length(btrim(coalesce(p_fields ->> 'destination', ''))) < 2 then
    raise exception 'Please enter the destination.';
  end if;
  if v_from is null or v_from < (now() at time zone 'Asia/Manila')::date + 21 then
    raise exception 'Trips can be booked from 3 weeks ahead. Please pick a later date.';
  end if;
  if v_to is null or v_to < v_from then
    raise exception 'Please choose your trip dates.';
  end if;

  -- Lets the request guard (below) accept this joiner edit.
  perform set_config('app.joiner_request_edit', 'on', true);
  update public.exclusive_requests
     set full_name = left(btrim(coalesce(p_fields ->> 'full_name', full_name)), 120),
         contact_number = left(btrim(coalesce(p_fields ->> 'contact_number', contact_number)), 40),
         email = left(btrim(coalesce(p_fields ->> 'email', email)), 200),
         destination = left(btrim(p_fields ->> 'destination'), 150),
         region = case when r.request_type = 'request' then nullif(left(btrim(coalesce(p_fields ->> 'region', '')), 150), '') else region end,
         group_size = greatest(1, least(100, coalesce(nullif(p_fields ->> 'group_size', '')::integer, group_size))),
         preferred_date = v_from,
         preferred_end_date = v_to,
         trip_days = v_to - v_from + 1,
         budget = case when r.request_type = 'exclusive' then nullif(p_fields ->> 'budget', '')::numeric else budget end,
         notes = left(coalesce(p_fields ->> 'notes', ''), 2000),
         participants = case when jsonb_typeof(p_fields -> 'participants') = 'array'
                             then p_fields -> 'participants' else participants end,
         updated_at = now()
   where id = r.id
   returning * into r;
  perform set_config('app.joiner_request_edit', 'off', true);

  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id, 'Request Updated',
         format('%s changed their %s for %s.', coalesce(nullif(r.full_name, ''), 'A joiner'),
                case when r.request_type = 'exclusive' then 'exclusive tour request' else 'tour request' end, r.destination),
         'exclusive_request', public.request_ref(r.id::text)
    from public.profiles a where a.role = 'admin';
  return r;
end;
$$;

revoke all on function public.update_my_request(public.exclusive_requests.id%type, jsonb) from public, anon;
grant execute on function public.update_my_request(public.exclusive_requests.id%type, jsonb) to authenticated;

-- ── 2. Held slots start with the listed people ──
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
  v_companions jsonb;
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

  -- The people the requester listed (besides themselves) fill in the
  -- companions, so they don't have to type them again when they pay.
  select coalesce(jsonb_agg(jsonb_build_object(
           'full_name', left(btrim(p ->> 'full_name'), 120),
           'contact_number', left(btrim(coalesce(p ->> 'contact_number', '')), 40)) order by n), '[]'::jsonb)
    into v_companions
    from jsonb_array_elements(coalesce(r.participants, '[]'::jsonb)) with ordinality as x(p, n)
   where n > 1 and n <= v_slots and nullif(btrim(p ->> 'full_name'), '') is not null;

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
    v_slots, coalesce(t.price, 0) * v_slots, 0, 'Full Payment', v_companions,
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
