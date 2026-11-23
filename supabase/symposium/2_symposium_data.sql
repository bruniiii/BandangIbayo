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
--   live trip on Nov 25 (Anawangin Cove, with tracking and group chat), an
--   upcoming trip with a balance to pay, favorites, a private tour request,
--   notifications and a message from Bandang IBAYO.
--
-- What it makes:
--   • 12 demo joiners (they can't log in; their emails end in
--     @ibayo-demo.test, which never receives mail)
--   • 13 tour dates: 6 finished (one cancelled by a typhoon, with refunds),
--     1 happening on Nov 25–26 (live tracking), 6 upcoming (one on sale,
--     one fully booked with a waitlist) + 1 private tour
--   • bookings in every state: paid, downpayment with balance due, balance
--     settled, waiting for payment, payment to check, cancellation request,
--     cancelled, rejected, expired, weather refunds (due and sent)
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
          14, p_diff, p_incl, p_excl, p_bring, p_itin, p_note, p_archived, p_imgs, p_start, p_end, coalesce(p_accom, '{}'), p_dep)
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
--   live          on the Nov 25 trip, checked in   (live_due: still owes the balance)
--   live_wait     on the Nov 25 trip, not picked up yet
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
    case when p_state in ('done', 'live', 'live_due') then v_start + interval '10 minutes' end,
    case when p_state in ('done', 'live', 'live_due') then p_admin end,
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
  v_batanes_desc text := 'Rolling hills, stone houses and the bluest sea in the country. Four days around Batan and Sabtang with a local guide, by van and by falowa boat.';
  v_batanes_incl text := E'Round-trip airport transfers in Batanes\nNorth and South Batan tours\nSabtang day tour with falowa boat\n3 nights homestay\nDaily breakfast\nEnvironmental fees\nLocal guide';
  v_batanes_itin text := E'Day 1:\n08:00 AM – Arrive in Basco, lunch\n01:00 PM – North Batan tour: Valugan Boulder Beach, Vayang Rolling Hills\nDay 2:\n08:00 AM – South Batan tour: Marlboro Country, Rakuh-a-Payaman\nDay 3:\n06:00 AM – Falowa to Sabtang: Chavayan Village\nDay 4:\n09:00 AM – Flight back to Manila';
  v_sagada_desc text := 'Caves, hanging coffins and a sunrise over a sea of clouds at Kiltepan. A relaxed long weekend in the cool mountains of Sagada.';
  v_sagada_incl text := E'Round-trip van from Metro Manila\n2 nights inn accommodation\nSumaguing Cave connection with guide\nHanging coffins and Echo Valley tour\nKiltepan sunrise\nEnvironmental fees';
  v_sagada_itin text := E'Day 0:\n09:00 PM – Meet up at the pickup points\nDay 1:\n09:00 AM – Arrive in Sagada, check in\n01:00 PM – Echo Valley and hanging coffins\nDay 2:\n05:00 AM – Kiltepan sunrise\n09:00 AM – Cave connection\nDay 3:\n08:00 AM – Breakfast and travel back to Manila';
  v_bring text := E'Valid ID\nWater bottle (1 liter)\nRain jacket\nComfortable shoes\nPersonal medicines\nPower bank';
  v_excl text := E'Personal expenses\nTips for guides and drivers\nMeals not listed';
  v_note text := 'Please be at your pickup point 15 minutes early. The van leaves on time. Follow your guide and the Leave No Trace rules.';

  t_pulag1 bigint; t_batanes1 bigint; t_elnido bigint; t_sagada1 bigint; t_baler bigint; t_ulap bigint;
  t_live bigint; t_pinatubo bigint; t_sagada2 bigint; t_batanes2 bigint; t_siargao bigint; t_pulag2 bigint; t_coron bigint; t_private bigint;
  b uuid;
  b_demo_live uuid; b_demo_sagada uuid; b_cancel uuid; b_verify uuid;
  r_private uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  m1 bigint; m2 bigint;
  v_tbl text;
  v_tables text[] := array['tours', 'bookings', 'booking_activity', 'tour_rates', 'tour_expenses', 'tour_expense_lines', 'tour_vehicles',
    'tour_meetups', 'tour_tracking_logs', 'van_locations', 'tour_chat_messages', 'tour_chat_reactions', 'tour_waitlist', 'tour_favorites',
    'reviews', 'review_reactions', 'feed_posts', 'feed_comments', 'feed_reactions', 'exclusive_requests', 'admin_messages',
    'pickup_requests', 'refund_log', 'system_feedback', 'profiles'];
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
  t_batanes1 := pg_temp.sym_tour('Batanes Island Escape', 'Basco, Batanes', date '2026-08-13', date '2026-08-16', 7500, 'Easy', true,
    v_batanes_desc, v_batanes_incl, v_excl || E'\nRound-trip airfare to Basco', v_bring || E'\nSunscreen\nHat', v_batanes_itin, '05:00', v_img_beach, array['Shared room (4 pax)', 'Twin room'], v_note);
  t_elnido := pg_temp.sym_tour('El Nido Island Hopping', 'El Nido, Palawan', date '2026-09-10', date '2026-09-13', 7200, 'Easy', true,
    'Lagoons, limestone cliffs and white-sand beaches. Island hopping Tours A and C with lunch on the boat, plus a free day in town.',
    E'Island hopping Tours A and C\nBoat lunch on both days\n3 nights beach-side inn\nKayak rental at Big Lagoon\nEco-tourism fees\nLocal guide', v_excl || E'\nRound-trip airfare to Puerto Princesa',
    v_bring || E'\nSwimwear and rash guard\nDry bag\nReef-safe sunscreen',
    E'Day 1:\n10:00 AM – Arrive in El Nido, check in\n04:00 PM – Sunset at Las Cabañas\nDay 2:\n08:30 AM – Tour A: Big Lagoon, Small Lagoon, Secret Lagoon\nDay 3:\n08:30 AM – Tour C: Hidden Beach, Matinloc Shrine\nDay 4:\n09:00 AM – Free morning, then travel back',
    '06:00', v_img_beach, array['Shared room (4 pax)', 'Twin room'], v_note);
  t_sagada1 := pg_temp.sym_tour('Sagada Cave & Sunrise', 'Sagada, Mountain Province', date '2026-10-09', date '2026-10-11', 4200, 'Moderate', true,
    v_sagada_desc, v_sagada_incl, v_excl, v_bring || E'\nJacket (it gets cold)', v_sagada_itin, '21:00', v_img_mountain, array['Shared room (4 pax)', 'Couple room'], v_note);
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
    '03:00', v_img_beach, '{}', v_note);
  -- Upcoming
  t_pinatubo := pg_temp.sym_tour('Mt. Pinatubo Crater Trek', 'Capas, Tarlac', date '2026-12-05', date '2026-12-05', 2400, 'Moderate', false,
    'Ride a 4x4 across the lahar fields, then hike to the turquoise crater lake of Mt. Pinatubo.',
    E'Round-trip van from Metro Manila\n4x4 ride (shared)\nGuide and entrance fees\nLunch', v_excl, v_bring || E'\nSunglasses\nFace mask for dust',
    E'Day 1:\n03:00 AM – Pickup at Cubao\n06:00 AM – 4x4 ride across the lahar\n08:00 AM – Hike to the crater\n12:00 PM – Lunch\n06:00 PM – Back in Manila',
    '03:00', v_img_mountain, '{}', v_note);
  update public.tours set sale_starts = date '2026-11-20', sale_ends = date '2026-12-03' where id = t_pinatubo;
  t_sagada2 := pg_temp.sym_tour('Sagada Cave & Sunrise', 'Sagada, Mountain Province', date '2026-12-11', date '2026-12-13', 4200, 'Moderate', false,
    v_sagada_desc, v_sagada_incl, v_excl, v_bring || E'\nJacket (it gets cold)', v_sagada_itin, '21:00', v_img_mountain, array['Shared room (4 pax)', 'Couple room'], v_note);
  t_batanes2 := pg_temp.sym_tour('Batanes Island Escape', 'Basco, Batanes', date '2026-12-27', date '2026-12-30', 7500, 'Easy', false,
    v_batanes_desc, v_batanes_incl, v_excl || E'\nRound-trip airfare to Basco', v_bring || E'\nSunscreen\nHat', v_batanes_itin, '05:00', v_img_beach, array['Shared room (4 pax)', 'Twin room'], v_note);
  t_siargao := pg_temp.sym_tour('Siargao Island Hopping', 'General Luna, Siargao', date '2027-01-14', date '2027-01-17', 7400, 'Easy', false,
    'Naked Island, Daku and Guyam, the Sugba Lagoon and a sunset at Cloud 9. Island life at its best.',
    E'Airport transfers in Siargao\nTri-island hopping with lunch\nSugba Lagoon tour\n3 nights resort stay\nDaily breakfast', v_excl || E'\nRound-trip airfare to Siargao',
    v_bring || E'\nSwimwear\nDry bag', E'Day 1:\n10:00 AM – Arrive, check in\n04:00 PM – Cloud 9 boardwalk sunset\nDay 2:\n08:00 AM – Naked, Daku and Guyam islands\nDay 3:\n07:00 AM – Sugba Lagoon\nDay 4:\n09:00 AM – Check out, travel back',
    '06:00', v_img_beach, array['Shared room (4 pax)', 'Twin room'], v_note);
  t_pulag2 := pg_temp.sym_tour('Mt. Pulag Sea of Clouds', 'Kabayan, Benguet', date '2027-01-23', date '2027-01-24', 3800, 'Hard', false,
    v_pulag_desc, v_pulag_incl, v_excl, v_bring || E'\nWarm jacket and gloves\nHeadlamp', v_pulag_itin, '22:00', v_img_mountain, '{}', v_note);
  t_coron := pg_temp.sym_tour('Coron Island Hopping', 'Coron, Palawan', date '2027-02-11', date '2027-02-14', 7300, 'Easy', false,
    'Kayangan Lake, Twin Lagoon, shipwreck snorkeling and Maquinit Hot Spring in Coron.',
    E'Coron town tour\nUltimate island hopping with lunch\nShipwreck snorkeling\n3 nights inn\nDaily breakfast', v_excl || E'\nRound-trip airfare to Busuanga',
    v_bring || E'\nSwimwear\nSnorkel (or rent there)', E'Day 1:\n11:00 AM – Arrive, town tour, Mt. Tapyas sunset\nDay 2:\n08:00 AM – Kayangan Lake and Twin Lagoon\nDay 3:\n08:00 AM – Shipwreck and reef snorkeling\nDay 4:\n09:00 AM – Travel back',
    '06:00', v_img_beach, array['Shared room (4 pax)', 'Twin room'], v_note);

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
  -- Batanes (Aug)
  b := pg_temp.sym_booking(t_batanes1, v_demo, 2, 'full', 'done', timestamptz '2026-07-02 19:48+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes1, u[6], 2, 'full', 'done', timestamptz '2026-07-05 08:30+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes1, u[7], 3, 'down', 'done', timestamptz '2026-07-08 13:15+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes1, u[8], 2, 'full', 'done', timestamptz '2026-07-15 22:02+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes1, u[9], 1, 'full', 'done', timestamptz '2026-07-19 10:44+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  -- El Nido (Sep)
  b := pg_temp.sym_booking(t_elnido, u[3], 2, 'full', 'done', timestamptz '2026-08-01 16:20+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_elnido, u[10], 2, 'full', 'done', timestamptz '2026-08-06 09:58+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_elnido, u[11], 3, 'down', 'done', timestamptz '2026-08-12 20:31+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_elnido, u[12], 1, 'full', 'done', timestamptz '2026-08-19 07:47+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_elnido, u[1], 2, 'full', 'done', timestamptz '2026-08-21 15:03+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_elnido, u[2], 1, 'full', 'rejected', timestamptz '2026-08-24 12:12+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
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
  -- Batanes (Dec 27): fully booked + waitlist
  b := pg_temp.sym_booking(t_batanes2, u[1], 3, 'down', 'paid', timestamptz '2026-10-20 20:11+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes2, u[4], 2, 'full', 'paid', timestamptz '2026-10-24 09:36+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes2, u[7], 2, 'down', 'settled', timestamptz '2026-10-27 13:02+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes2, u[9], 3, 'full', 'paid', timestamptz '2026-11-01 17:45+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes2, u[10], 2, 'full', 'paid', timestamptz '2026-11-06 21:18+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_batanes2, u[11], 2, 'down', 'paid', timestamptz '2026-11-11 11:27+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  insert into public.tour_waitlist (tour_id, user_id, slots_wanted, created_at) values
    (t_batanes2, u[12], 2, now() - interval '4 days'), (t_batanes2, u[3], 1, now() - interval '2 days');
  -- Siargao, Mt. Pulag (Jan), Coron (Feb)
  b := pg_temp.sym_booking(t_siargao, u[2], 2, 'down', 'paid', timestamptz '2026-11-15 20:40+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_siargao, u[5], 2, 'full', 'paid', timestamptz '2026-11-18 08:25+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag2, u[6], 3, 'down', 'paid', timestamptz '2026-11-19 19:52+08', 'SM North EDSA (The Block entrance)', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_pulag2, u[8], 1, 'full', 'paid', timestamptz '2026-11-21 10:07+08', 'Petron NLEX Balintawak', v_admin, v_admin_name);
  b := pg_temp.sym_booking(t_coron, u[4], 2, 'full', 'paid', timestamptz '2026-11-22 16:31+08', 'Cubao (Araneta City Bus Port)', v_admin, v_admin_name);

  -- ── Expenses (Reports) ──
  perform pg_temp.sym_expenses(t_pulag1, 10500, false, true, v_admin);
  perform pg_temp.sym_expenses(t_batanes1, 6000, false, true, v_admin);
  perform pg_temp.sym_expenses(t_elnido, 6000, true, true, v_admin);
  perform pg_temp.sym_expenses(t_sagada1, 12000, false, true, v_admin);
  perform pg_temp.sym_expenses(t_ulap, 9000, false, true, v_admin);
  perform pg_temp.sym_expenses(t_live, 9000, true, false, v_admin);
  perform pg_temp.sym_expenses(t_pinatubo, 8000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_sagada2, 12000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_batanes2, 6000, false, false, v_admin);
  perform pg_temp.sym_expenses(t_siargao, 6000, true, false, v_admin);
  perform pg_temp.sym_expenses(t_pulag2, 10500, false, false, v_admin);
  perform pg_temp.sym_expenses(t_coron, 6000, true, false, v_admin);

  -- ── Live trip (Nov 25): route, a 4th pickup on the way, where the van is ──
  update public.tours set route = jsonb_build_object(
      'start', jsonb_build_object('name', 'Cubao (Araneta City Bus Port)', 'lat', 14.6197, 'lng', 121.0537),
      'end', jsonb_build_object('name', 'Pundaquit Beach, San Antonio', 'lat', 14.9663, 'lng', 120.0818),
      'coords', '[[121.0537,14.6197],[121.0305,14.6566],[121.0013,14.6612],[120.9610,14.7350],[120.8500,14.8650],[120.6880,15.0350],[120.5650,14.9400],[120.4650,14.8790],[120.2830,14.8780],[120.1500,14.9300],[120.0880,14.9480],[120.0818,14.9663]]'::jsonb)
   where id = t_live;
  insert into public.tour_meetups (tour_id, location_name, scheduled_time, status, note, lat, lng, route_order, minutes_from_start, created_at)
  values (t_live, 'Petron SCTEX Dinalupihan', '5:45 AM', 'DEPARTURE', 'Joshua joins here', 14.8790, 120.4650, 4, 160, timestamptz '2026-10-26 10:00+08');
  update public.tour_meetups set status = 'DEPARTED', arrived_at = timestamptz '2026-11-25 03:00+08' where tour_id = t_live and route_order = 1;
  update public.tour_meetups set status = 'DEPARTED', arrived_at = timestamptz '2026-11-25 03:32+08' where tour_id = t_live and route_order = 2;
  update public.tour_meetups set status = 'CURRENTLY HERE', arrived_at = timestamptz '2026-11-25 03:48+08' where tour_id = t_live and route_order = 3;
  insert into public.van_locations (tour_id, lat, lng, accuracy_m, speed_kmh, heading, updated_at)
  values (t_live, 14.6612, 121.0013, 12, 0, 315, now());
  insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, created_at)
  select t_live, id, location_name, status,
         case route_order when 1 then 'The van left Cubao (Araneta City Bus Port). Have a safe trip!'
                          when 2 then 'Picked up at SM North EDSA. Next: Petron NLEX Balintawak.'
                          else 'The van is at Petron NLEX Balintawak, the last pickup in Metro Manila.' end,
         arrived_at
    from public.tour_meetups where tour_id = t_live and route_order <= 3;

  -- ── Group chats ──
  insert into public.tour_chat_messages (tour_id, user_id, body, kind, created_at) values
    (t_live, v_admin, 'Good evening, everyone! The van leaves Cubao at 3:00 AM sharp. Please bring a valid ID and your swimwear. See you! 🌊', 'announcement', timestamptz '2026-11-24 19:00+08'),
    (t_live, u[5], 'Excited na! Is there a store near the campsite for snacks?', null, timestamptz '2026-11-24 19:12+08'),
    (t_live, v_admin, 'There''s a small sari-sari store at Pundaquit before the boat ride. The campsite only sells water and coffee.', null, timestamptz '2026-11-24 19:20+08'),
    (t_live, v_demo, 'Thank you! We''ll be at Cubao by 2:45 AM 🙌', null, timestamptz '2026-11-24 19:31+08'),
    (t_live, u[7], 'Can I pay my balance tomorrow morning in the van?', null, timestamptz '2026-11-24 20:05+08'),
    (t_live, v_admin, 'Yes, Kristine. You can also pay it online now in My Bookings so you don''t need cash.', null, timestamptz '2026-11-24 20:11+08'),
    (t_live, u[4], 'On the way to Cubao now 🚐', null, timestamptz '2026-11-25 02:40+08'),
    (t_live, v_admin, 'Everyone from Cubao and SM North is on board. Next stop: Petron NLEX Balintawak.', 'announcement', timestamptz '2026-11-25 03:35+08'),
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
    (t_batanes1, u[6], 5, 'Batanes is paradise, and the homestay family was so warm.', timestamptz '2026-08-18 21:05+08', null, null),
    (t_batanes1, u[7], 5, 'Sabtang was the highlight. Thank you for the very detailed itinerary!', timestamptz '2026-08-19 10:20+08',
       'Thank you, Kristine! Sabtang is our favorite too. 💙', timestamptz '2026-08-19 15:00+08'),
    (t_batanes1, u[8], 4, 'Beautiful place. The wind on the Sabtang boat ride was strong, but the crew was careful.', timestamptz '2026-08-20 18:44+08', null, null),
    (t_elnido, u[3], 5, 'Crystal-clear lagoons and great boat lunches. 10/10!', timestamptz '2026-09-15 20:00+08', null, null),
    (t_elnido, u[10], 4, 'Very fun! Tour C was more crowded than Tour A.', timestamptz '2026-09-16 09:12+08', null, null),
    (t_elnido, u[11], 5, 'My first trip with Bandang IBAYO and definitely not the last.', timestamptz '2026-09-16 21:47+08', null, null),
    (t_elnido, u[12], 3, 'Good tour but the inn was far from the beach. Hope you find a closer one next time.', timestamptz '2026-09-17 13:30+08',
       'Thanks for the honest feedback, Joshua. We already found a beach-side inn for the next El Nido dates.', timestamptz '2026-09-18 10:00+08'),
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
    (v_admin, 'NEW DATES: Siargao Island Hopping on January 14–17, 2027! 🏝️ Naked Island, Sugba Lagoon and the Cloud 9 sunset. Book now on Explore Tours.', null, 'tour', t_siargao,
       timestamptz '2026-11-12 18:00+08', jsonb_build_array(jsonb_build_object('url', '/hero-elnido.webp', 'type', 'image')), 'Approved'),
    (v_admin, 'Mt. Pinatubo Crater Trek is ON SALE until December 3! 🌋 Limited slots for December 5.', null, 'tour', t_pinatubo,
       timestamptz '2026-11-20 12:00+08', jsonb_build_array(jsonb_build_object('url', '/nature-bg.webp', 'type', 'image')), 'Approved'),
    (u[1], 'Throwback to our Mt. Ulap hike! ⛰️ Thank you Bandang IBAYO for another smooth trip.', null, 'post', null,
       timestamptz '2026-11-16 21:15+08', jsonb_build_array(jsonb_build_object('url', '/nature-bg.webp', 'type', 'image')), 'Approved'),
    (v_demo, 'Sagada sunrise from Kiltepan 🌄 Still dreaming about it. Who''s joining the December batch?', null, 'post', null,
       timestamptz '2026-10-14 19:40+08', jsonb_build_array(jsonb_build_object('url', '/hero-elnido.webp', 'type', 'image')), 'Approved'),
    (u[3], 'El Nido lagoons were so blue they looked fake 😍', null, 'post', null,
       timestamptz '2026-09-18 13:00+08', jsonb_build_array(jsonb_build_object('url', '/og-image.jpg', 'type', 'image')), 'Approved'),
    (u[12], 'Anyone selling a used tent? Looking for one for the Anawangin trip.', null, 'post', null,
       timestamptz '2026-11-23 09:30+08', '[]'::jsonb, 'Pending');
  select id into p1 from public.feed_posts where tour_id = t_siargao;
  select id into p2 from public.feed_posts where tour_id = t_pinatubo;
  select id into p3 from public.feed_posts where author_id = u[1];
  select id into p4 from public.feed_posts where author_id = v_demo;
  insert into public.feed_comments (post_id, user_id, content, created_at) values
    (p1, u[11], 'Saving up for this! 😍', timestamptz '2026-11-12 18:40+08'),
    (p1, u[2], 'Booked na! See you in Siargao 🤙', timestamptz '2026-11-15 20:45+08'),
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
    (v_demo, t_batanes2, now() - interval '6 days'), (v_demo, t_coron, now() - interval '3 days'), (v_demo, t_siargao, now() - interval '1 day'),
    (u[1], t_coron, now() - interval '2 days'), (u[11], t_siargao, now() - interval '5 days');

  -- ── Private tours and tour requests ──
  insert into public.exclusive_requests (user_id, request_type, full_name, contact_number, email, destination, region, group_size,
      preferred_date, preferred_end_date, trip_days, accommodation, budget, tour_type, notes, status, admin_response, reviewed_by, reviewed_at,
      created_at, updated_at, package_details, package_sent_at, downpayment_amount, amount_paid, payment_status, paid_at, downpayment_due_at,
      processed_by, processed_by_name)
  values (u[5], 'exclusive', 'Bea Villanueva', '09211234505', 'bea.villanueva@ibayo-demo.test', 'Tagaytay, Cavite', 'CALABARZON', 8,
      date '2026-12-19', date '2026-12-20', 2, 'Private house / villa', 40000, 'Family trip', 'For my parents'' 30th anniversary. Two seniors in the group.',
      'Approved', 'Happy anniversary to your parents! Here is your package. We added a cake at dinner. 🎂', v_admin, timestamptz '2026-11-08 15:00+08',
      timestamptz '2026-11-05 20:30+08', timestamptz '2026-11-10 11:00+08',
      jsonb_build_object('title', 'Private: Tagaytay Family Getaway', 'destination', 'Tagaytay, Cavite', 'price', 4800, 'group_size', 8,
        'accommodation_options', '["Private house / villa"]'::jsonb,
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
          'Seniors ride in the front row.', false, v_img_mountain, date '2026-12-19', date '2026-12-20', array['Private house / villa'], '07:00', true, r_private)
  returning id into t_private;
  update public.exclusive_requests set package_details = package_details || jsonb_build_object('tour_id', t_private) where id = r_private;
  insert into public.tour_rates (tour_id, regular_rate) values (t_private, 4300);

  insert into public.exclusive_requests (user_id, request_type, full_name, contact_number, email, destination, region, group_size,
      preferred_date, preferred_end_date, trip_days, accommodation, budget, tour_type, notes, status, created_at, updated_at)
  values
    (v_demo, 'exclusive', (select trim(concat_ws(' ', first_name, last_name)) from public.profiles where id = v_demo),
      coalesce((select phone_number from public.profiles where id = v_demo), '09170000000'), v_demo_email,
      'San Juan, La Union', 'Ilocos Region', 6, date '2027-01-30', date '2027-01-31', 2, 'Beach resort', 25000, 'Barkada trip',
      'Surf lessons for beginners, and a sunset dinner by the beach please!', 'Pending', now() - interval '1 day', now() - interval '1 day'),
    (u[10], 'request', 'Rafael Aquino', '09261234510', 'rafael.aquino@ibayo-demo.test', 'Mt. Apo, Davao', 'Davao Region', 10,
      date '2027-03-18', date '2027-03-21', 4, 'Camping', 60000, 'Mountain climb', 'Our hiking club wants to climb the highest peak in the country.', 'Pending',
      now() - interval '3 days', now() - interval '3 days');
  insert into public.exclusive_requests (user_id, request_type, full_name, contact_number, email, destination, region, group_size,
      preferred_date, preferred_end_date, trip_days, accommodation, budget, tour_type, notes, status, admin_response, reviewed_by, reviewed_at, created_at, updated_at)
  values (u[11], 'request', 'Nicole Torres', '09271234511', 'nicole.torres@ibayo-demo.test', 'Panglao, Bohol', 'Central Visayas', 5,
      date '2026-12-24', date '2026-12-26', 3, 'Beach resort', 30000, 'Holiday trip', 'Christmas in Bohol with my family.',
      'Rejected', 'Sorry, Nicole. Our vans and guides are fully booked over Christmas. We''d love to plan Bohol with you in January!', v_admin,
      timestamptz '2026-11-02 10:00+08', timestamptz '2026-10-30 21:00+08', timestamptz '2026-11-02 10:00+08');

  -- ── Notifications ──
  insert into public.notifications (user_id, title, message, type, is_read, created_at)
  select v_demo, x.t, x.m, x.ty, x.r, x.at from (values
    ('Booking Confirmed 🎉', (select format('Your booking %s for Anawangin Cove Camping (Nov 25–26) is confirmed. See you at Cubao!', booking_number) from public.bookings where id = b_demo_live), 'booking', true, timestamptz '2026-10-28 20:09+08'),
    ('Balance paid', (select format('Thank you! The balance for %s is fully paid.', booking_number) from public.bookings where id = b_demo_live), 'payment', true, timestamptz '2026-11-18 12:00+08'),
    ('Booking Confirmed 🎉', (select format('Your downpayment for %s (Sagada Cave & Sunrise, Dec 11–13) is in. Pay the rest before the trip in My Bookings.', booking_number) from public.bookings where id = b_demo_sagada), 'booking', true, timestamptz '2026-11-09 21:20+08'),
    ('Bandang IBAYO replied to your review', 'Thank you for joining us! Kuya Jun says hi. See you on the next climb! 🏔️', 'review', true, timestamptz '2026-07-22 09:00+08'),
    ('Pickup starts tomorrow 🚐', 'Anawangin Cove Camping: the van leaves Cubao (Araneta City Bus Port) at 3:00 AM. Open Tracking to follow the van.', 'tracking', false, timestamptz '2026-11-24 18:00+08'),
    ('The van left Cubao', 'Anawangin Cove Camping is on the way. Open Tracking to see where the van is.', 'tracking', false, timestamptz '2026-11-25 03:01+08'),
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
    ('New tour request', 'Rafael Aquino requested a Mt. Apo climb for 10 on Mar 18–21, 2027.', 'general', false, now() - interval '3 days'),
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
