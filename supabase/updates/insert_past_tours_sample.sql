-- ═══════════════════════════════════════════════════════════════════════
-- SAMPLE PAST TOURS  (run after insert_real_tours.sql)
--
-- Fills the site with finished trips so Reviews, Tracking and the admin
-- Reports / Sales / Tour Income pages have something to show:
--   • 10 sample joiner accounts (emails end in @sample.bandangibayo.com)
--   • 10 past tour dates (June to October 2026), copied from the real tours
--     (Mt. Pulag, Mt. Ulap, Mt. Batulao, Mt. Pinatubo, Mt. Daraitan,
--     Anawangin & Nagsasa), already in Tour Archive
--   • paid bookings on each date (full payment and settled downpayments, a few
--     cancellations), checked in on the tour day
--   • reviews from the joiners (some with a reply from Bandang IBAYO)
--   • tracking history: the van and driver, every pickup stop arrived, and
--     the live updates of the trip
--
-- The sample joiners can log in to see the joiner side:
--   email:    any of the emails below      password: SampleJoiner#2026
--
-- Remove it all later with remove_past_tours_sample.sql.
-- Safe to run again: anything already there is skipped.
-- Run it in the Supabase SQL Editor: paste it all, click Run.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- A date and time in the Philippines (so 8:30 PM shows as 8:30 PM on the site).
create function pg_temp.ph(p timestamp) returns timestamptz language sql immutable
  as $fn$ select p at time zone 'Asia/Manila' $fn$;

do $$
declare
  -- Sample joiners: first, last, email, phone, birthday, city, province, joined
  joiners constant text[][] := array[
    array['Andrea', 'Santos',    'andrea.santos@sample.bandangibayo.com',    '+639171234501', '1998-03-14', 'Quezon City',      'Metro Manila', '2026-04-02'],
    array['Miguel', 'Reyes',     'miguel.reyes@sample.bandangibayo.com',     '+639171234502', '1995-07-22', 'Makati',           'Metro Manila', '2026-04-10'],
    array['Bea',    'Cruz',      'bea.cruz@sample.bandangibayo.com',         '+639171234503', '2000-11-05', 'Pasig',            'Metro Manila', '2026-04-18'],
    array['Paolo',  'Garcia',    'paolo.garcia@sample.bandangibayo.com',     '+639171234504', '1993-01-30', 'Antipolo',         'Rizal',        '2026-05-03'],
    array['Kristine','Mendoza',  'kristine.mendoza@sample.bandangibayo.com', '+639171234505', '1999-09-17', 'Taguig',           'Metro Manila', '2026-05-12'],
    array['Jericho','Bautista',  'jericho.bautista@sample.bandangibayo.com', '+639171234506', '1997-06-08', 'Caloocan',         'Metro Manila', '2026-05-25'],
    array['Nicole', 'Villanueva','nicole.villanueva@sample.bandangibayo.com','+639171234507', '2001-02-19', 'Bacoor',           'Cavite',       '2026-06-04'],
    array['Carlo',  'Ramos',     'carlo.ramos@sample.bandangibayo.com',      '+639171234508', '1994-12-01', 'Mandaluyong',      'Metro Manila', '2026-06-20'],
    array['Trisha', 'Aquino',    'trisha.aquino@sample.bandangibayo.com',    '+639171234509', '1996-08-27', 'San Pedro',        'Laguna',       '2026-07-09'],
    array['Rafael', 'Navarro',   'rafael.navarro@sample.bandangibayo.com',   '+639171234510', '1992-04-11', 'Marikina',         'Metro Manila', '2026-07-28']
  ];

  -- Past dates: tour title (as in Tour Management), start date
  past_dates constant text[][] := array[
    array['Mt. Ulap Eco-Trail',               '2026-06-13'],
    array['Anawangin & Nagsasa Cove Camping', '2026-06-27'],
    array['Mt. Pulag (Ambangeg Trail)',       '2026-07-11'],
    array['Mt. Batulao (New Trail)',          '2026-07-25'],
    array['Mt. Pinatubo Crater Lake',         '2026-08-08'],
    array['Mt. Ulap Eco-Trail',               '2026-08-22'],
    array['Mt. Daraitan & Tinipak River',     '2026-09-05'],
    array['Mt. Pulag (Ambangeg Trail)',       '2026-09-19'],
    array['Mt. Pinatubo Crater Lake',         '2026-10-10'],
    array['Anawangin & Nagsasa Cove Camping', '2026-10-24']
  ];

  comments constant text[] := array[
    'Sobrang sulit! The guides were patient and the itinerary was followed well. Will join again!',
    'First climb ko ito and I felt safe the whole time. Thank you Bandang IBAYO!',
    'Ang ganda ng view sa taas. Organized from assembly until we got back to Manila.',
    'Great group, great vibes. Van was clean and the driver was careful.',
    'Medyo traffic pauwi pero overall a really good trip. Worth every peso.',
    'The coordinators kept us updated the whole way. Ang saya ng socials!',
    'Sea of clouds was unreal. Thank you for the photos too!',
    'Very helpful guides, lalo na sa mga first-timers. Highly recommended.',
    'Smooth registration and briefing. Next time I''ll bring more friends.',
    'Nakakapagod pero sulit. The tracking updates helped my family know where I was.',
    'Beautiful place and well-planned trip. Sana may more dates next month!',
    'Good value for the price. Clear instructions before the trip.'
  ];
  ratings constant int[] := array[5, 5, 4, 5, 4, 5, 5, 4, 5, 3, 5, 4];
  replies constant text[] := array[
    'Salamat sa pagsama! See you on the next adventure.',
    'Thank you for the kind words! Hope to climb with you again soon.',
    'Maraming salamat! We''re glad you enjoyed the trip.'
  ];
  cancel_reasons constant text[] := array['Schedule conflict / change of plans', 'Personal or family emergency', 'Health reasons'];
  drivers constant text[][] := array[
    array['Toyota Hiace GL Grandia', 'NAB 4521', 'Mang Rolly Dizon',  '+639181112201', 'White'],
    array['Nissan NV350 Urvan',      'DAF 7834', 'Kuya Ben Salazar',  '+639181112202', 'Silver'],
    array['Toyota Hiace Super Grandia','NCS 2290','Mang Edwin Tolentino','+639181112203','Pearl White']
  ];

  v_pw text := extensions.crypt('SampleJoiner#2026', extensions.gen_salt('bf'));
  v_user_ids uuid[] := '{}';
  v_uid uuid;
  v_src public.tours%rowtype;
  v_tour_id bigint;
  v_start date;
  v_end date;
  v_days int;
  v_booking_id bigint;
  v_created timestamptz;
  v_slots int;
  v_total numeric;
  v_paid numeric;
  v_method text;
  v_cancel boolean;
  v_pickup text;
  v_pickups text[];
  v_who int;
  v_seats int;
  v_review_no int := 0;
  v_stop record;
  v_stop_no int;
  v_drv text[];
  v_d int;
  v_times text[] := array['9:00 PM', '9:45 PM', '10:30 PM'];
  v_companions jsonb;
  i int;
  k int;
begin
  -- Bookings made here aren't written to each booking's activity log.
  perform set_config('app.skip_activity_log', 'on', true);

  -- 1. Sample joiners (log-in ready, email already verified).
  for i in 1 .. array_length(joiners, 1) loop
    v_uid := (select id from auth.users where lower(email) = lower(joiners[i][3]));
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        joiners[i][3], v_pw, joiners[i][8]::timestamptz,
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('first_name', joiners[i][1], 'last_name', joiners[i][2]),
        joiners[i][8]::timestamptz, joiners[i][8]::timestamptz,
        '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_uid::text, v_uid,
              jsonb_build_object('sub', v_uid::text, 'email', joiners[i][3], 'email_verified', true),
              'email', joiners[i][8]::timestamptz, joiners[i][8]::timestamptz, joiners[i][8]::timestamptz);
    end if;

    -- Their profile (made by the sign-up trigger): full details, joined on the date above.
    insert into public.profiles (id, email, role) values (v_uid, joiners[i][3], 'joiner')
      on conflict (id) do nothing;
    update public.profiles set
      email = joiners[i][3],
      username = lower(joiners[i][1] || '.' || joiners[i][2]),
      first_name = joiners[i][1], last_name = joiners[i][2],
      phone_number = joiners[i][4],
      date_of_birth = joiners[i][5]::date,
      city_municipality = joiners[i][6], province = joiners[i][7],
      address = joiners[i][6] || ', ' || joiners[i][7],
      emergency_contact_name = 'Parent of ' || joiners[i][1],
      emergency_contact_number = '+63918' || lpad((7000000 + i)::text, 7, '0'),
      created_at = joiners[i][8]::timestamptz
    where id = v_uid;
    v_user_ids := v_user_ids || v_uid;
  end loop;

  -- 2. Past tour dates, with bookings, reviews and tracking.
  for i in 1 .. array_length(past_dates, 1) loop
    -- (Written as  x := (select ...)  so the SQL Editor doesn't mistake it for a new table.)
    v_src := (select t from public.tours t
     where t.title = past_dates[i][1] and not coalesce(t.is_archived, false)
     order by t.start_date limit 1);
    if v_src.id is null then
      raise notice 'Skipped % on %: run insert_real_tours.sql first.', past_dates[i][1], past_dates[i][2];
      continue;
    end if;
    v_start := past_dates[i][2]::date;
    v_days := greatest(1, coalesce(nullif(regexp_replace(coalesce(v_src.duration, '1'), '\D', '', 'g'), '')::int, 1));
    v_end := v_start + (v_days - 1);

    if exists (select 1 from public.tours where title = v_src.title and start_date = v_start) then
      raise notice 'Skipped % on % (already there)', v_src.title, v_start;
      continue;
    end if;

    insert into public.tours (
      title, destination, duration, price, group_size, difficulty, accommodation_options,
      description, inclusions, exclusions, itinerary, things_to_bring, important_note,
      image_urls, start_date, end_date, is_archived
    ) values (
      v_src.title, v_src.destination, v_src.duration, v_src.price, v_src.group_size, v_src.difficulty, v_src.accommodation_options,
      v_src.description, v_src.inclusions, v_src.exclusions, v_src.itinerary, v_src.things_to_bring, v_src.important_note,
      v_src.image_urls, v_start, v_end, true
    );
    v_tour_id := (select max(id) from public.tours where title = v_src.title and start_date = v_start);

    insert into public.tour_rates (tour_id, regular_rate)
      select v_tour_id, regular_rate from public.tour_rates where tour_id = v_src.id
      on conflict (tour_id) do nothing;
    insert into public.tour_expenses (tour_id, van_rent, tour_guide, bag_tag, others)
      select v_tour_id, van_rent, tour_guide, bag_tag, others from public.tour_expenses where tour_id = v_src.id
      on conflict (tour_id) do nothing;

    -- Pickup stops, all reached on the night before the tour.
    v_stop_no := 0;
    for v_stop in select location_name from public.tour_meetups where tour_id = v_src.id order by id loop
      v_stop_no := v_stop_no + 1;
      insert into public.tour_meetups (tour_id, location_name, scheduled_time, status, note, created_at)
      values (v_tour_id, v_stop.location_name, v_times[least(v_stop_no, 3)], 'ARRIVED', '', (v_start - 30)::timestamptz);
    end loop;
    v_pickups := array(select location_name from public.tour_meetups where tour_id = v_tour_id order by id);

    -- The van and driver.
    v_d := (i - 1) % 3 + 1;
    v_drv := array[drivers[v_d][1], drivers[v_d][2], drivers[v_d][3], drivers[v_d][4], drivers[v_d][5]];
    insert into public.tour_vehicles (tour_id, car_type, plate_number, driver_name, driver_contact, vehicle_color, vehicle_notes)
    values (v_tour_id, v_drv[1], v_drv[2], v_drv[3], v_drv[4], v_drv[5], 'With Bandang IBAYO sticker on the windshield');

    -- Live updates of the trip (Day 0 night, as the van picked everyone up).
    v_stop_no := 0;
    for v_stop in select id, location_name, scheduled_time from public.tour_meetups where tour_id = v_tour_id order by id loop
      v_stop_no := v_stop_no + 1;
      insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note, created_at)
      values
        (v_tour_id, v_stop.id, v_stop.location_name, 'CURRENTLY HERE',
         format('En Route: Driver %s is heading to [%s]. ETA: %s', v_drv[3], v_stop.location_name, v_stop.scheduled_time), '',
         pg_temp.ph((v_start - 1) + time '20:30' + make_interval(mins => (v_stop_no - 1) * 45))),
        (v_tour_id, v_stop.id, v_stop.location_name, 'ARRIVED',
         format('Arrived: Vehicle (%s) arrived at [%s]. Joiners please board now.', v_drv[2], v_stop.location_name), '',
         pg_temp.ph((v_start - 1) + time '21:00' + make_interval(mins => (v_stop_no - 1) * 45)));
    end loop;

    -- Bookings: 4 to 5 joiners per date, 1 to 3 slots each, a cancellation now and then.
    v_seats := 0;
    for k in 1 .. 4 + (i % 2) loop
      v_who := ((i * 3 + k * 2) % array_length(v_user_ids, 1)) + 1;
      -- Each joiner at most once per date.
      continue when exists (select 1 from public.bookings where tour_id = v_tour_id and user_id = v_user_ids[v_who]);
      v_slots := 1 + ((i + k) % 3);
      exit when v_seats + v_slots > coalesce(v_src.group_size, 14);
      v_cancel := (k = 3 and i % 3 = 0);
      v_method := case when (i + k) % 2 = 0 then 'Full Payment' else 'Downpayment' end;
      v_total := v_src.price * v_slots;
      v_paid := case when v_cancel and v_method = 'Downpayment' then round(v_total / 2, 2) else v_total end;
      v_created := pg_temp.ph((v_start - (12 + k * 5)) + time '19:15' + make_interval(mins => k * 37));
      v_pickup := v_pickups[(k - 1) % greatest(array_length(v_pickups, 1), 1) + 1];
      v_companions := '[]'::jsonb;
      for v_who_extra in 2 .. v_slots loop
        v_companions := v_companions || jsonb_build_array(jsonb_build_object(
          'full_name', (array['Jasmine Lim', 'Mark Dela Cruz', 'Patricia Uy', 'Josh Fernandez', 'Ella Mercado'])[((i + k + v_who_extra) % 5) + 1],
          'contact_number', '+63927' || lpad((1000000 + i * 100 + k * 10 + v_who_extra)::text, 7, '0')));
      end loop;

      insert into public.bookings (
        tour_id, user_id, booking_number, full_name, email, contact_number, slots_booked,
        total_price, amount_paid, downpayment_amount, payment_method, payment_status, booking_status,
        balance_settled, cancellation_reason, pickup_point, companions,
        paid_online_at, checked_in_at, created_at
      ) values (
        v_tour_id, v_user_ids[v_who],
        'BK-' || to_char(v_created at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
        joiners[v_who][1] || ' ' || joiners[v_who][2], joiners[v_who][3], joiners[v_who][4], v_slots,
        v_total, v_paid, case when v_method = 'Downpayment' then round(v_total / 2, 2) end,
        v_method, 'Complete', case when v_cancel then 'Cancelled' else 'Completed' end,
        v_method = 'Downpayment' and not v_cancel,
        case when v_cancel then cancel_reasons[(i % 3) + 1] end,
        v_pickup, v_companions,
        v_created + interval '3 minutes',
        case when v_cancel then null else pg_temp.ph((v_start - 1) + time '21:05') end,
        v_created
      );
      v_booking_id := (select max(id) from public.bookings where tour_id = v_tour_id and user_id = v_user_ids[v_who]);
      if not v_cancel then
        v_seats := v_seats + v_slots;
      else
        update public.bookings set cancellation_requested_at = v_created + interval '2 days' where id = v_booking_id;
      end if;

      -- Most joiners left a review a day or two after the trip.
      if not v_cancel and (i + k) % 4 <> 0 then
        v_review_no := v_review_no + 1;
        insert into public.reviews (tour_id, user_id, rating, comment, created_at, admin_reply)
        values (v_tour_id, v_user_ids[v_who],
                ratings[(v_review_no - 1) % 12 + 1],
                comments[(v_review_no - 1) % 12 + 1],
                pg_temp.ph((v_end + 1 + (k % 2)) + time '10:00' + make_interval(mins => k * 23)),
                case when v_review_no % 3 = 1 then replies[(v_review_no / 3) % 3 + 1] end);
      end if;
    end loop;

    -- The tour's full trip finished.
    insert into public.tour_tracking_logs (tour_id, location_name, status, display_text, note, created_at)
    values (v_tour_id, 'Greenfield', 'ARRIVED', 'Trip completed: Everyone is back in Manila. Thank you for joining!', '',
            pg_temp.ph(v_end + time '23:30'));

    raise notice 'Added % on % (% pax)', v_src.title, v_start, v_seats;
  end loop;

  -- Notifications the triggers sent while adding the samples (new joiner alerts,
  -- review replies) would only clutter the bells: remove them.
  delete from public.notifications where created_at >= now();
end $$;

-- What was added:
select t.title, to_char(t.start_date, 'Mon DD, YYYY') as tour_date,
       count(b.id) filter (where b.booking_status <> 'Cancelled') as bookings,
       coalesce(sum(b.slots_booked) filter (where b.booking_status <> 'Cancelled'), 0) as pax,
       coalesce(sum(b.amount_paid), 0) as collected,
       (select count(*) from public.reviews r where r.tour_id = t.id) as reviews
from public.tours t
left join public.bookings b on b.tour_id = t.id
where t.end_date < current_date
group by t.id order by t.start_date;
