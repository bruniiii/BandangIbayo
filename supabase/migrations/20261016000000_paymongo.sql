-- Online payments through PayMongo (GCash, Maya, cards, GrabPay).
--
-- Flow: the joiner picks full payment or 40% downpayment → the "payments"
-- edge function calls start_online_booking(), which holds their slots for 30
-- minutes ("Awaiting Payment"), and opens a PayMongo checkout. When PayMongo
-- reports the payment (webhook, or the joiner coming back to the site), the
-- edge function re-checks it with PayMongo's API and calls
-- record_online_payment(), which confirms the booking. Unpaid holds expire:
-- the payments function first closes the PayMongo checkout so it can no longer
-- be paid, then releases the slots. The downpayment balance can later be paid
-- online the same way, or in person on the tour day (admin marks it paid).
--
-- Payments are non-refundable (Terms, section 2): there is no refund path.
-- A paid joiner can only cancel (up to 14 days before the tour).
--
-- Requires 20261010000000 … 20261015000000.

alter table public.bookings
  add column if not exists hold_expires_at timestamptz,
  add column if not exists paymongo_checkout_id text,
  add column if not exists paymongo_checkout_url text,
  add column if not exists paymongo_payment_id text,
  add column if not exists paymongo_balance_checkout_id text,
  add column if not exists paymongo_balance_checkout_url text,
  add column if not exists paymongo_balance_payment_id text,
  add column if not exists paid_online_at timestamptz;

create index if not exists bookings_awaiting_payment_idx
  on public.bookings (hold_expires_at) where payment_status = 'Awaiting Payment';

-- Online only: joiners can no longer create bookings with a receipt upload.
revoke execute on function public.create_booking from authenticated;

-- ═════════════════════════════════════════════
-- Releasing a hold (checkout expired, or the joiner backed out).
-- Called by the payments function only after it has closed the PayMongo
-- checkout, so a released hold can't be paid afterwards. Until then the hold
-- keeps its slots, even past its 30 minutes.
-- ═════════════════════════════════════════════
create or replace function public.release_payment_hold(
  p_booking_id public.bookings.id%type,
  p_reason     text,
  p_actor_name text default 'System (checkout expired)'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform set_config('app.actor_name', p_actor_name, true);
  update public.bookings
  set booking_status = 'Cancelled', payment_status = 'Expired', cancellation_reason = p_reason
  where id = p_booking_id
    and payment_status = 'Awaiting Payment'
    and booking_status not in ('Cancelled', 'Rejected');
  get diagnostics n = row_count;
  perform set_config('app.actor_name', '', true);
  return n > 0;
end;
$$;

revoke all on function public.release_payment_hold from public, anon, authenticated;
grant execute on function public.release_payment_hold to service_role;

-- Every 5 minutes, ask the payments function to close lapsed checkouts and
-- release their slots. Needs pg_cron and pg_net (the tour reminders use both).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'expire-payment-holds';
    if exists (select 1 from pg_extension where extname = 'pg_net') then
      perform cron.schedule(
        'expire-payment-holds',
        '*/5 * * * *',
        $job$select net.http_post(
          url := 'https://renugdlntgybazpikmbu.supabase.co/functions/v1/payments',
          body := '{"action":"expire-holds"}'::jsonb,
          headers := '{"Content-Type":"application/json"}'::jsonb
        )$job$
      );
    else
      raise notice 'pg_net is not enabled: enable it (Database → Extensions) and run this file again, so unpaid checkouts are released automatically.';
    end if;
  end if;
end;
$$;

-- ═════════════════════════════════════════════
-- Start an online booking: validate, lock, hold slots for 30 minutes.
-- Called by the payments edge function (service role) for the logged-in joiner.
-- ═════════════════════════════════════════════
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
    payment_status, booking_status, hold_expires_at
  ) values (
    p_tour_id, p_user_id,
    'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
    coalesce(v_name, 'N/A'), coalesce(v_email, 'N/A'), coalesce(nullif(trim(v_profile.phone_number), ''), 'N/A'),
    p_slots, coalesce(v_tour.price, 0) * p_slots, 0,
    case p_payment_type when 'full' then 'Full Payment' else 'Downpayment' end,
    v_companions,
    'Awaiting Payment', 'Active', now() + interval '30 minutes'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.start_online_booking from public, anon, authenticated;
grant execute on function public.start_online_booking to service_role;

-- ═════════════════════════════════════════════
-- Record a payment PayMongo has confirmed (re-checked through its API).
-- p_kind: 'booking' (full payment / downpayment) or 'balance'.
-- Safe to call more than once for the same payment.
-- ═════════════════════════════════════════════
create or replace function public.record_online_payment(
  p_booking_id public.bookings.id%type,
  p_kind       text,
  p_amount     numeric,
  p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b         public.bookings%rowtype;
  v_tour      public.tours%rowtype;
  v_expected  numeric;
  v_booked    integer;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform set_config('app.actor_name', 'PayMongo (online payment)', true);
  select * into v_tour from public.tours where id = v_b.tour_id;

  if p_kind = 'balance' then
    if v_b.paymongo_balance_payment_id = p_payment_id or v_b.balance_settled then
      return jsonb_build_object('status', 'already');
    end if;
    if p_amount < greatest(0, coalesce(v_b.total_price, 0) - coalesce(v_b.amount_paid, 0)) then
      return jsonb_build_object('status', 'amount_mismatch');
    end if;
    update public.bookings
    set balance_settled = true, balance_settled_at = now(),
        amount_paid = coalesce(amount_paid, 0) + p_amount,
        paymongo_balance_payment_id = p_payment_id
    where id = p_booking_id;
    insert into public.notifications (user_id, title, message, type, related_id)
    select a.id, 'Balance Paid Online',
           format('%s paid the remaining balance for %s (%s) online.', v_b.full_name, v_tour.title, v_b.booking_number),
           'payment', null
    from public.profiles a where a.role = 'admin';
    return jsonb_build_object('status', 'balance_settled');
  end if;

  -- Booking payment (full or downpayment)
  if v_b.paymongo_payment_id = p_payment_id or v_b.payment_status = 'Complete' then
    return jsonb_build_object('status', 'already');
  end if;

  v_expected := case v_b.payment_method
                  when 'Full Payment' then coalesce(v_b.total_price, 0)
                  else round(coalesce(v_b.total_price, 0) * 0.4, 2)
                end;
  if p_amount < v_expected then
    return jsonb_build_object('status', 'amount_mismatch');
  end if;

  -- Paid even though the hold had been released (only possible in the moment
  -- the checkout was being closed). Payments are non-refundable, so the booking
  -- is confirmed anyway; if that puts the tour over capacity, admins are told.
  if v_b.booking_status = 'Cancelled' then
    select coalesce(sum(slots_booked), 0) into v_booked
    from public.bookings
    where tour_id = v_b.tour_id and id <> v_b.id and booking_status not in ('Cancelled', 'Rejected');
    if coalesce(v_tour.group_size, 15) - v_booked < v_b.slots_booked then
      insert into public.notifications (user_id, title, message, type, related_id)
      select a.id, 'Tour Over Capacity',
             format('%s paid for %s (%s, %s pax) just as their checkout was closing, so their booking was confirmed. The tour is now %s over its group size of %s.',
                    v_b.full_name, v_tour.title, v_b.booking_number, v_b.slots_booked,
                    v_booked + v_b.slots_booked - coalesce(v_tour.group_size, 15), coalesce(v_tour.group_size, 15)),
             'booking', null
      from public.profiles a where a.role = 'admin';
    end if;
  end if;

  update public.bookings
  set payment_status = 'Complete', booking_status = 'Completed',
      amount_paid = p_amount, paymongo_payment_id = p_payment_id,
      paid_online_at = now(), hold_expires_at = null, cancellation_reason = null
  where id = p_booking_id;

  delete from public.tour_waitlist where tour_id = v_b.tour_id and user_id = v_b.user_id;

  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id, 'New Booking Paid Online',
         format('%s booked %s (%s pax) and paid %s online.', v_b.full_name, v_tour.title, v_b.slots_booked,
                case v_b.payment_method when 'Full Payment' then 'in full' else 'the downpayment' end),
         'booking', null
  from public.profiles a where a.role = 'admin';

  if v_b.user_id is not null then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_b.user_id, 'Booking Confirmed 🎉',
            format('Your payment for %s (%s) went through. Your booking is confirmed!', v_tour.title, v_b.booking_number),
            'payment', null);
  end if;

  return jsonb_build_object('status', 'confirmed');
end;
$$;

revoke all on function public.record_online_payment from public, anon, authenticated;
grant execute on function public.record_online_payment to service_role;

-- ═════════════════════════════════════════════
-- Activity log: credit the joiner / PayMongo / the expiry job, not "System".
-- (app.actor_id / app.actor_name are set by the functions above.)
-- ═════════════════════════════════════════════
create or replace function public.log_booking_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
  v_name    text := nullif(current_setting('app.actor_name', true), '');
  v_changes jsonb := '{}'::jsonb;
  v_action  text;
  k         text;
  v_old     jsonb;
  v_new     jsonb := to_jsonb(new);
begin
  if coalesce(current_setting('app.skip_activity_log', true), '') = 'on' then
    return null;
  end if;

  if v_name is null and v_actor is not null then
    select coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), username)
           || case when role = 'admin' then ' (admin)' else '' end
      into v_name
    from public.profiles where id = v_actor;
  end if;
  v_name := coalesce(v_name, 'System');

  if tg_op = 'INSERT' then
    insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes)
    values (new.id, v_actor, v_name,
            case when new.payment_status = 'Awaiting Payment' then 'Started online checkout' else 'Booked' end,
            jsonb_build_object('slots', new.slots_booked, 'total_price', new.total_price, 'payment_method', new.payment_method));
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
    when v_changes ? 'payment_status' and new.payment_status = 'Expired' then 'Checkout expired or cancelled'
    when v_changes ? 'booking_status' and new.booking_status = 'Cancelled' then 'Cancelled'
    when v_changes ? 'tour_id' then 'Moved to another date'
    when v_changes ? 'balance_settled' and new.balance_settled then 'Balance settled'
    when v_changes ? 'paymongo_checkout_id' or v_changes ? 'paymongo_balance_checkout_id' then 'Opened PayMongo checkout'
    when v_changes ? 'receipt_url' or v_changes ? 'gcash_reference_no' then 'Payment submitted'
    when (v_changes - 'reminder_sent_at' - 'balance_reminder_sent_at') = '{}'::jsonb then 'Reminder email sent'
    else 'Edited'
  end;

  insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes)
  values (new.id, v_actor, v_name, v_action, v_changes);
  return null;
end;
$$;
