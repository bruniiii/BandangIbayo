-- ═════════════════════════════════════════════
-- 2_symposium_data.sql — DEMO DATA FOR THE SYMPOSIUM (Wednesday, Nov 25, 2026)
--
-- Run AFTER 1_wipe.sql, in Supabase → SQL Editor, on the MORNING of the
-- symposium (a cancellation request waits only 12 hours for approval, and
-- the van's location is stamped with the time you run it).
--
-- ▶ BEFORE RUNNING: put the email of YOUR demo joiner account on the line
--   that says  v_demo_email text := '...';  (a little further down).
--   That account gets a full history: 3 finished trips (2 reviewed), the
--   trip on Nov 25 (Anawangin Cove: route, pickups, group chat; tracking starts on the day), an
--   upcoming trip with a balance to pay, favorites, a private tour request,
--   notifications and a message from Bandang IBAYO.
--
-- What it makes:
--   • 12 demo joiners (they can't log in; their emails end in
--     @ibayo-demo.test, which never receives mail)
--   • 13 tour dates: 6 finished (one cancelled by a typhoon, with refunds),
--     1 on Nov 25–26 (tracking ready to start on the day), 6 upcoming (one on sale,
--     one fully booked with a waitlist) + 1 private tour
--   • bookings in every state: paid, downpayment with balance due, balance
--     settled, waiting for payment, payment to check, cancellation request,
--     cancelled, rejected, expired, weather refunds (due and sent)
--   • sample suppliers, drivers, vans, destinations and pickup points (only
--     the ones not saved yet), used by every tour: each tour has a driver
--     and van, each expense line its supplier, and finished trips have
--     supplier ratings
--   • tour expenses (estimated and actual) for Reports, drivers & vans,
--     pickup points, reviews with replies, feed posts, group chats, private
--     tours and tour requests, notifications, system feedback
--
-- No emails are sent: every automatic email for these bookings is marked
-- as already sent, and the database's own triggers are switched off while
-- this runs (and switched back on at the end).
--
-- To remove the demo joiners later (after the symposium):
--   delete from auth.users where email like '%@ibayo-demo.test';
-- ═════════════════════════════════════════════

begin;

-- ── Helpers (temporary: they disappear when this query ends) ──

-- A demo joiner: a sign-in record (no password, can't log in) and a profile.
create or replace function pg_temp.sym_user(p_n int, p_first text, p_last text, p_phone text, p_city text, p_province text,
                                            p_barangay text, p_created date, p_birth date)
returns uuid language plpgsql as $$
declare
  v_id uuid := ('d5e00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  v_email text := lower(replace(p_first, ' ', '') || '.' || replace(p_last, ' ', '')) || '@ibayo-demo.test';
  v_terms int := (select max(version) from public.site_policies where slug = 'terms' and is_current);
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, '', p_created::timestamptz,
          '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', p_first, 'last_name', p_last),
          p_created::timestamptz, p_created::timestamptz, '', '', '', '')
  on conflict (id) do nothing;

  insert into public.profiles (id, created_at, role, email, username, first_name, last_name, phone_number, date_of_birth,
                               province, city_municipality, barangay, street, address,
                               emergency_contact_name, emergency_contact_number, terms_accepted, terms_accepted_at, terms_version)
  values (v_id, p_created::timestamptz, 'joiner', v_email, lower(replace(p_first, ' ', '') || '_' || replace(p_last, ' ', '')), p_first, p_last, p_phone, p_birth,
          p_province, p_city, p_barangay, (10 + p_n * 7) || ' Mabini St.', format('%s Mabini St., %s, %s, %s', 10 + p_n * 7, p_barangay, p_city, p_province),
          'Ma. Lourdes ' || p_last, '0917' || lpad((1000000 + p_n * 4321)::text, 7, '0'), true, p_created::timestamptz, coalesce(v_terms, 1))
  on conflict (id) do update set
    role = 'joiner', email = excluded.email, username = excluded.username, first_name = excluded.first_name, last_name = excluded.last_name,
    phone_number = excluded.phone_number, date_of_birth = excluded.date_of_birth, province = excluded.province,
    city_municipality = excluded.city_municipality, barangay = excluded.barangay, street = excluded.street, address = excluded.address,
    emergency_contact_name = excluded.emergency_contact_name, emergency_contact_number = excluded.emergency_contact_number,
    terms_accepted = true, terms_accepted_at = excluded.terms_accepted_at, terms_version = excluded.terms_version, created_at = excluded.created_at;
  return v_id;
end $$;

-- "3:00 AM" from "03:00" plus minutes.
create or replace function pg_temp.sym_time(p_dep text, p_plus int)
returns text language sql immutable as $$
  select to_char(date '2000-01-01' + p_dep::time + make_interval(mins => p_plus), 'FMHH12:MI AM')
$$;

-- Accommodation choices from Lists & FAQ → Accommodation (the website only
-- accepts those): 'camp' = the tent/camping ones, 'room' = the others.
create or replace function pg_temp.sym_accom(p_kind text)
returns text[] language sql stable as $$
  select coalesce(array_agg(label order by sort_order, label), '{}')
    from public.option_lists
   where list_key = 'accommodation' and is_active
     and (case when p_kind = 'camp' then label ~* '(tent|camp)' else label !~* '(tent|camp)' end)
$$;

-- A difficulty from Lists & FAQ → Difficulty: the same name if it's there,
-- else Easy = the first, Moderate = the middle one, Hard = the last.
create or replace function pg_temp.sym_diff(p text)
returns text language sql stable as $$
  with l as (select label, row_number() over (order by sort_order, label) n, count(*) over () c
               from public.option_lists where list_key = 'difficulty' and is_active)
  select coalesce((select label from l where lower(label) = lower(p)),
                  (select label from l where n = case p when 'Easy' then 1 when 'Moderate' then greatest(1, (c + 1) / 2) else c end),
                  p)
$$;

-- One tour date with its Regular Rate, old-style expenses row, driver & van
-- and the 3 usual Metro Manila pickup points.
create or replace function pg_temp.sym_tour(p_title text, p_dest text, p_start date, p_end date, p_price numeric, p_diff text,
                                            p_archived boolean, p_desc text, p_incl text, p_excl text, p_bring text, p_itin text,
                                            p_dep text, p_imgs text[], p_accom text[], p_note text)
returns bigint language plpgsql as $$
declare
  v_id bigint;
  v_driver record;
  v_van record;
  v_past boolean := p_end < date '2026-11-25';
begin
  insert into public.tours (created_at, title, description, destination, price, duration, group_size, difficulty, inclusions, exclusions,
                            things_to_bring, itinerary, important_note, is_archived, image_urls, start_date, end_date,
                            accommodation_options, departure_time)
  values (p_start - interval '45 days', p_title, p_desc, p_dest, p_price,
          case when p_end = p_start then '1 Day' else format('%s Days, %s Night%s', p_end - p_start + 1, p_end - p_start, case when p_end - p_start > 1 then 's' else '' end) end,
          14, pg_temp.sym_diff(p_diff), p_incl, p_excl, p_bring, p_itin, p_note, p_archived, p_imgs, p_start, p_end, coalesce(p_accom, '{}'), p_dep)
  returning id into v_id;

  insert into public.tour_rates (tour_id, regular_rate) values (v_id, greatest(1300, p_price - 500));
  insert into public.tour_expenses (tour_id, van_rent, tour_guide, bag_tag, others) values (v_id, 18000, 1500, 260, '[]');

  select id, name, contact into v_driver from public.fleet_drivers where is_active order by created_at limit 1;
  select id, car_type, plate_number, color into v_van from public.fleet_vans where is_active order by created_at limit 1;
  insert into public.tour_vehicles (tour_id, car_type, plate_number, driver_name, driver_contact, vehicle_color, vehicle_notes, driver_id, van_id)
  values (v_id, coalesce(v_van.car_type, 'Toyota Hiace Grandia'), coalesce(v_van.plate_number, 'NCA 4821'),
          coalesce(v_driver.name, 'Ramon Castillo'), coalesce(v_driver.contact, '09171234567'), coalesce(v_van.color, 'Pearl White'),
          'Blue "Bandang IBAYO" sticker on the windshield', v_driver.id, v_van.id);

  insert into public.tour_meetups (tour_id, location_name, scheduled_time, status, note, lat, lng, route_order, minutes_from_start, created_at)
  values (v_id, 'Cubao (Araneta City Bus Port)', pg_temp.sym_time(p_dep, 0), case when v_past then 'DEPARTED' else 'DEPARTURE' end, 'Look for the white van near Gate 3', 14.6197, 121.0537, 1, 0, p_start - interval '30 days'),
         (v_id, 'SM North EDSA (The Block entrance)', pg_temp.sym_time(p_dep, 30), case when v_past then 'DEPARTED' else 'DEPARTURE' end, '', 14.6566, 121.0305, 2, 25, p_start - interval '30 days' + interval '1 second'),
         (v_id, 'Petron NLEX Balintawak', pg_temp.sym_time(p_dep, 45), case when v_past then 'DEPARTED' else 'DEPARTURE' end, 'Last pickup before the expressway', 14.6612, 121.0013, 3, 35, p_start - interval '30 days' + interval '2 seconds');
  return v_id;
end $$;

-- One booking, the way the website records it. p_state:
--   done          finished trip (paid in full, or downpayment + balance), checked in and out
--   paid          paid; a downpayment booking still owes the balance
--   settled       downpayment + balance paid (not yet travelled)
--   live          on the Nov 25 trip (not picked up yet: tracking starts on the day)
--   live_due      same, still owes the balance
--   live_wait     same as live
--   awaiting      waiting for payment (slots on hold)
--   verify        GCash receipt sent, waiting for an admin to check it
--   cancel_req    paid, asked to cancel (waiting for approval)
--   cancelled     cancelled by Bandang IBAYO after a request
--   rejected      payment rejected
--   expired       checkout never paid
--   refund_due / refund_sent   tour cancelled by bad weather: 50% refund
create or replace function pg_temp.sym_booking(p_tour bigint, p_user uuid, p_slots int, p_method text, p_state text,
                                               p_created timestamptz, p_pickup text, p_admin uuid, p_admin_name text)
returns uuid language plpgsql as $$
declare
  t public.tours%rowtype;
  p public.profiles%rowtype;
  r public.booking_rules%rowtype;
  v_id uuid;
  v_price numeric;
  v_total numeric;
  v_down numeric;
  v_paid numeric;
  v_down_pct numeric;
  v_settled boolean := false;
  v_status text := 'Completed';
  v_pay text := 'Complete';
  v_email text;
  v_companions jsonb := '[]';
  v_names text[] := array['Lara Cruz', 'Ben Santiago', 'Mika Dizon', 'Gab Castro', 'Rica Pascual', 'Leo Manalo', 'Tin Ocampo', 'Dan Robles', 'Ivy Salazar'];
  v_start timestamptz;
  v_end timestamptz;
  v_number text;
  i int;
begin
  select * into t from public.tours where id = p_tour;
  select * into p from public.profiles where id = p_user;
  select * into r from public.booking_rules where id = 1;
  select email into v_email from auth.users where id = p_user;
  v_down_pct := coalesce(r.downpayment_percent, 50);
  v_price := public.tour_effective_price(t);
  v_total := v_price * p_slots;
  v_down := round(v_total * v_down_pct / 100, 2);
  v_start := (t.start_date::timestamp + time '03:30') at time zone 'Asia/Manila';
  v_end := (t.end_date::timestamp + time '20:00') at time zone 'Asia/Manila';
  for i in 2..p_slots loop
    v_companions := v_companions || jsonb_build_array(jsonb_build_object(
      'full_name', v_names[1 + ((abs(hashtext(p_user::text || p_tour::text)) + i) % array_length(v_names, 1))],
      'contact_number', '0918' || lpad((abs(hashtext(p_user::text || i::text)) % 10000000)::text, 7, '0')));
  end loop;

  v_paid := case when p_method = 'full' then v_total else v_down end;
  if p_state in ('done', 'settled', 'live') and p_method = 'down' then v_settled := true; v_paid := v_total; end if;
  if p_state = 'live_wait' and p_method = 'down' then v_settled := true; v_paid := v_total; end if;
  if p_state = 'awaiting' then v_status := 'Active'; v_pay := 'Awaiting Payment'; v_paid := 0; end if;
  if p_state = 'verify' then v_status := 'Active'; v_pay := 'Verification Pending'; end if;
  if p_state in ('cancelled', 'refund_due', 'refund_sent') then v_status := 'Cancelled'; end if;
  if p_state = 'rejected' then v_status := 'Rejected'; v_pay := 'Rejected'; v_paid := 0; end if;
  if p_state = 'expired' then v_status := 'Cancelled'; v_pay := 'Expired'; v_paid := 0; end if;

  v_number := 'BK-' || to_char(p_created at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0');

  insert into public.bookings (
    created_at, tour_id, user_id, full_name, contact_number, slots_booked, total_price, payment_status, booking_status,
    booking_number, email, payment_method, amount_paid, companions, pickup_point, sale_discount, accommodation,
    downpayment_amount, balance_settled, balance_settled_at,
    paymongo_payment_id, paymongo_balance_payment_id, paid_online_at, hold_expires_at,
    gcash_reference_no, gcash_number, receipt_url,
    checked_in_at, checked_in_by, checked_out_at, checked_out_by,
    cancellation_reason, cancellation_requested_at,
    reminder_sent_at, balance_reminder_sent_at,
    processed_by, processed_by_name, balance_processed_by_name,
    rule_cancel_days, rule_downpayment_percent, rule_weather_refund_percent,
    weather_choice, weather_prev_status, weather_refund, weather_refund_status, weather_refund_ref, weather_refund_at,
    weather_refund_method, weather_refund_prepared_by, weather_refund_prepared_at, weather_refund_received, weather_refund_received_at
  ) values (
    p_created, p_tour, p_user, trim(concat_ws(' ', p.first_name, p.last_name)), coalesce(p.phone_number, '09170000000'), p_slots, v_total, v_pay, v_status,
    v_number, v_email, case when p_method = 'full' then 'Full Payment' else 'Downpayment' end, v_paid, v_companions, p_pickup,
    (coalesce(t.price, 0) - v_price) * p_slots, case when cardinality(t.accommodation_options) > 0 then t.accommodation_options[1] end,
    case when p_method = 'down' then v_down end, v_settled, case when v_settled then least(v_start - interval '4 days', now()) end,
    case when v_pay = 'Complete' then 'pay_demo' || substr(md5(v_number), 1, 18) end,
    case when v_settled then 'pay_demo' || substr(md5(v_number || 'b'), 1, 18) end,
    case when v_pay = 'Complete' then p_created + interval '6 minutes' end,
    case when p_state = 'awaiting' then timestamptz '2026-11-25 18:00+08' end,
    case when p_state = 'verify' then '1013 ' || lpad((abs(hashtext(v_number)) % 100000000)::text, 8, '0') end,
    case when p_state = 'verify' then coalesce(p.phone_number, '09170000000') end,
    case when p_state = 'verify' then '/og-image.jpg' end,
    case when p_state = 'done' then v_start + interval '10 minutes' end,
    case when p_state = 'done' then p_admin end,
    case when p_state = 'done' then v_end end,
    case when p_state = 'done' then p_admin end,
    case p_state when 'cancel_req' then 'Schedule conflict at work' when 'cancelled' then 'Family emergency'
                 when 'rejected' then 'The GCash reference number did not match any payment.' when 'expired' then 'Checkout expired: not paid within 30 minutes.'
                 when 'refund_due' then 'Tour cancelled (Typhoon Ofel) · 50% refund' when 'refund_sent' then 'Tour cancelled (Typhoon Ofel) · 50% refund' end,
    case p_state when 'cancel_req' then now() - interval '40 minutes' when 'cancelled' then v_start - interval '20 days' end,
    case when v_pay = 'Complete' then least(now(), v_start - interval '1 day') end,
    case when v_pay = 'Complete' then least(now(), v_start - interval '3 days') end,
    case when v_pay in ('Complete', 'Rejected') then p_admin end,
    case when v_pay in ('Complete', 'Rejected') then p_admin_name end,
    case when v_settled then p_admin_name end,
    coalesce(r.cancellation_cutoff_days, 14), v_down_pct, coalesce(r.weather_refund_percent, 50),
    case when p_state in ('refund_due', 'refund_sent') then 'refund' end,
    case when p_state in ('refund_due', 'refund_sent') then 'Completed' end,
    case when p_state in ('refund_due', 'refund_sent') then round(v_paid * coalesce(r.weather_refund_percent, 50) / 100, 2) end,
    case p_state when 'refund_due' then 'Due' when 'refund_sent' then 'Sent' end,
    case when p_state = 'refund_sent' then '1012 ' || lpad((abs(hashtext(v_number || 'r')) % 100000000)::text, 8, '0') end,
    case when p_state = 'refund_sent' then timestamptz '2026-10-29 14:20+08' end,
    case when p_state = 'refund_sent' then 'GCash' end,
    case when p_state = 'refund_sent' then p_admin end,
    case when p_state = 'refund_sent' then timestamptz '2026-10-28 10:05+08' end,
    case when p_state = 'refund_sent' then 'received' end,
    case when p_state = 'refund_sent' then timestamptz '2026-10-30 09:12+08' end
  ) returning id into v_id;

  -- Its history (Booking Management → details).
  insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes, created_at)
  values (v_id, p_user, trim(concat_ws(' ', p.first_name, p.last_name)), case when p_state in ('awaiting', 'expired') then 'Started online checkout' else 'Booked' end, '{}', p_created);
  if v_pay = 'Complete' then
    insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes, created_at)
    values (v_id, null, 'PayMongo (online payment)', 'Payment confirmed', jsonb_build_object('payment_status', 'Complete', 'amount_paid', v_paid), p_created + interval '6 minutes');
  end if;
  if v_settled then
    insert into public.booking_activity (booking_id, actor_id, actor_name, action, changes, created_at)
    values (v_id, null, 'PayMongo (online payment)', 'Balance settled', '{"balance_settled": true}', least(v_start - interval '4 days', now()));
  end if;

  -- Automatic emails for this booking: marked as already sent.
  insert into public.email_log (kind, ref) values ('departure-15-email', v_id::text), ('cancellation-approved', v_id::text),
    ('pickup-day', p_tour || ':' || p_user), ('review-invite', p_tour || ':' || p_user)
  on conflict do nothing;
  return v_id;
end $$;

-- Planned (and, for finished tours, actual) expenses, from the real head count.
create or replace function pg_temp.sym_expenses(p_tour bigint, p_van numeric, p_boat boolean, p_final boolean, p_admin uuid)
returns void language plpgsql as $$
declare
  t public.tours%rowtype;
  v_pax int;
  v_nights int;
  v_days int;
begin
  select * into t from public.tours where id = p_tour;
  select coalesce(sum(slots_booked), 0) into v_pax from public.bookings
   where tour_id = p_tour and booking_status not in ('Cancelled', 'Rejected');
  v_pax := greatest(v_pax, 1);
  v_days := t.end_date - t.start_date + 1;
  v_nights := greatest(0, v_days - 1);
  insert into public.tour_expense_lines (tour_id, category, label, rate, rate_basis, quantity, estimated_amount, actual_amount, actual_note, sort_order, is_unplanned)
  values
    (p_tour, 'van_rental', 'Van rental (driver, fuel, tolls)', p_van, 'per_trip', 1, p_van,
       case when p_final then p_van + 650 end, case when p_final then 'Extra toll and parking' end, 1, false),
    (p_tour, 'tour_guide', 'Local tour guide', 1000, 'per_trip', v_days, 1000 * v_days, case when p_final then 1000 * v_days end, null, 2, false),
    (p_tour, 'food', 'Meals', 250 * v_days, 'per_person', v_pax, 250 * v_days * v_pax, case when p_final then 250 * v_days * v_pax - 300 end, null, 3, false),
    (p_tour, 'attraction', 'Entrance & environmental fees', 250, 'per_person', v_pax, 250 * v_pax, case when p_final then 250 * v_pax end, null, 4, false),
    (p_tour, 'bag_tag', 'Bag tags', 260, 'per_trip', 1, 260, case when p_final then 260 end, null, 6, false);
  if v_nights > 0 then
    insert into public.tour_expense_lines (tour_id, category, label, rate, rate_basis, quantity, estimated_amount, actual_amount, sort_order)
    values (p_tour, 'accommodation', 'Homestay / inn', 450 * v_nights, 'per_person', v_pax, 450 * v_nights * v_pax, case when p_final then 450 * v_nights * v_pax end, 5);
  end if;
  if p_boat then
    insert into public.tour_expense_lines (tour_id, category, label, rate, rate_basis, quantity, estimated_amount, actual_amount, sort_order)
    values (p_tour, 'boat', 'Island hopping boat', 3000, 'per_trip', greatest(1, v_days - 1), 3000 * greatest(1, v_days - 1),
            case when p_final then 3000 * greatest(1, v_days - 1) end, 7);
  end if;
  if p_final then
    insert into public.tour_expense_lines (tour_id, category, label, rate, rate_basis, quantity, estimated_amount, actual_amount, actual_note, sort_order, is_unplanned)
    values (p_tour, 'other', 'Raincoats for the group', 0, 'per_trip', 1, 0, 1200, 'Bought on the way (rain)', 8, true);
    update public.tours set expenses_final_at = (t.end_date::timestamp + time '21:00') at time zone 'Asia/Manila', expenses_final_by = p_admin where id = p_tour;
  end if;
end $$;

-- ── The demo data ──
do $$
declare
  v_demo_email text := 'PUT-YOUR-DEMO-JOINER-EMAIL-HERE';   -- ◀◀ change this

  v_demo uuid;
  v_admin uuid;
  v_admin_name text;
  u uuid[];             -- the 12 demo joiners
  v_img_beach text[] := array['/hero-elnido.webp', '/og-image.jpg', '/nature-bg.webp'];
  v_img_mountain text[] := array['/nature-bg.webp', '/hero-elnido.webp', '/tour-placeholder.webp'];
  -- Trips (shared by their dates)
  v_pulag_desc text := 'Stand above the clouds on Luzon''s highest peak. A guided overnight climb through mossy forest and grasslands to watch the famous Mt. Pulag sea of clouds at sunrise.';
  v_pulag_incl text := E'Round-trip van from Metro Manila\nDENR orientation and permits\nLocal guide and porter assistance\nCampsite fees\n3 meals\nBag tag';
  v_pulag_itin text := E'Day 0:\n10:00 PM – Meet up at the pickup points\nDay 1:\n06:00 AM – DENR orientation in Ambangeg\n09:00 AM – Hike to Camp 2\n05:00 PM – Dinner and early sleep\nDay 2:\n02:00 AM – Summit assault\n05:30 AM – Sea of clouds at the summit\n11:00 AM – Back to Manila';
  v_pagudpud_desc text := 'The Bangui windmills, the white sand of Saud Beach, Kapurpurawan Rock Formation and a night walk on Calle Crisologo in Vigan. Four days up north by van.';
  v_pagudpud_incl text := E'Round-trip van from Metro Manila\n3 nights beach-front homestay\nBangui Windmills and Kapurpurawan Rock Formation\nPaoay Church and Vigan heritage walk\nDaily breakfast\nEnvironmental fees\nLocal guide';
  v_pagudpud_itin text := E'Day 0:\n08:00 PM – Meet up at the pickup points\nDay 1:\n08:00 AM – Paoay Church and the Sand Dunes\n03:00 PM – Check in at Saud Beach\nDay 2:\n08:00 AM – Bangui Windmills, Kapurpurawan, Cape Bojeador Lighthouse\nDay 3:\n08:00 AM – Patapat Viaduct and Kabigan Falls\nDay 4:\n07:00 AM – Vigan: Calle Crisologo and empanada, then back to Manila';
  v_sagada_desc text := 'Caves, hanging coffins and a sunrise over a sea of clouds at Kiltepan. A relaxed long weekend in the cool mountains of Sagada.';
  v_sagada_incl text := E'Round-trip van from Metro Manila\n2 nights inn accommodation\nSumaguing Cave connection with guide\nHanging coffins and Echo Valley tour\nKiltepan sunrise\nEnvironmental fees';
  v_sagada_itin text := E'Day 0:\n09:00 PM – Meet up at the pickup points\nDay 1:\n09:00 AM – Arrive in Sagada, check in\n01:00 PM – Echo Valley and hanging coffins\nDay 2:\n05:00 AM – Kiltepan sunrise\n09:00 AM – Cave connection\nDay 3:\n08:00 AM – Breakfast and travel back to Manila';
  v_bring text := E'Valid ID\nWater bottle (1 liter)\nRain jacket\nComfortable shoes\nPersonal medicines\nPower bank';
  v_excl text := E'Personal expenses\nTips for guides and drivers\nMeals not listed';
  v_note text := 'Please be at your pickup point 15 minutes early. The van leaves on time. Follow your guide and the Leave No Trace rules.';

  t_pulag1 bigint; t_pagudpud1 bigint; t_calaguas bigint; t_sagada1 bigint; t_baler bigint; t_ulap bigint;
  t_live bigint; t_pinatubo bigint; t_sagada2 bigint; t_pagudpud2 bigint; t_banaue bigint; t_pulag2 bigint; t_launion bigint; t_private bigint;
  b uuid;
  b_demo_live uuid; b_demo_sagada uuid; b_cancel uuid; b_verify uuid;
  r_private uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  m1 bigint; m2 bigint;
  v_tbl text;
  d uuid[];
  v uuid[];
  v_tr record;
  i int := 0;
  v_tables text[] := array['tours', 'bookings', 'booking_activity', 'tour_rates', 'tour_expenses', 'tour_expense_lines', 'tour_vehicles',
    'tour_meetups', 'tour_tracking_logs', 'van_locations', 'tour_chat_messages', 'tour_chat_reactions', 'tour_waitlist', 'tour_favorites',
    'reviews', 'review_reactions', 'feed_posts', 'feed_comments', 'feed_reactions', 'exclusive_requests', 'admin_messages',
    'pickup_requests', 'refund_log', 'system_feedback', 'profiles',
    'suppliers', 'fleet_drivers', 'fleet_vans', 'destinations', 'pickup_spots', 'inclusion_ratings'];
begin
  -- Checks first.
  select id into v_demo from auth.users where lower(email) = lower(btrim(v_demo_email));
  if v_demo is null then
    raise exception 'Put the email of your demo joiner account on the v_demo_email line first (no account has the email "%").', v_demo_email;
  end if;
  if exists (select 1 from public.tours) then
    raise exception 'There are still tours. Run 1_wipe.sql first.';
  end if;
  select id, trim(concat_ws(' ', first_name, last_name)) into v_admin, v_admin_name
    from public.profiles where role = 'admin' order by is_main_admin desc, created_at limit 1;
  if v_admin is null then raise exception 'No admin account found.'; end if;

  -- The database's own triggers (notifications, emails, checks meant for
  -- people using the website) stay off while the demo data goes in.
  foreach v_tbl in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_tbl);
  end loop;

  -- ── Sample suppliers, drivers, vans, destinations and pickup points ──
  -- (only the ones not saved yet: a name you already have is skipped)
  -- ── Destinations ──
  insert into public.destinations (name, region)
  select x.n, x.r from (values
    ('Kabayan, Benguet', 'CAR (Cordillera)'), ('Itogon, Benguet', 'CAR (Cordillera)'), ('Sagada, Mountain Province', 'CAR (Cordillera)'),
    ('Banaue, Ifugao', 'CAR (Cordillera)'), ('Pagudpud, Ilocos Norte', 'Ilocos Region'), ('San Juan, La Union', 'Ilocos Region'),
    ('Baler, Aurora', 'Central Luzon'), ('San Antonio, Zambales', 'Central Luzon'), ('Capas, Tarlac', 'Central Luzon'),
    ('Tagaytay, Cavite', 'CALABARZON'), ('Vinzons, Camarines Norte', 'Bicol Region')) as x(n, r)
  where not exists (select 1 from public.destinations y where lower(y.name) = lower(x.n));

  -- ── Pickup points ──
  insert into public.pickup_spots (name, address, lat, lng)
  select x.n, x.a, x.la, x.lo from (values
    ('Cubao (Araneta City Bus Port)', 'Araneta City, Cubao, Quezon City', 14.6197, 121.0537),
    ('SM North EDSA (The Block entrance)', 'North Ave. cor. EDSA, Quezon City', 14.6566, 121.0305),
    ('Petron NLEX Balintawak', 'NLEX Balintawak, Quezon City', 14.6612, 121.0013),
    ('Petron SCTEX Dinalupihan', 'SCTEX, Dinalupihan, Bataan', 14.8790, 120.4650),
    ('Malolos Crossing (Jollibee)', 'MacArthur Hwy, Malolos, Bulacan', 14.8436, 120.8114),
    ('Makati (Greenbelt 3)', 'Esperanza St., Makati City', 14.5528, 121.0210)) as x(n, a, la, lo)
  where not exists (select 1 from public.pickup_spots y where lower(y.name) = lower(x.n));

  -- ── Drivers ──
  insert into public.fleet_drivers (name, contact)
  select x.n, x.c from (values ('Ramon Castillo', '09171234567'), ('Eduardo "Edong" Pascual', '09181239876'), ('Noel Villareal', '09221237788')) as x(n, c)
  where not exists (select 1 from public.fleet_drivers y where lower(y.name) = lower(x.n));

  -- ── Vans ──
  insert into public.fleet_vans (car_type, plate_number, color, notes, seats)
  select x.t, x.p, x.c, x.n, x.s from (values
    ('Toyota Hiace Grandia', 'NCA 4821', 'Pearl White', 'Blue "Bandang IBAYO" sticker on the windshield', 14),
    ('Nissan Urvan NV350', 'NBQ 7312', 'Silver', 'Roof rack for bags', 15),
    ('Toyota Hiace Commuter', 'DAB 2290', 'White', 'Orange curtains', 14)) as x(t, p, c, n, s)
  where not exists (select 1 from public.fleet_vans y where upper(replace(y.plate_number, ' ', '')) = upper(replace(x.p, ' ', '')));

  -- ── Suppliers ──
  insert into public.suppliers (name, supplier_type, inclusion_name, contact_person, contact_number, destinations, default_rate, rate_basis, notes)
  select x.* from (values
    ('JM Van Rentals', 'van_rental', 'Round-trip van with driver', 'Jojo Manalo', '09171112233',
       array['Kabayan, Benguet', 'Itogon, Benguet', 'Sagada, Mountain Province', 'Banaue, Ifugao', 'Baler, Aurora', 'San Antonio, Zambales', 'Capas, Tarlac', 'Tagaytay, Cavite', 'San Juan, La Union'], 9000::numeric, 'per_trip', 'Includes fuel, tolls and driver''s meals. Book 2 weeks ahead.'),
    ('Northbound Van Tours', 'van_rental', 'Round-trip van with driver', 'Lito Ramos', '09281114455',
       array['Pagudpud, Ilocos Norte', 'Vinzons, Camarines Norte'], 14000, 'per_trip', 'Bigger vans with reclining seats for the long trips up north and to Bicol.'),
    ('Kabayan Mountain Guides', 'tour_guide', 'Local mountain guide', 'Jun Bayangan', '09191234455', array['Kabayan, Benguet'], 1000, 'per_trip', 'DENR-accredited. 1 guide per 7 hikers.'),
    ('Sagada Genuine Guides Association', 'tour_guide', 'Local tour guide', 'Manang Cora Dao-ey', '09201239911', array['Sagada, Mountain Province'], 1000, 'per_trip', 'Cave connection guides included.'),
    ('Ampucao Trail Guides', 'tour_guide', 'Local trail guide', 'Ben Tayaban', '09211230022', array['Itogon, Benguet'], 1000, 'per_trip', null),
    ('Batad Guides Association', 'tour_guide', 'Local trek guide', 'Manong Peter Dulnuan', '09231236677', array['Banaue, Ifugao'], 1000, 'per_trip', 'Batad trek and Tappiya Falls.'),
    ('Luzon Explorer Guides', 'tour_guide', 'Local tour guide', 'Rex Dumlao', '09241236688',
       array['Pagudpud, Ilocos Norte', 'Vinzons, Camarines Norte', 'San Juan, La Union', 'San Antonio, Zambales', 'Baler, Aurora', 'Capas, Tarlac'], 1000, 'per_trip', null),
    ('Pundaquit Boatmen Association', 'boat', 'Boat transfers', 'Mang Tonyo Ladia', '09241237788', array['San Antonio, Zambales'], 3000, 'per_trip', 'Anawangin and Capones in one trip.'),
    ('Calaguas Bangka Tours', 'boat', 'Boat transfers and island hopping', 'Grace Abrina', '09251238899', array['Vinzons, Camarines Norte'], 3000, 'per_trip', 'From Paracale port. Island hopping included.'),
    ('Ganduyan Inn', 'accommodation', 'Inn accommodation', 'Ate Lyn', '09271230011', array['Sagada, Mountain Province'], 450, 'per_person', 'Hot shower, 4 per room.'),
    ('Saud Beach Homestay', 'accommodation', 'Beach-front homestay', 'Nanay Rosa Agcaoili', '09281230022', array['Pagudpud, Ilocos Norte'], 450, 'per_person', 'A short walk to Saud Beach.'),
    ('Banaue Native Village Inn', 'accommodation', 'Native-style inn', 'Mark Villaflor', '09291230033', array['Banaue, Ifugao'], 450, 'per_person', 'View of the rice terraces.'),
    ('Urbiztondo Beach Hostel', 'accommodation', 'Beach hostel', 'Cha Lazaro', '09291230034', array['San Juan, La Union', 'Baler, Aurora'], 450, 'per_person', null),
    ('Anawangin Campsite', 'accommodation', 'Tent and campsite', 'Kuya Ben', '09301230044', array['San Antonio, Zambales', 'Kabayan, Benguet'], 450, 'per_person', 'Tents for 2, sleeping mats included.'),
    ('Calaguas Camp Hosts', 'accommodation', 'Tent and campsite', 'Ate Weng', '09301230045', array['Vinzons, Camarines Norte'], 450, 'per_person', 'Beach-front tents and shower area.'),
    ('Lola Ising''s Kitchen', 'food', 'Meals', 'Lola Ising', '09311230055',
       array['Kabayan, Benguet', 'Itogon, Benguet', 'Sagada, Mountain Province', 'Banaue, Ifugao', 'San Antonio, Zambales', 'Capas, Tarlac', 'Baler, Aurora'], 250, 'per_person', 'Packed meals for hikes; vegetarian on request.'),
    ('Ilocos Empanada & Grill', 'food', 'Meals', 'Joel Hidalgo', '09321230066',
       array['Pagudpud, Ilocos Norte', 'San Juan, La Union', 'Vinzons, Camarines Norte'], 250, 'per_person', null),
    ('Protected Area & Tourism Fees', 'attraction', 'Entrance & environmental fees', null, null,
       array['Kabayan, Benguet', 'Itogon, Benguet', 'Sagada, Mountain Province', 'Banaue, Ifugao', 'Pagudpud, Ilocos Norte', 'Vinzons, Camarines Norte', 'San Juan, La Union', 'San Antonio, Zambales', 'Capas, Tarlac', 'Baler, Aurora'], 250, 'per_person', 'Paid at the registration area.')
  ) as x(name, supplier_type, inclusion_name, contact_person, contact_number, destinations, default_rate, rate_basis, notes)
  where not exists (select 1 from public.suppliers y where lower(y.name) = lower(x.name));

  -- ── 12 demo joiners ──
  u := array[
    pg_temp.sym_user(1, 'Maria', 'Santos', '09171234501', 'Quezon City', 'Metro Manila', 'Bagong Pag-asa', date '2026-05-12', date '1997-03-14'),
    pg_temp.sym_user(2, 'Juan', 'dela Cruz', '09181234502', 'Manila', 'Metro Manila', 'Sampaloc', date '2026-05-20', date '1995-08-02'),
    pg_temp.sym_user(3, 'Angela', 'Reyes', '09191234503', 'Malolos', 'Bulacan', 'Santo Rosario', date '2026-06-02', date '1999-11-21'),
    pg_temp.sym_user(4, 'Carlo', 'Mendoza', '09201234504', 'Pasig', 'Metro Manila', 'Kapitolyo', date '2026-06-09', date '1994-01-30'),
    pg_temp.sym_user(5, 'Bea', 'Villanueva', '09211234505', 'Makati', 'Metro Manila', 'Poblacion', date '2026-06-15', date '1998-06-11'),
    pg_temp.sym_user(6, 'Paolo', 'Garcia', '09221234506', 'Meycauayan', 'Bulacan', 'Malhacan', date '2026-06-28', date '1996-09-05'),
    pg_temp.sym_user(7, 'Kristine', 'Bautista', '09231234507', 'Antipolo', 'Rizal', 'San Roque', date '2026-07-03', date '2000-02-17'),
    pg_temp.sym_user(8, 'Miguel', 'Ramos', '09241234508', 'Caloocan', 'Metro Manila', 'Bagong Silang', date '2026-07-10', date '1993-12-08'),
    pg_temp.sym_user(9, 'Jasmine', 'Flores', '09251234509', 'Marikina', 'Metro Manila', 'Concepcion Uno', date '2026-07-22', date '1999-04-25'),
    pg_temp.sym_user(10, 'Rafael', 'Aquino', '09261234510', 'San Jose del Monte', 'Bulacan', 'Muzon', date '2026-08-04', date '1997-07-19'),
    pg_temp.sym_user(11, 'Nicole', 'Torres', '09271234511', 'Taguig', 'Metro Manila', 'Fort Bonifacio', date '2026-08-18', date '2001-10-03'),
    pg_temp.sym_user(12, 'Joshua', 'Navarro', '09281234512', 'Valenzuela', 'Metro Manila', 'Malinta', date '2026-09-01', date '1998-05-27')];

  -- ── Tours ──
  -- Finished
  t_pulag1 := pg_temp.sym_tour('Mt. Pulag Sea of Clouds', 'Kabayan, Benguet', date '2026-07-18', date '2026-07-19', 3800, 'Hard', true,
    v_pulag_desc, v_pulag_incl, v_excl, v_bring || E'\nWarm jacket and gloves\nHeadlamp', v_pulag_itin, '22:00', v_img_mountain, '{}', v_note);
  t_pagudpud1 := pg_temp.sym_tour('Pagudpud & Vigan Heritage Trip', 'Pagudpud, Ilocos Norte', date '2026-08-13', date '2026-08-16', 6500, 'Easy', true,
    v_pagudpud_desc, v_pagudpud_incl, v_excl, v_bring || E'\nSunscreen\nHat\nSwimwear', v_pagudpud_itin, '20:00', v_img_beach, pg_temp.sym_accom('room'), v_note);
  t_calaguas := pg_temp.sym_tour('Calaguas Island Escape', 'Vinzons, Camarines Norte', date '2026-09-10', date '2026-09-13', 5800, 'Easy', true,
    'Powdery white sand and clear blue water on Mahabang Buhangin. A long van ride to Bicol, a boat across, and two nights camping on one of the best beaches in Luzon.',
    E'Round-trip van from Metro Manila\nBoat transfers from Paracale\n2 nights tent camping on the beach\nIsland hopping to Tinaga and Pinagtarcan\n6 meals\nEnvironmental fees\nLocal guide', v_excl,
    v_bring || E'\nSwimwear and rash guard\nDry bag\nHeadlamp',
    E'Day 0:\n09:00 PM – Meet up at the pickup points\nDay 1:\n08:00 AM – Arrive in Paracale, boat to Calaguas\n12:00 PM – Lunch and swimming at Mahabang Buhangin\nDay 2:\n08:00 AM – Island hopping: Tinaga and Pinagtarcan\n05:30 PM – Sunset from the hill\nDay 3:\n06:00 AM – Sunrise and breakfast\n10:00 AM – Boat back to Paracale\nDay 4:\n07:00 AM – Pasalubong stop in Daet, then back to Manila',
    '21:00', v_img_beach, pg_temp.sym_accom('camp'), v_note);
  t_sagada1 := pg_temp.sym_tour('Sagada Cave & Sunrise', 'Sagada, Mountain Province', date '2026-10-09', date '2026-10-11', 4200, 'Moderate', true,
    v_sagada_desc, v_sagada_incl, v_excl, v_bring || E'\nJacket (it gets cold)', v_sagada_itin, '21:00', v_img_mountain, pg_temp.sym_accom('room'), v_note);
  t_baler := pg_temp.sym_tour('Baler Surf Weekend', 'Baler, Aurora', date '2026-10-24', date '2026-10-25', 2800, 'Easy', true,
    'Learn to surf at Sabang Beach, then visit the Ditumabo Mother Falls and the 600-year-old Balete tree.',
    E'Round-trip van from Metro Manila\n1 hour surf lesson with board\n1 night beach resort\nDitumabo Falls tour\n2 meals', v_excl, v_bring || E'\nSwimwear\nSlippers',
    E'Day 0:\n11:00 PM – Meet up at the pickup points\nDay 1:\n06:00 AM – Arrive in Baler, breakfast\n08:00 AM – Surf lesson at Sabang Beach\n02:00 PM – Ditumabo Mother Falls\nDay 2:\n07:00 AM – Balete Tree and Museo de Baler\n12:00 PM – Travel back to Manila',
    '23:00', v_img_beach, '{}', v_note);
  t_ulap := pg_temp.sym_tour('Mt. Ulap Eco-Trail', 'Itogon, Benguet', date '2026-11-14', date '2026-11-14', 2200, 'Moderate', true,
    'An easy-to-moderate ridge hike in Itogon with pine forests, Gungal Rock and wide views of the Cordillera. Perfect for first-time hikers.',
    E'Round-trip van from Metro Manila\nRegistration and guide fees\nLunch after the hike\nCertificate of completion', v_excl, v_bring || E'\nTrail shoes\nTrail snacks',
    E'Day 0:\n10:00 PM – Meet up at the pickup points\nDay 1:\n05:00 AM – Start the hike at Ampucao\n09:00 AM – Gungal Rock\n12:00 PM – Lunch\n02:00 PM – Strawberry farm stop, then back to Manila',
    '22:00', v_img_mountain, '{}', v_note);
  -- Happening on Nov 25–26 (live tracking)
  t_live := pg_temp.sym_tour('Anawangin Cove Camping', 'San Antonio, Zambales', date '2026-11-25', date '2026-11-26', 2900, 'Easy', false,
    'Pine trees on a white-sand cove. A boat ride from Pundaquit to Anawangin, a night of camping under the stars and a morning at Capones Island lighthouse.',
    E'Round-trip van from Metro Manila\nBoat transfers from Pundaquit\nTent and camping fees\n3 meals\nCapones Island side trip\nBag tag', v_excl, v_bring || E'\nSwimwear\nHeadlamp\nSleeping mat',
    E'Day 1:\n03:00 AM – Pickup at Cubao\n07:30 AM – Arrive at Pundaquit, boat to Anawangin\n12:00 PM – Lunch and swimming\n07:00 PM – Bonfire dinner\nDay 2:\n06:00 AM – Capones Island lighthouse\n11:00 AM – Boat back, travel to Manila',
    '03:00', v_img_beach, pg_temp.sym_accom('camp'), v_note);
  -- Upcoming
  t_pinatubo := pg_temp.sym_tour('Mt. Pinatubo Crater Trek', 'Capas, Tarlac', date '2026-12-05', date '2026-12-05', 2400, 'Moderate', false,
    'Ride a 4x4 across the lahar fields, then hike to the turquoise crater lake of Mt. Pinatubo.',
    E'Round-trip van from Metro Manila\n4x4 ride (shared)\nGuide and entrance fees\nLunch', v_excl, v_bring || E'\nSunglasses\nFace mask for dust',
    E'Day 1:\n03:00 AM – Pickup at Cubao\n06:00 AM – 4x4 ride across the lahar\n08:00 AM – Hike to the crater\n12:00 PM – Lunch\n06:00 PM – Back in Manila',
    '03:00', v_img_mountain, '{}', v_note);
  update public.tours set sale_starts = date '2026-11-20', sale_ends = date '2026-12-03' where id = t_pinatubo;
  t_sagada2 := pg_temp.sym_tour('Sagada Cave & Sunrise', 'Sagada, Mountain Province', date '2026-12-11', date '2026-12-13', 4200, 'Moderate', false,
    v_sagada_desc, v_sagada_incl, v_excl, v_bring || E'\nJacket (it gets cold)', v_sagada_itin, '21:00', v_img_mountain, pg_temp.sym_accom('room'), v_note);
  t_pagudpud2 := pg_temp.sym_tour('Pagudpud & Vigan Heritage Trip', 'Pagudpud, Ilocos Norte', date '2026-12-27', date '2026-12-30', 6500, 'Easy', false,
    v_pagudpud_desc, v_pagudpud_incl, v_excl, v_bring || E'\nSunscreen\nHat\nSwimwear', v_pagudpud_itin, '20:00', v_img_beach, pg_temp.sym_accom('room'), v_note);
  t_banaue := pg_temp.sym_tour('Banaue & Batad Rice Terraces', 'Banaue, Ifugao', date '2027-01-15', date '2027-01-17', 4500, 'Moderate', false,
    'The 2,000-year-old rice terraces of Ifugao. A hike down to the amphitheater of Batad, a swim at Tappiya Falls and a night in a native-style inn.',
    E'Round-trip van from Metro Manila\n2 nights inn in Banaue\nBatad trek with local guide\nTappiya Falls\nBanaue viewpoint\nEnvironmental fees', v_excl,
    v_bring || E'\nTrail shoes\nJacket (it gets cold)', E'Day 0:\n09:00 PM – Meet up at the pickup points\nDay 1:\n08:00 AM – Arrive in Banaue, viewpoint\n01:00 PM – Hapao rice terraces\nDay 2:\n07:00 AM – Batad trek and Tappiya Falls\nDay 3:\n08:00 AM – Breakfast, then back to Manila',
    '21:00', v_img_mountain, pg_temp.sym_accom('room'), v_note);
  t_pulag2 := pg_temp.sym_tour('Mt. Pulag Sea of Clouds', 'Kabayan, Benguet', date '2027-01-23', date '2027-01-24', 3800, 'Hard', false,
    v_pulag_desc, v_pulag_incl, v_excl, v_bring || E'\nWarm jacket and gloves\nHeadlamp', v_pulag_itin, '22:00', v_img_mountain, '{}', v_note);
  t_launion := pg_temp.sym_tour('La Union Surf & Food Trip', 'San Juan, La Union', date '2027-02-12', date '2027-02-14', 3600, 'Easy', false,
    'Surf lessons in Urbiztondo, Tangadan Falls, the grape farm and a food crawl along the beach. Three easy days in Elyu.',
    E'Round-trip van from Metro Manila\n2 nights beach hostel\n1 hour surf lesson with board\nTangadan Falls tour\nDaily breakfast', v_excl,
    v_bring || E'\nSwimwear\nSlippers', E'Day 0:\n10:00 PM – Meet up at the pickup points\nDay 1:\n05:00 AM – Arrive, surf lesson at sunrise\n02:00 PM – Tangadan Falls\nDay 2:\n09:00 AM – Grape farm and Baluarte Watchtower\n06:00 PM – Food crawl in Urbiztondo\nDay 3:\n09:00 AM – Check out, back to Manila',
    '22:00', v_img_beach, pg_temp.sym_accom('room'), v_note);

  -- Baler was cancelled by Typhoon Ofel.
  update public.tours set weather_status = 'cancelled', weather_reason = 'Typhoon Ofel (Signal No. 2 over Aurora)',
         weather_note = 'PAGASA raised Signal No. 2 over Aurora. Everyone who paid gets a 50% refund.', weather_at = timestamptz '2026-10-22 18:00+08'
   where id = t_baler;

  -- ── Bookings ──
  -- Mt. Pulag (Jul)
  b := pg_temp.sym_booking(t_pulag1, v_demo, 1, 'full', 'done', timestamptz '2026-06-08 20:14+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag1, u[1], 2, 'down', 'done', timestamptz '2026-06-10 12:40+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag1, u[2], 1, 'full', 'done', timestamptz '2026-06-14 09:05+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag1, u[3], 3, 'full', 'done', timestamptz '2026-06-20 21:30+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag1, u[4], 2, 'down', 'done', timestamptz '2026-06-25 18:22+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag1, u[5], 1, 'full', 'cancelled', timestamptz '2026-06-27 11:11+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  -- Pagudpud & Vigan (Aug)
  b := pg_temp.sym_booking(t_pagudpud1, v_demo, 2, 'full', 'done', timestamptz '2026-07-02 19:48+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud1, u[6], 2, 'full', 'done', timestamptz '2026-07-05 08:30+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud1, u[7], 3, 'down', 'done', timestamptz '2026-07-08 13:15+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud1, u[8], 2, 'full', 'done', timestamptz '2026-07-15 22:02+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud1, u[9], 1, 'full', 'done', timestamptz '2026-07-19 10:44+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  -- Calaguas (Sep)
  b := pg_temp.sym_booking(t_calaguas, u[3], 2, 'full', 'done', timestamptz '2026-08-01 16:20+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_calaguas, u[10], 2, 'full', 'done', timestamptz '2026-08-06 09:58+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_calaguas, u[11], 3, 'down', 'done', timestamptz '2026-08-12 20:31+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_calaguas, u[12], 1, 'full', 'done', timestamptz '2026-08-19 07:47+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_calaguas, u[1], 2, 'full', 'done', timestamptz '2026-08-21 15:03+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_calaguas, u[2], 1, 'full', 'rejected', timestamptz '2026-08-24 12:12+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  -- Sagada (Oct)
  b := pg_temp.sym_booking(t_sagada1, v_demo, 1, 'full', 'done', timestamptz '2026-09-03 21:09+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada1, u[5], 2, 'full', 'done', timestamptz '2026-09-06 10:30+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada1, u[6], 1, 'down', 'done', timestamptz '2026-09-10 18:45+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada1, u[9], 3, 'full', 'done', timestamptz '2026-09-14 14:17+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada1, u[4], 2, 'full', 'done', timestamptz '2026-09-18 09:26+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada1, u[8], 1, 'full', 'expired', timestamptz '2026-09-20 23:51+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  -- Baler (Oct, cancelled by the typhoon: refunds)
  b := pg_temp.sym_booking(t_baler, u[7], 2, 'full', 'refund_sent', timestamptz '2026-09-25 19:40+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  insert into public.refund_log (booking_id, booking_number, action, amount, method, reference, by_user, by_name, note, created_at)
  select id, booking_number, 'sent', weather_refund, 'GCash', weather_refund_ref, v_admin, v_admin_name, '50% weather refund (Typhoon Ofel)', weather_refund_at from public.bookings where id = b;
  b := pg_temp.sym_booking(t_baler, u[10], 2, 'full', 'refund_sent', timestamptz '2026-09-29 08:05+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  insert into public.refund_log (booking_id, booking_number, action, amount, method, reference, by_user, by_name, note, created_at)
  select id, booking_number, 'sent', weather_refund, 'GCash', weather_refund_ref, v_admin, v_admin_name, '50% weather refund (Typhoon Ofel)', weather_refund_at from public.bookings where id = b;
  b := pg_temp.sym_booking(t_baler, u[11], 1, 'full', 'refund_due', timestamptz '2026-10-02 17:33+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_baler, u[12], 2, 'full', 'refund_due', timestamptz '2026-10-06 11:58+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  -- Mt. Ulap (Nov)
  b := pg_temp.sym_booking(t_ulap, u[2], 2, 'full', 'done', timestamptz '2026-10-12 20:20+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_ulap, u[3], 1, 'full', 'done', timestamptz '2026-10-15 13:47+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_ulap, u[6], 2, 'full', 'done', timestamptz '2026-10-18 09:12+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_ulap, u[8], 3, 'down', 'done', timestamptz '2026-10-21 21:55+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_ulap, u[1], 1, 'full', 'done', timestamptz '2026-10-26 16:38+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  -- Anawangin (Nov 25–26, live)
  b_demo_live := pg_temp.sym_booking(t_live, v_demo, 2, 'down', 'live', timestamptz '2026-10-28 20:02+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_live, u[4], 2, 'full', 'live', timestamptz '2026-10-30 10:15+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_live, u[5], 3, 'full', 'live', timestamptz '2026-11-02 19:27+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_live, u[7], 2, 'down', 'live_due', timestamptz '2026-11-05 08:49+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_live, u[9], 1, 'full', 'live', timestamptz '2026-11-08 22:33+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_live, u[12], 1, 'full', 'live_wait', timestamptz '2026-11-12 14:06+08', 'Petron SCTEX Dinalupihan', v_admin, v_admin_name);
  -- Mt. Pinatubo (Dec 5, on sale)
  b := pg_temp.sym_booking(t_pinatubo, u[1], 2, 'full', 'paid', timestamptz '2026-11-20 09:15+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pinatubo, u[10], 1, 'full', 'paid', timestamptz '2026-11-21 18:42+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pinatubo, u[11], 2, 'full', 'paid', timestamptz '2026-11-22 12:30+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pinatubo, u[3], 1, 'full', 'awaiting', timestamptz '2026-11-23 08:10+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  -- Sagada (Dec)
  b_demo_sagada := pg_temp.sym_booking(t_sagada2, v_demo, 1, 'down', 'paid', timestamptz '2026-11-09 21:14+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada2, u[2], 2, 'down', 'paid', timestamptz '2026-11-10 10:01+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_sagada2, u[6], 1, 'full', 'paid', timestamptz '2026-11-13 15:44+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b_cancel := pg_temp.sym_booking(t_sagada2, u[8], 2, 'full', 'cancel_req', timestamptz '2026-11-14 19:20+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b_verify := pg_temp.sym_booking(t_sagada2, u[5], 1, 'full', 'verify', timestamptz '2026-11-22 20:55+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  insert into public.pickup_requests (booking_id, tour_id, user_id, location, note, status, created_at, updated_at)
  select id, t_sagada2, user_id, 'Malolos Crossing (Jollibee)', 'I live in Malolos. Can the van pass by on the way north?', 'Requested', now() - interval '20 hours', now() - interval '20 hours'
    from public.bookings where tour_id = t_sagada2 and user_id = u[6];
  -- Pagudpud & Vigan (Dec 27): fully booked + waitlist
  b := pg_temp.sym_booking(t_pagudpud2, u[1], 3, 'down', 'paid', timestamptz '2026-10-20 20:11+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud2, u[4], 2, 'full', 'paid', timestamptz '2026-10-24 09:36+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud2, u[7], 2, 'down', 'settled', timestamptz '2026-10-27 13:02+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud2, u[9], 3, 'full', 'paid', timestamptz '2026-11-01 17:45+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud2, u[10], 2, 'full', 'paid', timestamptz '2026-11-06 21:18+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pagudpud2, u[11], 2, 'down', 'paid', timestamptz '2026-11-11 11:27+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  insert into public.tour_waitlist (tour_id, user_id, slots_wanted, created_at) values
    (t_pagudpud2, u[12], 2, now() - interval '4 days'), (t_pagudpud2, u[3], 1, now() - interval '2 days');
  -- Banaue (Jan), Mt. Pulag (Jan), La Union (Feb)
  b := pg_temp.sym_booking(t_banaue, u[2], 2, 'down', 'paid', timestamptz '2026-11-15 20:40+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_banaue, u[5], 2, 'full', 'paid', timestamptz '2026-11-18 08:25+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag2, u[6], 3, 'down', 'paid', timestamptz '2026-11-19 19:52+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag2, u[8], 1, 'full', 'paid', timestamptz '2026-11-21 10:07+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_launion, u[4], 2, 'full', 'paid', timestamptz '2026-11-22 16:31+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);

  -- ── Expenses (Reports) ──
  perform pg_temp.sym_expenses(t_pulag1, 10500, false, true, v_admin);
  perform pg_temp.sym_expenses(t_pagudpud1, 14000, false, true, v_admin);
  perform pg_temp.sym_expenses(t_calaguas, 12000, true, true, v_admin);
  perform pg_temp.sym_expenses(t_sagada1, 12000, false, true, v_admin);
  perform pg_temp.sym_expenses(t_ulap, 9000, false, true, v_admin);
  perform pg_temp.sym_expenses(t_live, 9000, true, false, v_admin);
  perform pg_temp.sym_expenses(t_pinatubo, 8000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_sagada2, 12000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_pagudpud2, 14000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_banaue, 12000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_pulag2, 10500, false, false, v_admin);
  perform pg_temp.sym_expenses(t_launion, 9000, false, false, v_admin);

  -- ── Link the tours to the saved drivers, vans and suppliers ──
  select array_agg(id order by array_position(array['Ramon Castillo', 'Eduardo "Edong" Pascual', 'Noel Villareal'], name)) into d
    from public.fleet_drivers where name in ('Ramon Castillo', 'Eduardo "Edong" Pascual', 'Noel Villareal');
  select array_agg(id order by array_position(array['NCA 4821', 'NBQ 7312', 'DAB 2290'], plate_number)) into v
    from public.fleet_vans where plate_number in ('NCA 4821', 'NBQ 7312', 'DAB 2290');
  for v_tr in select id, title from public.tours order by start_date loop
    i := i + 1;
    update public.tour_vehicles tv
       set driver_id = fd.id, driver_name = fd.name, driver_contact = fd.contact,
           van_id = fv.id, car_type = fv.car_type, plate_number = fv.plate_number, vehicle_color = fv.color, vehicle_notes = fv.notes, updated_at = now()
      from public.fleet_drivers fd, public.fleet_vans fv
     where tv.tour_id = v_tr.id
       and fd.id = d[case when v_tr.title like 'Anawangin%' then 1 else 1 + (i % 3) end]
       and fv.id = v[case when v_tr.title like 'Anawangin%' then 1 else 1 + (i % 3) end];
  end loop;

  -- Each expense line → the supplier of that kind that goes to the tour's destination.
  update public.tour_expense_lines l
     set supplier_id = (select s.id from public.suppliers s
                         where s.is_active and s.supplier_type = l.category and t.destination = any(s.destinations)
                         order by s.created_at, s.name limit 1),
         updated_at = now()
    from public.tours t
   where t.id = l.tour_id and l.supplier_id is null and l.category <> 'bag_tag'
     and exists (select 1 from public.suppliers s where s.is_active and s.supplier_type = l.category and t.destination = any(s.destinations));

  -- Joiners of the finished trips rate the suppliers (4 or 5 stars).
  if to_regclass('public.inclusion_ratings') is not null then
    insert into public.inclusion_ratings (tour_id, line_id, supplier_id, user_id, rating, created_at)
    select distinct on (b.user_id, l.tour_id, l.supplier_id)
           l.tour_id, l.id, l.supplier_id, b.user_id, case when abs(hashtext(b.user_id::text || l.id::text)) % 4 = 0 then 4 else 5 end,
           (t.end_date::timestamp + time '21:00') at time zone 'Asia/Manila' + interval '2 days'
      from public.tour_expense_lines l
      join public.tours t on t.id = l.tour_id
      join public.bookings b on b.tour_id = l.tour_id and b.checked_out_at is not null and b.user_id is not null
     where l.supplier_id is not null and t.end_date < (now() at time zone 'Asia/Manila')::date
       and not exists (select 1 from public.inclusion_ratings x where x.user_id = b.user_id and x.tour_id = l.tour_id and x.supplier_id = l.supplier_id)
     order by b.user_id, l.tour_id, l.supplier_id, l.sort_order;
  end if;

  -- ── Live trip (Nov 25): its route and a 4th pickup on the way ──
  update public.tours set route = jsonb_build_object(
      'start', jsonb_build_object('name', 'Cubao (Araneta City Bus Port)', 'lat', 14.6197, 'lng', 121.0537),
      'end', jsonb_build_object('name', 'Pundaquit Beach, San Antonio', 'lat', 14.9663, 'lng', 120.0818),
      'coords', '[[121.0537,14.6197],[121.0305,14.6566],[121.0013,14.6612],[120.9610,14.7350],[120.8500,14.8650],[120.6880,15.0350],[120.5650,14.9400],[120.4650,14.8790],[120.2830,14.8780],[120.1500,14.9300],[120.0880,14.9480],[120.0818,14.9663]]'::jsonb)
   where id = t_live;
  insert into public.tour_meetups (tour_id, location_name, scheduled_time, status, note, lat, lng, route_order, minutes_from_start, created_at)
  values (t_live, 'Petron SCTEX Dinalupihan', '5:45 AM', 'DEPARTURE', 'Joshua joins here', 14.8790, 120.4650, 4, 160, timestamptz '2026-10-26 10:00+08');
  -- Tracking hasn't started: every pickup is still waiting, and there's no van
  -- location yet. Start it on Nov 25 (Tracking Management or the driver link).

  -- ── Group chats ──
  insert into public.tour_chat_messages (tour_id, user_id, body, kind, created_at) values
    (t_live, v_admin, 'Hello, everyone! The van leaves Cubao at 3:00 AM sharp on Wednesday, Nov 25. Please bring a valid ID and your swimwear. See you! 🌊', 'announcement', now() - interval '20 hours'),
    (t_live, u[5], 'Excited na! Is there a store near the campsite for snacks?', null, now() - interval '19 hours 40 minutes'),
    (t_live, v_admin, 'There''s a small sari-sari store at Pundaquit before the boat ride. The campsite only sells water and coffee.', null, now() - interval '19 hours 30 minutes'),
    (t_live, v_demo, 'Thank you! We''ll be at Cubao by 2:45 AM 🙌', null, now() - interval '19 hours'),
    (t_live, u[7], 'Can I pay my balance in the van on the day?', null, now() - interval '6 hours'),
    (t_live, v_admin, 'Yes, Kristine. You can also pay it online now in My Bookings so you don''t need cash.', null, now() - interval '5 hours 45 minutes'),
    (t_sagada2, v_admin, 'Hi everyone! Our Sagada group chat is open. Pack a warm jacket: mornings are around 12°C in December. 🧥', 'announcement', timestamptz '2026-11-15 18:00+08'),
    (t_sagada2, u[2], 'Is the cave connection okay for first-timers?', null, timestamptz '2026-11-15 18:22+08'),
    (t_sagada2, v_admin, 'Yes! The guides help you all the way. Just wear shoes or sandals with a good grip.', null, timestamptz '2026-11-15 18:30+08'),
    (t_sagada2, v_demo, 'Can''t wait for the Kiltepan sunrise! 🌄', null, timestamptz '2026-11-16 08:12+08');
  select id into m1 from public.tour_chat_messages where tour_id = t_live and kind = 'announcement' order by created_at limit 1;
  select id into m2 from public.tour_chat_messages where tour_id = t_sagada2 and kind = 'announcement' order by created_at limit 1;
  insert into public.tour_chat_reactions (message_id, user_id, tour_id, emoji, created_at) values
    (m1, u[4], t_live, '👍', timestamptz '2026-11-24 19:05+08'), (m1, u[5], t_live, '❤️', timestamptz '2026-11-24 19:06+08'),
    (m1, v_demo, t_live, '🙏', timestamptz '2026-11-24 19:30+08'), (m2, u[2], t_sagada2, '👍', timestamptz '2026-11-15 18:20+08');

  -- ── Reviews ──
  insert into public.reviews (tour_id, user_id, rating, comment, created_at, admin_reply, admin_reply_at) values
    (t_pulag1, v_demo, 5, 'The sea of clouds was unreal! Our guide Kuya Jun was patient with first-timers like me. The van was clean and right on time.', timestamptz '2026-07-21 20:10+08',
       'Thank you for joining us! Kuya Jun says hi. See you on the next climb! 🏔️', timestamptz '2026-07-22 09:00+08'),
    (t_pulag1, u[1], 5, 'Best climb ever. Everything was organized from pickup to drop-off.', timestamptz '2026-07-21 08:30+08', null, null),
    (t_pulag1, u[2], 4, 'Great trip. The cold was intense at the summit, so bring real gloves!', timestamptz '2026-07-22 12:15+08', null, null),
    (t_pulag1, u[3], 5, 'We were 3 friends and loved every minute. Worth waking up at 2 AM.', timestamptz '2026-07-23 19:40+08', null, null),
    (t_pagudpud1, u[6], 5, 'Pagudpud is paradise, and the homestay family was so warm.', timestamptz '2026-08-18 21:05+08', null, null),
    (t_pagudpud1, u[7], 5, 'Kapurpurawan was the highlight. Thank you for the very detailed itinerary!', timestamptz '2026-08-19 10:20+08',
       'Thank you, Kristine! Kapurpurawan is our favorite too. 💙', timestamptz '2026-08-19 15:00+08'),
    (t_pagudpud1, u[8], 4, 'Beautiful place. The ride up north is long, but the driver was careful and we had enough stops.', timestamptz '2026-08-20 18:44+08', null, null),
    (t_calaguas, u[3], 5, 'The sand is like powder and the water so clear. 10/10!', timestamptz '2026-09-15 20:00+08', null, null),
    (t_calaguas, u[10], 4, 'Very fun! The boat ride back was a bit rough, but the crew was great.', timestamptz '2026-09-16 09:12+08', null, null),
    (t_calaguas, u[11], 5, 'My first trip with Bandang IBAYO and definitely not the last.', timestamptz '2026-09-16 21:47+08', null, null),
    (t_calaguas, u[12], 3, 'Good trip but the campsite was crowded. Hope you find a quieter spot next time.', timestamptz '2026-09-17 13:30+08',
       'Thanks for the honest feedback, Joshua. We moved our campsite to the quieter side of the island for the next dates.', timestamptz '2026-09-18 10:00+08'),
    (t_sagada1, v_demo, 5, 'Cozy inn, delicious food and the cave connection was an adventure. The Kiltepan sunrise made my year.', timestamptz '2026-10-13 19:25+08', null, null),
    (t_sagada1, u[5], 5, 'Loved it! The guides made the cave connection safe and fun.', timestamptz '2026-10-12 22:10+08', null, null),
    (t_sagada1, u[9], 4, 'Nice trip. A bit long on the road but the views were worth it.', timestamptz '2026-10-14 08:40+08', null, null),
    (t_ulap, u[2], 5, 'Perfect first hike for my girlfriend. Gungal Rock photos came out amazing.', timestamptz '2026-11-16 20:30+08', null, null),
    (t_ulap, u[6], 4, 'Well organized. The trail was muddy after the rain, so wear proper shoes.', timestamptz '2026-11-17 11:05+08', null, null),
    (t_ulap, u[1], 5, 'Third trip with them and they never disappoint.', timestamptz '2026-11-17 19:50+08',
       'We''re so happy to have you again, Maria! 🧡', timestamptz '2026-11-18 08:30+08');
  insert into public.review_reactions (review_id, user_id, created_at)
  select r.id, x.uid, r.created_at + interval '1 day'
    from public.reviews r cross join (values (u[4]), (u[9]), (u[11])) as x(uid)
   where r.rating = 5 and r.user_id <> x.uid and r.tour_id in (t_pulag1, t_sagada1, t_ulap);

  -- ── Feed ──
  insert into public.feed_posts (author_id, content, image_url, post_type, tour_id, created_at, media, status) values
    (v_admin, 'NEW DATES: Banaue & Batad Rice Terraces on January 15–17, 2027! 🌾 The Batad amphitheater, Tappiya Falls and a night in Ifugao. Book now on Explore Tours.', null, 'tour', t_banaue,
       timestamptz '2026-11-12 18:00+08', jsonb_build_array(jsonb_build_object('url', '/hero-elnido.webp', 'type', 'image')), 'Approved'),
    (v_admin, 'Mt. Pinatubo Crater Trek is ON SALE until December 3! 🌋 Limited slots for December 5.', null, 'tour', t_pinatubo,
       timestamptz '2026-11-20 12:00+08', jsonb_build_array(jsonb_build_object('url', '/nature-bg.webp', 'type', 'image')), 'Approved'),
    (u[1], 'Throwback to our Mt. Ulap hike! ⛰️ Thank you Bandang IBAYO for another smooth trip.', null, 'post', null,
       timestamptz '2026-11-16 21:15+08', jsonb_build_array(jsonb_build_object('url', '/nature-bg.webp', 'type', 'image')), 'Approved'),
    (v_demo, 'Sagada sunrise from Kiltepan 🌄 Still dreaming about it. Who''s joining the December batch?', null, 'post', null,
       timestamptz '2026-10-14 19:40+08', jsonb_build_array(jsonb_build_object('url', '/hero-elnido.webp', 'type', 'image')), 'Approved'),
    (u[3], 'Calaguas sand is so fine it feels like flour 😍', null, 'post', null,
       timestamptz '2026-09-18 13:00+08', jsonb_build_array(jsonb_build_object('url', '/og-image.jpg', 'type', 'image')), 'Approved'),
    (u[12], 'Anyone selling a used tent? Looking for one for the Anawangin trip.', null, 'post', null,
       timestamptz '2026-11-23 09:30+08', '[]'::jsonb, 'Pending');
  select id into p1 from public.feed_posts where tour_id = t_banaue;
  select id into p2 from public.feed_posts where tour_id = t_pinatubo;
  select id into p3 from public.feed_posts where author_id = u[1];
  select id into p4 from public.feed_posts where author_id = v_demo;
  insert into public.feed_comments (post_id, user_id, content, created_at) values
    (p1, u[11], 'Saving up for this! 😍', timestamptz '2026-11-12 18:40+08'),
    (p1, u[2], 'Booked na! See you in Banaue 🤙', timestamptz '2026-11-15 20:45+08'),
    (p2, u[10], 'Just booked for 1. Excited!', timestamptz '2026-11-21 18:45+08'),
    (p3, v_demo, 'Ang ganda! Next time sama ako 🙌', timestamptz '2026-11-17 08:10+08'),
    (p4, u[5], 'Same batch tayo! See you in December!', timestamptz '2026-10-14 20:02+08'),
    (p4, v_admin, 'Thank you for sharing! 🧡 December slots are still open.', timestamptz '2026-10-15 09:00+08');
  insert into public.feed_reactions (post_id, user_id, emoji, created_at)
  select p.id, x.uid, x.e, p.created_at + interval '2 hours'
    from public.feed_posts p cross join (values (u[1], '❤️'), (u[4], '👍'), (u[6], '😍'), (u[9], '❤️'), (u[11], '🔥')) as x(uid, e)
   where p.status = 'Approved' and p.author_id <> x.uid;
  insert into public.feed_reactions (post_id, user_id, emoji, created_at)
  select p.id, v_demo, '❤️', p.created_at + interval '3 hours' from public.feed_posts p where p.status = 'Approved' and p.author_id <> v_demo;

  -- ── Favorites (the demo joiner) ──
  insert into public.tour_favorites (user_id, tour_id, created_at) values
    (v_demo, t_pagudpud2, now() - interval '6 days'), (v_demo, t_launion, now() - interval '3 days'), (v_demo, t_banaue, now() - interval '1 day'),
    (u[1], t_launion, now() - interval '2 days'), (u[11], t_banaue, now() - interval '5 days');

  -- ── Private tours and tour requests ──
  insert into public.exclusive_requests (user_id, request_type, full_name, contact_number, email, destination, region, group_size,
      preferred_date, preferred_end_date, trip_days, accommodation, budget, tour_type, notes, status, admin_response, reviewed_by, reviewed_at,
      created_at, updated_at, package_details, package_sent_at, downpayment_amount, amount_paid, payment_status, paid_at, downpayment_due_at,
      processed_by, processed_by_name)
  values (u[5], 'exclusive', 'Bea Villanueva', '09211234505', 'bea.villanueva@ibayo-demo.test', 'Tagaytay, Cavite', 'CALABARZON', 8,
      date '2026-12-19', date '2026-12-20', 2, (pg_temp.sym_accom('room'))[1], 40000, 'Family trip', 'For my parents'' 30th anniversary. Two seniors in the group.',
      'Approved', 'Happy anniversary to your parents! Here is your package. We added a cake at dinner. 🎂', v_admin, timestamptz '2026-11-08 15:00+08',
      timestamptz '2026-11-05 20:30+08', timestamptz '2026-11-10 11:00+08',
      jsonb_build_object('title', 'Private: Tagaytay Family Getaway', 'destination', 'Tagaytay, Cavite', 'price', 4800, 'group_size', 8,
        'accommodation_options', to_jsonb(pg_temp.sym_accom('room')),
        'description', 'A slow-paced family weekend in Tagaytay: Sky Ranch, Picnic Grove, a Taal Lake view dinner and a private villa.',
        'inclusions', E'Private van with driver\n1 night private villa\n3 meals (with anniversary cake)\nPicnic Grove and Sky Ranch entrance',
        'exclusions', 'Personal expenses', 'things_to_bring', E'Valid ID\nJacket', 'itinerary', E'Day 1:\n07:00 AM – Pickup in Makati\n10:00 AM – Picnic Grove\n06:00 PM – Anniversary dinner\nDay 2:\n09:00 AM – Sky Ranch\n03:00 PM – Back to Makati',
        'important_note', 'Seniors ride in the front row.', 'start_date', '2026-12-19', 'end_date', '2026-12-20', 'regular_rate', 4300,
        'covered', '["Van rental", "Private villa", "Meals"]'::jsonb, 'pickup_points', '["Makati (Greenbelt 3)"]'::jsonb, 'image_urls', '[]'::jsonb),
      timestamptz '2026-11-08 15:00+08', 19200, 19200, 'Paid', timestamptz '2026-11-09 10:12+08', timestamptz '2026-11-09 15:00+08', v_admin, v_admin_name)
  returning id into r_private;
  insert into public.tours (created_at, title, description, destination, price, duration, group_size, difficulty, inclusions, exclusions, things_to_bring,
                            itinerary, important_note, is_archived, image_urls, start_date, end_date, accommodation_options, departure_time, is_exclusive, exclusive_request_id)
  values (timestamptz '2026-11-08 15:00+08', 'Private: Tagaytay Family Getaway',
          'A slow-paced family weekend in Tagaytay: Sky Ranch, Picnic Grove, a Taal Lake view dinner and a private villa.', 'Tagaytay, Cavite', 4800, '2 Days, 1 Night', 8, 'Easy',
          E'Private van with driver\n1 night private villa\n3 meals (with anniversary cake)\nPicnic Grove and Sky Ranch entrance', 'Personal expenses', E'Valid ID\nJacket',
          E'Day 1:\n07:00 AM – Pickup in Makati\n10:00 AM – Picnic Grove\n06:00 PM – Anniversary dinner\nDay 2:\n09:00 AM – Sky Ranch\n03:00 PM – Back to Makati',
          'Seniors ride in the front row.', false, v_img_mountain, date '2026-12-19', date '2026-12-20', pg_temp.sym_accom('room'), '07:00', true, r_private)
  returning id into t_private;
  update public.exclusive_requests set package_details = package_details || jsonb_build_object('tour_id', t_private) where id = r_private;
  insert into public.tour_rates (tour_id, regular_rate) values (t_private, 4300);
  insert into public.tour_vehicles (tour_id, car_type, plate_number, driver_name, driver_contact, vehicle_color, vehicle_notes, driver_id, van_id)
  select t_private, fv.car_type, fv.plate_number, fd.name, fd.contact, fv.color, fv.notes, fd.id, fv.id
    from public.fleet_drivers fd, public.fleet_vans fv
   where fd.id = d[3] and fv.id = v[3];

  insert into public.exclusive_requests (user_id, request_type, full_name, contact_number, email, destination, region, group_size,
      preferred_date, preferred_end_date, trip_days, accommodation, budget, tour_type, notes, status, created_at, updated_at)
  values
    (v_demo, 'exclusive', (select trim(concat_ws(' ', first_name, last_name)) from public.profiles where id = v_demo),
      coalesce((select phone_number from public.profiles where id = v_demo), '09170000000'), v_demo_email,
      'San Juan, La Union', 'Ilocos Region', 6, date '2027-01-30', date '2027-01-31', 2, (pg_temp.sym_accom('room'))[1], 25000, 'Barkada trip',
      'Surf lessons for beginners, and a sunset dinner by the beach please!', 'Pending', now() - interval '1 day', now() - interval '1 day'),
    (u[10], 'request', 'Rafael Aquino', '09261234510', 'rafael.aquino@ibayo-demo.test', 'Mt. Ugo, Benguet', 'CAR (Cordillera)', 10,
      date '2027-03-19', date '2027-03-20', 2, (pg_temp.sym_accom('camp'))[1], 30000, 'Mountain climb', 'Our hiking club wants to do the Mt. Ugo traverse down to Baguio.', 'Pending',
      now() - interval '3 days', now() - interval '3 days');
  insert into public.exclusive_requests (user_id, request_type, full_name, contact_number, email, destination, region, group_size,
      preferred_date, preferred_end_date, trip_days, accommodation, budget, tour_type, notes, status, admin_response, reviewed_by, reviewed_at, created_at, updated_at)
  values (u[11], 'request', 'Nicole Torres', '09271234511', 'nicole.torres@ibayo-demo.test', 'Pagudpud, Ilocos Norte', 'Ilocos Region', 5,
      date '2026-12-24', date '2026-12-26', 3, (pg_temp.sym_accom('room'))[1], 30000, 'Holiday trip', 'Christmas in Pagudpud with my family.',
      'Rejected', 'Sorry, Nicole. Our vans and guides are fully booked over Christmas. We''d love to plan Pagudpud with you in January!', v_admin,
      timestamptz '2026-11-02 10:00+08', timestamptz '2026-10-30 21:00+08', timestamptz '2026-11-02 10:00+08');

  -- ── Notifications ──
  insert into public.notifications (user_id, title, message, type, is_read, created_at)
  select v_demo, x.t, x.m, x.ty, x.r, x.at from (values
    ('Booking Confirmed 🎉', (select format('Your booking %s for Anawangin Cove Camping (Nov 25–26) is confirmed. See you at Cubao!', booking_number) from public.bookings where id = b_demo_live), 'booking', true, timestamptz '2026-10-28 20:09+08'),
    ('Balance paid', (select format('Thank you! The balance for %s is fully paid.', booking_number) from public.bookings where id = b_demo_live), 'payment', true, timestamptz '2026-11-18 12:00+08'),
    ('Booking Confirmed 🎉', (select format('Your downpayment for %s (Sagada Cave & Sunrise, Dec 11–13) is in. Pay the rest before the trip in My Bookings.', booking_number) from public.bookings where id = b_demo_sagada), 'booking', true, timestamptz '2026-11-09 21:20+08'),
    ('Bandang IBAYO replied to your review', 'Thank you for joining us! Kuya Jun says hi. See you on the next climb! 🏔️', 'review', true, timestamptz '2026-07-22 09:00+08'),
    ('Your trip is on Nov 25 🚐', 'Anawangin Cove Camping: the van leaves Cubao (Araneta City Bus Port) at 3:00 AM on Wednesday. Open Tracking on the day to follow the van.', 'tracking', false, now() - interval '3 hours'),
    ('Balance reminder', (select format('%s: your balance for Sagada Cave & Sunrise is due before December 11.', booking_number) from public.bookings where id = b_demo_sagada), 'payment', false, timestamptz '2026-11-23 09:00+08'),
    ('We got your private tour request', 'Thank you! We''ll send your La Union package within 2 days.', 'general', false, now() - interval '1 day')
  ) as x(t, m, ty, r, at);
  insert into public.notifications (user_id, title, message, type, is_read, created_at)
  select a.id, x.t, x.m, x.ty, x.r, x.at
    from public.profiles a
   cross join (values
    ('Payment to check', (select format('%s sent a GCash receipt for %s (Sagada Cave & Sunrise). Check it in Booking Management.', full_name, booking_number) from public.bookings where id = b_verify), 'payment', false, timestamptz '2026-11-22 20:56+08'),
    ('Cancellation request', (select format('%s asked to cancel %s (Sagada Cave & Sunrise): Schedule conflict at work.', full_name, booking_number) from public.bookings where id = b_cancel), 'cancellation', false, now() - interval '40 minutes'),
    ('New private tour request', 'A joiner asked for a private La Union trip for 6 on Jan 30–31, 2027.', 'general', false, now() - interval '1 day'),
    ('New tour request', 'Rafael Aquino requested a Mt. Ugo climb for 10 on Mar 19–20, 2027.', 'general', false, now() - interval '3 days'),
    ('New Booking Paid Online', (select format('%s booked %s for Mt. Pinatubo Crater Trek (Dec 5).', full_name, booking_number) from public.bookings where tour_id = t_pinatubo and payment_status = 'Complete' order by created_at desc limit 1), 'booking', true, timestamptz '2026-11-22 12:36+08'),
    ('Pickup request', 'Paolo Garcia asked to be picked up at Malolos Crossing for Sagada Cave & Sunrise.', 'general', false, now() - interval '20 hours'),
    ('Weather refunds to send', '2 joiners of Baler Surf Weekend are still waiting for their 50% refund.', 'booking', false, now() - interval '2 days')
   ) as x(t, m, ty, r, at)
   where a.role = 'admin';

  -- ── A message from Bandang IBAYO to the demo joiner ──
  insert into public.admin_messages (user_id, sender_id, source, subject, message, tour_id, emailed, created_at)
  values (v_demo, v_admin, 'tour', 'See you on Wednesday! 🌊',
          'Hi! Just a reminder that the van leaves Cubao at 3:00 AM on November 25. Bring a valid ID, swimwear and a headlamp for the campsite. Message us here if you need anything.',
          t_live::text, false, timestamptz '2026-11-23 10:00+08');

  -- ── System feedback (Reviews → Website Feedback) ──
  insert into public.system_feedback (user_id, ease, booking, payment, tracking, overall, comment, created_at) values
    (v_demo, 5, 5, 5, 5, 5, 'Booking and paying with GCash took less than 2 minutes. Love the live tracking!', timestamptz '2026-10-13 20:00+08'),
    (u[1], 5, 5, 4, 5, 5, 'Very easy to use. I like seeing my pickup point and the van on the map.', timestamptz '2026-07-21 09:00+08'),
    (u[2], 4, 4, 5, 4, 4, 'Smooth overall. A dark mode switch on the login page would be nice.', timestamptz '2026-07-22 13:00+08'),
    (u[3], 5, 5, 5, 4, 5, null, timestamptz '2026-09-15 21:00+08'),
    (u[6], 5, 4, 5, 5, 5, 'The reminders before the trip were really helpful.', timestamptz '2026-08-18 22:00+08'),
    (u[7], 4, 5, 4, 5, 4, 'Getting the weather refund was easy and fast. Thank you!', timestamptz '2026-10-30 10:00+08'),
    (u[9], 5, 5, 5, 5, 5, 'Group chat for the trip is a great idea.', timestamptz '2026-10-14 09:30+08'),
    (u[11], 3, 4, 3, 4, 4, 'Paying by card worked, but I wish I could save my card.', timestamptz '2026-09-16 22:00+08'),
    (u[12], 4, 4, 4, 3, 4, null, timestamptz '2026-09-17 14:00+08');

  -- Triggers back on.
  foreach v_tbl in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_tbl);
  end loop;

  raise notice 'Done: % tours, % bookings, % demo joiners. Demo joiner: %',
    (select count(*) from public.tours), (select count(*) from public.bookings), array_length(u, 1), v_demo_email;
end $$;

commit;
