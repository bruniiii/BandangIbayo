-- Server-side booking creation.
--
-- Replaces the browser-side "count slots, then insert" flow, which let two
-- joiners book the last slots at the same time and overbook a tour.
-- Every joiner booking now goes through public.create_booking(), which:
--   * locks the tour row so concurrent bookings for the same tour run one at a time
--   * checks the tour is open, has enough slots, and the joiner has no active booking on it
--   * computes total_price from tours.price (the browser can no longer set its own price)
--   * generates a unique booking number from a sequence
--   * records amount_paid when the receipt is submitted with the booking (calendar flow)

create sequence if not exists public.booking_number_seq start 1001;

create or replace function public.create_booking(
  p_tour_id        public.tours.id%type,
  p_slots          integer,
  p_payment_method text default null,
  p_receipt_url    text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_tour      public.tours%rowtype;
  v_capacity  integer;
  v_booked    integer;
  v_available integer;
  v_profile   public.profiles%rowtype;
  v_email     text;
  v_name      text;
  v_booking   public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Please log in to book a tour.';
  end if;

  if p_slots is null or p_slots < 1 or p_slots > 10 then
    raise exception 'You can book between 1 and 10 slots at a time.';
  end if;

  if p_payment_method is not null and p_payment_method not in ('Full Payment', 'Downpayment') then
    raise exception 'Invalid payment method.';
  end if;

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
    raise exception 'Sorry, this tour just became fully booked.';
  end if;

  if p_slots > v_available then
    raise exception 'Only % slot(s) remaining. Please reduce the number of persons.', v_available;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  select email into v_email from auth.users where id = v_user_id;

  v_name := nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), '');

  insert into public.bookings (
    tour_id, user_id, booking_number, full_name, email, contact_number,
    slots_booked, total_price, amount_paid, payment_method, receipt_url,
    payment_status, booking_status
  ) values (
    p_tour_id,
    v_user_id,
    'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
    coalesce(v_name, 'N/A'),
    coalesce(v_email, 'N/A'),
    coalesce(nullif(trim(v_profile.phone_number), ''), 'N/A'),
    p_slots,
    coalesce(v_tour.price, 0) * p_slots,
    -- Amount the joiner says they sent (pending admin verification); same 40% rule as the booking screens.
    case p_payment_method
      when 'Full Payment' then coalesce(v_tour.price, 0) * p_slots
      when 'Downpayment'  then round(coalesce(v_tour.price, 0) * p_slots * 0.4)
    end,
    p_payment_method,
    p_receipt_url,
    'Pending',
    'Active'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.create_booking from public, anon;
grant execute on function public.create_booking to authenticated;
