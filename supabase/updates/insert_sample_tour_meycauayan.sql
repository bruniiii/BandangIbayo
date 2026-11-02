-- ═══════════════════════════════════════════════════════════════════════
-- SAMPLE TOUR: All Souls' Day Pilgrimage — San Isidro Labrador Parish,
-- Malhacan, Meycauayan, Bulacan · Nov 2, 2026 (day trip)
--
-- From San Fernando, Pampanga down NLEX, with pickup points on the way:
--   1. SM City Pampanga, San Fernando        6:00 AM (the van leaves)
--   2. Petron NLEX San Simon (southbound)    6:15 AM
--   3. Shell NLEX Marilao (southbound)       6:50 AM
-- Joiner Rate ₱1,500, Regular Rate ₱1,000, Van ₱15,000, Guide ₱1,300,
-- Bag Tag ₱260. Posted on the Community Feed like a new tour.
--
-- Maps and tracking: the van's route, the stops' places on the map and
-- their ETAs are filled in (when those updates are installed). The places
-- are close approximations: open the tour in Tour Management → Edit →
-- The Van's Route → Find the Route to get the exact road, then Save.
-- Photos aren't included: add them in Tour Management → Edit.
--
-- Safe to run again: skipped if a tour with this title is already there.
-- Only one tour per day: if another tour already uses Nov 2, the SQL Editor
-- says so — move or archive that tour first.
-- Run it in the Supabase SQL Editor: paste it all, click Run.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_title constant text := 'All Souls'' Day Pilgrimage: San Isidro Labrador Parish';
  v_id bigint;
  v_admin uuid;
  v_img_type text;
  v_has_status boolean;
  v_has_geo boolean;
  v_has_route boolean;
  v_has_departure boolean;
  v_stop record;
begin
  if exists (select 1 from public.tours where lower(title) = lower(v_title) and not coalesce(is_archived, false)) then
    raise notice 'Skipped % (already there)', v_title;
    return;
  end if;

  -- Which updates are installed (written as x := (select …) for the SQL Editor).
  v_img_type := (select data_type from information_schema.columns
                  where table_schema = 'public' and table_name = 'tours' and column_name = 'image_urls');
  v_has_status := exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'tour_meetups' and column_name = 'status');
  v_has_geo := exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'tour_meetups' and column_name = 'minutes_from_start');
  v_has_route := exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'tours' and column_name = 'route');
  v_has_departure := exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'tours' and column_name = 'departure_time');

  insert into public.tours (
    title, destination, duration, price, group_size, difficulty, accommodation_options,
    description, inclusions, exclusions, itinerary, things_to_bring, important_note,
    start_date, end_date, sale_starts, sale_ends, is_archived
  ) values (
    v_title, 'Malhacan, Meycauayan, Bulacan', '1 Day', 1500, 14, 'Easy', array[]::text[],
    'A half-day pilgrimage for All Souls'' Day to the San Isidro Labrador Parish in Malhacan, Meycauayan, Bulacan — the patron saint of farmers. Join the morning Mass, pray for our departed loved ones, and visit the old parish church, then shop for Meycauayan''s famous gold jewelry and leather goods before heading home.
Start: San Fernando, Pampanga (via NLEX)
Travel time: about 1 hour 15 minutes each way
Activity level: Easy (no hiking)',
    E'Van Roundtrip (aircon)\nToll Fees (NLEX)\nParking Fee\nDriver''s Meal\nTour Coordinator\nMass offering (shared)',
    E'Food\nCandles and flowers\nSouvenirs/ Pasalubong\nNot Mentioned Above',
    E'Day 1:\n05:30am - Assembly at SM City Pampanga, San Fernando\n06:00am - ETD to Meycauayan via NLEX\n06:15am - Pickup at Petron NLEX San Simon (southbound)\n06:50am - Pickup at Shell NLEX Marilao (southbound)\n07:15am - ETA San Isidro Labrador Parish, Malhacan\n07:30am - All Souls'' Day Mass\n08:45am - Breakfast (Own account)\n09:45am - Visit the old church, candle lighting and prayers for the departed\n10:45am - Meycauayan jewelry and leather shops (Own account)\n12:00nn - Lunch (Own account)\n01:15pm - ETD to Pampanga\n02:45pm - ETA SM City Pampanga',
    E'Water Bottle\nCandles (optional)\nUmbrella (sun or rain)\nComfortable shoes\nPower Bank\nID card\nCash for pasalubong\nFace mask',
    E'Please wear modest clothes for the church (no sleeveless tops or short shorts).\n\nThis Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.\n\nAll Souls'' Day traffic can be heavy near cemeteries: please be at your pickup point on time.',
    date '2026-11-02', date '2026-11-02', null, null, false
  );
  v_id := (select max(id) from public.tours where title = v_title and start_date = date '2026-11-02');

  -- No photos yet (an empty list, whatever the column's type).
  execute format('update public.tours set image_urls = %L where id = $1',
                 case when v_img_type = 'jsonb' then '[]' else '{}' end) using v_id;

  -- The van's route on the map (approximate NLEX line) and when it leaves.
  if v_has_route then
    execute 'update public.tours set route = $2 where id = $1' using v_id, jsonb_build_object(
      'start', jsonb_build_object('name', 'SM City Pampanga, San Fernando', 'lat', 15.0547, 'lng', 120.6993),
      'end', jsonb_build_object('name', 'San Isidro Labrador Parish, Malhacan, Meycauayan', 'lat', 14.7563, 'lng', 120.9442),
      'distance_km', 58, 'duration_min', 75,
      'coords', '[[120.6993,15.0547],[120.7035,15.0352],[120.7400,15.0120],[120.7780,14.9960],[120.8160,14.9420],[120.8480,14.8990],[120.9030,14.8520],[120.9320,14.8080],[120.9530,14.7700],[120.9610,14.7480],[120.9520,14.7520],[120.9442,14.7563]]'::jsonb
    );
  end if;
  if v_has_departure then
    execute 'update public.tours set departure_time = $2 where id = $1' using v_id, '6:00 AM';
  end if;

  insert into public.tour_rates (tour_id, regular_rate) values (v_id, 1000)
    on conflict (tour_id) do update set regular_rate = excluded.regular_rate;
  insert into public.tour_expenses (tour_id, van_rent, tour_guide, bag_tag, others)
    values (v_id, 15000, 1300, 260, '[{"name": "NLEX toll (roundtrip)", "amount": 900}, {"name": "Mass offering", "amount": 500}]'::jsonb)
    on conflict (tour_id) do update set van_rent = excluded.van_rent, tour_guide = excluded.tour_guide,
      bag_tag = excluded.bag_tag, others = excluded.others;

  -- Pickup points, in the order the van reaches them, with their ETAs.
  for v_stop in
    select * from (values
      (1, 'SM City Pampanga, San Fernando', '6:00 AM', 15.0547, 120.6993, 0),
      (2, 'Petron NLEX San Simon (southbound)', '6:15 AM', 14.9960, 120.7780, 15),
      (3, 'Shell NLEX Marilao (southbound)', '6:50 AM', 14.7700, 120.9530, 50)
    ) as s(ord, name, eta, lat, lng, mins)
  loop
    if v_has_geo then
      execute 'insert into public.tour_meetups (tour_id, location_name, scheduled_time, status, lat, lng, route_order, minutes_from_start)
               values ($1, $2, $3, ''DEPARTURE'', $4, $5, $6, $7)'
        using v_id, v_stop.name, v_stop.eta, v_stop.lat, v_stop.lng, v_stop.ord, v_stop.mins;
    elsif v_has_status then
      execute 'insert into public.tour_meetups (tour_id, location_name, scheduled_time, status) values ($1, $2, $3, ''DEPARTURE'')'
        using v_id, v_stop.name, v_stop.eta;
    else
      insert into public.tour_meetups (tour_id, location_name, scheduled_time) values (v_id, v_stop.name, v_stop.eta);
    end if;
  end loop;

  -- "New tour posted" on the Community Feed, from the main admin.
  v_admin := (select id from public.profiles
               where role = 'admin' and coalesce(is_main_admin, false) order by id limit 1);
  insert into public.feed_posts (author_id, content, post_type, tour_id, status)
  values (v_admin, format('New tour posted: %s — Malhacan, Meycauayan, Bulacan. Book your slot now!', v_title), 'tour', v_id, 'Approved');

  raise notice 'Added % (Nov 2, 2026)', v_title;
end $$;

-- The new tour:
select title, destination, duration, to_char(start_date, 'Mon DD, YYYY') as date, price as joiner_rate, group_size as slots
from public.tours where title = 'All Souls'' Day Pilgrimage: San Isidro Labrador Parish' and not coalesce(is_archived, false);
