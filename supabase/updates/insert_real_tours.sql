-- ═══════════════════════════════════════════════════════════════════════
-- REAL TOURS  (run after reset_test_data.sql)
--
-- Adds the tours below, each with its dates, Joiner Rate, Regular Rate,
-- expenses (Van Rent, Tour Guide, Bag Tag ₱260, others), pickup points
-- (SM Mall of Asia (MOA), Greenfield, Cubao) and a "New tour posted" feed post
-- from the main admin, the same as creating them in Tour Management.
--
-- Photos aren't included: open each tour in Tour Management → Edit to add them.
-- Safe to run again: a tour whose title is already there is skipped.
-- Run it in the Supabase SQL Editor: paste it all, click Run.
-- ═══════════════════════════════════════════════════════════════════════

create type pg_temp.tour_date as (start_date date, end_date date);

create function pg_temp.add_tour(
  p_title text, p_destination text, p_duration text,
  p_joiner_rate numeric, p_regular_rate numeric, p_group_size int, p_difficulty text,
  p_accommodation text[], p_description text, p_inclusions text, p_exclusions text,
  p_itinerary text, p_things_to_bring text, p_important_note text,
  p_van_rent numeric, p_tour_guide numeric, p_others jsonb,
  p_dates pg_temp.tour_date[]
) returns void language plpgsql as $fn$
declare
  d pg_temp.tour_date;
  v_id bigint;
  v_first bigint;
  v_admin uuid;
  v_pickup text;
  v_img_type text;
  v_has_status boolean;
begin
  if exists (select 1 from public.tours where lower(title) = lower(p_title) and not coalesce(is_archived, false)) then
    raise notice 'Skipped % (already there)', p_title;
    return;
  end if;

  -- (Written as  x := (select ...)  so the SQL Editor doesn't mistake it for a new table.)
  v_img_type := (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'tours' and column_name = 'image_urls');
  v_has_status := exists (select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'tour_meetups' and column_name = 'status');

  foreach d in array p_dates loop
    insert into public.tours (
      title, destination, duration, price, group_size, difficulty, accommodation_options,
      description, inclusions, exclusions, itinerary, things_to_bring, important_note,
      start_date, end_date, sale_starts, sale_ends, is_archived
    ) values (
      p_title, p_destination, p_duration, p_joiner_rate, p_group_size, p_difficulty, p_accommodation,
      p_description, p_inclusions, p_exclusions, p_itinerary, p_things_to_bring, p_important_note,
      d.start_date, d.end_date, null, null, false
    );
    v_id := (select max(id) from public.tours where title = p_title and start_date = d.start_date);
    v_first := coalesce(v_first, v_id);

    -- No photos yet (an empty list, whatever the column's type).
    execute format('update public.tours set image_urls = %L where id = $1',
                   case when v_img_type = 'jsonb' then '[]' else '{}' end) using v_id;

    insert into public.tour_rates (tour_id, regular_rate) values (v_id, p_regular_rate)
      on conflict (tour_id) do update set regular_rate = excluded.regular_rate;
    insert into public.tour_expenses (tour_id, van_rent, tour_guide, bag_tag, others)
      values (v_id, p_van_rent, p_tour_guide, 260, p_others)
      on conflict (tour_id) do update set van_rent = excluded.van_rent, tour_guide = excluded.tour_guide,
        bag_tag = excluded.bag_tag, others = excluded.others;

    -- Pickup points (the ETA of each stop is set later in Tracking Management).
    foreach v_pickup in array array['SM Mall of Asia (MOA)', 'Greenfield', 'Cubao'] loop
      if v_has_status then
        execute 'insert into public.tour_meetups (tour_id, location_name, scheduled_time, status) values ($1, $2, '''', ''DEPARTURE'')'
          using v_id, v_pickup;
      else
        insert into public.tour_meetups (tour_id, location_name, scheduled_time) values (v_id, v_pickup, '');
      end if;
    end loop;
  end loop;

  -- "New tour posted" on the Community Feed, from the main admin.
  v_admin := (select id from public.profiles
   where role = 'admin' and coalesce(is_main_admin, false) order by id limit 1);
  insert into public.feed_posts (author_id, content, post_type, tour_id, status)
  values (v_admin, format('New tour posted: %s — %s. Book your slot now!', p_title, p_destination), 'tour', v_first, 'Approved');

  raise notice 'Added % (% date%)', p_title, array_length(p_dates, 1), case when array_length(p_dates, 1) = 1 then '' else 's' end;
end
$fn$;

do $$
begin

  -- Mt. Pulag (Ambangeg Trail)
  perform pg_temp.add_tour(
    'Mt. Pulag (Ambangeg Trail)', 'Bokod, Benguet', '2 Days',
    5000, 4500, 14, 'Moderate',
    array['Non-AC Room']::text[],
    'Major jump-off: Ambangeg (Babalak) Ranger Station, Bokod, Benguet.
LLA: 16°34’58″N 120°53’15″E, 2922 MASL
Days required / Hours to summit: 4-5 hours / 1-2 days
Specs: Major Climb, Difficulty 3/9, Trail class 1-2
Trail system: Grand Cordillera Trail, Section 3
Features: Sea of clouds, dwarf bamboo slopes, pine forests',
    'Van Roundtrip
Medical Certificate
Parking Fee
Driver''s Meal
Monster Jeep
DENR Fee
Registration Fee
Brgy Fee
Local Guide Fee
Homestay / Accommodation',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
09:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
10:00pm - ETD to Baguio
Day 1:
06:00am - ETA Igorot taste Benguet "Breakfast" (Own account)
08:30am - ETA DENR "Registration & Seminar"
10:00am - ETD to Babalak Ranger Station (Secure Guide)
11:00pm - ETA at Home Stay (Lunch - Own Account)
01:00pm - Rest, Free Time, Social
06:00pm - Dinner - Lunch - Own Account (Rest / Social)
08:00pm - Lights Off
Day 2:
12:00am - Wake Up Call (Breakfast" (Own account)
01:00am - Final Briefing with Guides
01:30am - Start Trek
03:00am - ETA Camp 1 (Rest)
04:30am - ETA Camp 2 (Rest, Water Source)
05:30am - ETA Satellite (Sunrise viewing, Photo Ops, Group Picture)
07:00am - Start Descent (Back to Homestay)
08:00am - ETA Camp 2
09:00am - ETA Camp 1
10:30am - ETA Homestay (Rest, Wash Up)
12:00nn - Lunch - Own Account
01:00pm - ETD to DENR
01:30pm - ETA DENR (Log out)
03:00pm - ETD to Manila
07:00pm - ETA at Leezas Eatery (Dinner - Own Account)
08:00pm - Back to Manila
11:30pm - ETA Green Field',
    'At least 2 Liters of Water
Camera
Power Bank
Sunblock
Shoes / Sandals
Extra Shirt / Cloths
ID card
Trail Foods like Chocolate, Candy, Jelly Ace Etc.
Packed Lunch
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Sun protection (hats, sun block, headgear)
Trash bag
Head lamp / Flashlight
Arm Sleeve / Leggings
FIRST AID KIT
Jacket
Gloves',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

No Medical Certificate
No Climb Policy (Fit to Climb)

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    17000, 1500, '[]'::jsonb,
    array[('2026-12-05'::date, '2026-12-06'::date), ('2027-01-09'::date, '2027-01-10'::date), ('2027-02-06'::date, '2027-02-07'::date)]::pg_temp.tour_date[]
  );
  -- Mt. Ulap Eco-Trail
  perform pg_temp.add_tour(
    'Mt. Ulap Eco-Trail', 'Itogon, Benguet', '1 Day',
    2500, 2000, 14, 'Easy',
    array[]::text[],
    'Major jump-off: Brgy. Ampucao, Itogon, Benguet.
Elevation: 1846 MASL
Days required / Hours to summit: 1 day / 3-4 hours
Specs: Minor Climb, Difficulty 3/9, Trail class 1-3
Trail system: Ampucao - Sta. Fe ridge traverse
Features: Gungal Rock, pine forest ridges, views of the Cordillera mountains',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Registration Fee
Environmental Fee
Local Guide Fee',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
10:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
11:00pm - ETD to Itogon, Benguet
Day 1:
04:30am - ETA Ampucao Jump-off (Breakfast - Own Account)
05:30am - Registration & Orientation (Secure Guide)
06:00am - Start Trek
07:30am - ETA Ponkis Peak (Photo Ops)
09:00am - ETA Gungal Rock (Photo Ops, Group Picture)
10:00am - ETA Mt. Ulap Summit
11:00am - Start Descent to Sta. Fe Exit
01:00pm - ETA Exit Point (Wash Up, Lunch - Own Account)
02:30pm - ETD to Manila
06:00pm - Dinner Stopover (Own Account)
10:00pm - ETA Green Field',
    'At least 2 Liters of Water
Camera
Power Bank
Sunblock
Shoes / Sandals
Extra Shirt / Cloths
ID card
Trail Foods like Chocolate, Candy, Jelly Ace Etc.
Packed Lunch
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Sun protection (hats, sun block, headgear)
Trash bag
Head lamp / Flashlight
Arm Sleeve / Leggings
FIRST AID KIT
Jacket
Gloves',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

No Medical Certificate
No Climb Policy (Fit to Climb)

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    16000, 1300, '[]'::jsonb,
    array[('2026-11-28'::date, '2026-11-28'::date), ('2026-12-19'::date, '2026-12-19'::date), ('2027-01-23'::date, '2027-01-23'::date)]::pg_temp.tour_date[]
  );
  -- Mt. Batulao (New Trail)
  perform pg_temp.add_tour(
    'Mt. Batulao (New Trail)', 'Nasugbu, Batangas', '1 Day',
    1800, 1300, 14, 'Moderate',
    array[]::text[],
    'Major jump-off: Evercrest, Brgy. Kaylaway, Nasugbu, Batangas.
Elevation: 811 MASL
Days required / Hours to summit: 1 day / 3-4 hours
Specs: Minor Climb, Difficulty 4/9, Trail class 1-3
Trail system: New Trail up, Old Trail down (traverse)
Features: Rolling hills, grassland ridges, rock scrambles near the summit',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Registration Fee
Local Guide Fee',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
11:30pm - Assembly Time McDonald’s Greenfields Edsa Shaw
Day 1:
12:30am - ETD to Nasugbu, Batangas
03:00am - ETA Evercrest Jump-off (Registration, Secure Guide)
03:30am - Start Trek (New Trail)
06:00am - ETA Summit (Sunrise viewing, Photo Ops, Group Picture)
07:00am - Start Descent (Old Trail)
09:30am - ETA Jump-off (Wash Up)
10:30am - Lunch (Own Account)
11:30am - ETD to Manila
02:30pm - ETA Green Field',
    'At least 2 Liters of Water
Camera
Power Bank
Sunblock
Shoes / Sandals
Extra Shirt / Cloths
ID card
Trail Foods like Chocolate, Candy, Jelly Ace Etc.
Packed Lunch
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Sun protection (hats, sun block, headgear)
Trash bag
Head lamp / Flashlight
Arm Sleeve / Leggings
FIRST AID KIT
Jacket
Gloves',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

No Medical Certificate
No Climb Policy (Fit to Climb)

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    15000, 1300, '[]'::jsonb,
    array[('2026-12-12'::date, '2026-12-12'::date), ('2027-01-16'::date, '2027-01-16'::date), ('2027-02-13'::date, '2027-02-13'::date)]::pg_temp.tour_date[]
  );
  -- Mt. Pinatubo Crater Lake
  perform pg_temp.add_tour(
    'Mt. Pinatubo Crater Lake', 'Capas, Tarlac', '1 Day',
    3500, 3000, 14, 'Easy',
    array[]::text[],
    'Major jump-off: Sta. Juliana, Capas, Tarlac.
Highlight: Crater lake of the volcano that erupted in 1991
Days required / Hours to crater: 1 day / 1-2 hours trek after a 4x4 ride
Specs: Minor Hike, Trail class 1-2
Features: 4x4 ride across lahar fields, canyons, turquoise crater lake',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
4x4 Jeep (shared, roundtrip)
Registration Fee
Environmental Fee
Local Guide Fee',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
11:30pm - Assembly Time McDonald’s Greenfields Edsa Shaw
Day 1:
12:30am - ETD to Capas, Tarlac
04:00am - ETA Sta. Juliana (Breakfast - Own Account)
05:00am - Registration & Orientation
05:30am - 4x4 ride across the lahar fields
07:00am - Start Trek to the Crater
08:30am - ETA Crater Lake (Photo Ops, Group Picture)
10:00am - Start Trek back to the 4x4
11:30am - 4x4 ride back to Sta. Juliana
12:30pm - Wash Up, Lunch (Own Account)
02:00pm - ETD to Manila
05:00pm - ETA Green Field',
    'At least 2 Liters of Water
Camera
Power Bank
Sunblock
Shoes / Sandals
Extra Shirt / Cloths
ID card
Trail Foods like Chocolate, Candy, Jelly Ace Etc.
Packed Lunch
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Sun protection (hats, sun block, headgear)
Trash bag
Head lamp / Flashlight
Arm Sleeve / Leggings
FIRST AID KIT
Jacket
Gloves',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

No Medical Certificate
No Climb Policy (Fit to Climb)

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    15000, 1500, '[{"name": "4x4 Jeep Rental", "amount": 10500}]'::jsonb,
    array[('2026-12-05'::date, '2026-12-05'::date), ('2027-01-09'::date, '2027-01-09'::date), ('2027-02-06'::date, '2027-02-06'::date)]::pg_temp.tour_date[]
  );
  -- Mt. Daraitan & Tinipak River
  perform pg_temp.add_tour(
    'Mt. Daraitan & Tinipak River', 'Tanay, Rizal', '1 Day',
    1800, 1300, 14, 'Moderate',
    array[]::text[],
    'Major jump-off: Brgy. Daraitan, Tanay, Rizal.
Elevation: 739 MASL
Days required / Hours to summit: 1 day / 2-4 hours
Specs: Minor Climb, Difficulty 4/9, Trail class 1-3
Trail system: Daraitan summit trail, side trip to Tinipak River
Features: Limestone rock formations, summit view of the Sierra Madre and Tinipak River, river swimming',
    'Van Roundtrip
Parking Fee
Driver''s Meal
Registration Fee
Environmental Fee
Local Guide Fee
Tinipak River Side Trip',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
11:30pm - Assembly Time McDonald’s Greenfields Edsa Shaw
Day 1:
12:30am - ETD to Tanay, Rizal
03:00am - ETA Brgy. Daraitan (Registration, Secure Guide)
03:30am - Start Trek
06:00am - ETA Summit (Sunrise viewing, Photo Ops, Group Picture)
07:00am - Start Descent
09:00am - ETA Tinipak River (Swimming, Photo Ops)
11:00am - Back to Jump-off (Wash Up, Lunch - Own Account)
01:00pm - ETD to Manila
03:30pm - ETA Green Field',
    'At least 2 Liters of Water
Camera
Power Bank
Sunblock
Shoes / Sandals
Extra Shirt / Cloths
ID card
Trail Foods like Chocolate, Candy, Jelly Ace Etc.
Packed Lunch
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Sun protection (hats, sun block, headgear)
Trash bag
Head lamp / Flashlight
Arm Sleeve / Leggings
FIRST AID KIT
Jacket
Gloves',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

No Medical Certificate
No Climb Policy (Fit to Climb)

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    15000, 1300, '[]'::jsonb,
    array[('2026-11-28'::date, '2026-11-28'::date), ('2026-12-19'::date, '2026-12-19'::date), ('2027-01-30'::date, '2027-01-30'::date)]::pg_temp.tour_date[]
  );
  -- Sagada Highlights Tour
  perform pg_temp.add_tour(
    'Sagada Highlights Tour', 'Sagada, Mountain Province', '3 Days',
    5500, 5000, 14, 'Easy',
    array['Non-AC Room']::text[],
    'Destination: Sagada, Mountain Province (about 1500 MASL).
Days required: 3 days (overnight travel)
Specs: Tour / Light hikes, Trail class 1-2
Highlights: Kiltepan sunrise and sea of clouds, Echo Valley and the Hanging Coffins, Sumaguing Cave, Marlboro Hills
Features: Cool mountain weather, rice terraces, pine forests, local food',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Environmental Fee
Registration Fee
Local Guide Fee
Cave Guide Fee
Homestay / Accommodation (2 nights)',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
08:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
09:00pm - ETD to Sagada
Day 1:
08:00am - ETA Sagada (Registration at the Tourism Office)
09:00am - Check-in at Homestay (Breakfast - Own Account)
10:00am - Echo Valley and the Hanging Coffins
12:00nn - Lunch (Own Account)
02:00pm - Sumaguing Cave (Cave Connection optional)
06:00pm - Dinner (Own Account), Free Time
09:00pm - Lights Off
Day 2:
04:00am - Wake Up Call
04:30am - Kiltepan Viewpoint (Sunrise, Sea of Clouds)
07:00am - Breakfast (Own Account)
08:30am - Marlboro Hills Hike
12:00nn - Lunch (Own Account)
02:00pm - Free Time / Pasalubong Shopping
06:00pm - Dinner (Own Account), Social Night
Day 3:
06:00am - Wake Up Call, Breakfast (Own Account)
07:30am - Check-out, ETD to Manila
12:30pm - Lunch Stopover (Own Account)
07:00pm - Dinner Stopover (Own Account)
10:00pm - ETA Green Field',
    'Jacket (it gets cold)
Extra Shirt / Cloths
Comfortable Shoes / Sandals
Flash light / headlight
Umbrella/poncho/rain coat (weather is unpredictable)
Camera
Power Bank
ID card
Toiletries
Personal Medicine
FIRST AID KIT
Trash bag',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    25000, 1500, '[]'::jsonb,
    array[('2026-12-11'::date, '2026-12-13'::date), ('2027-01-15'::date, '2027-01-17'::date), ('2027-02-12'::date, '2027-02-14'::date)]::pg_temp.tour_date[]
  );
  -- Mt. Tapulao (Highest Peak of Zambales)
  perform pg_temp.add_tour(
    'Mt. Tapulao (Highest Peak of Zambales)', 'Palauig, Zambales', '2 Days',
    3800, 3300, 14, 'Challenging',
    array['Tent']::text[],
    'Major jump-off: Brgy. Dampay-Salaza, Palauig, Zambales.
Elevation: 2037 MASL (highest peak of Zambales)
Days required / Hours to summit: 1-2 days / 7-9 hours
Specs: Major Climb, Difficulty 5/9, Trail class 1-2
Trail system: Old mining road (long, steady ascent)
Features: Pine forests, mossy forest near the summit, views of the West Philippine Sea',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Registration Fee
Environmental Fee
Local Guide Fee
Campsite Fee',
    'Food
Tent (bring your own, or rent)
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
09:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
10:00pm - ETD to Palauig, Zambales
Day 1:
04:00am - ETA Jump-off (Breakfast - Own Account)
05:00am - Registration & Orientation (Secure Guide)
05:30am - Start Trek
09:00am - ETA Station 4 (Rest, Water Source)
12:00nn - Lunch (Own Account, Packed Lunch)
03:00pm - ETA Campsite near the Summit (Set up Tents)
05:00pm - Summit (Sunset viewing, Photo Ops)
06:30pm - Dinner (Own Account), Social
08:00pm - Lights Off
Day 2:
05:00am - Wake Up Call (Sunrise viewing)
06:00am - Breakfast (Own Account), Break Camp
07:30am - Start Descent
01:00pm - ETA Jump-off (Wash Up, Lunch - Own Account)
03:00pm - ETD to Manila
08:00pm - Dinner Stopover (Own Account)
10:30pm - ETA Green Field',
    'At least 2 Liters of Water
Camera
Power Bank
Sunblock
Shoes / Sandals
Extra Shirt / Cloths
ID card
Trail Foods like Chocolate, Candy, Jelly Ace Etc.
Packed Lunch
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Sun protection (hats, sun block, headgear)
Trash bag
Head lamp / Flashlight
Arm Sleeve / Leggings
FIRST AID KIT
Jacket
Gloves
Tent / Sleeping Bag
Mess Kit
At least 3 Liters of Water (long trail)',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

No Medical Certificate
No Climb Policy (Fit to Climb)

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    18000, 2000, '[]'::jsonb,
    array[('2026-12-12'::date, '2026-12-13'::date), ('2027-01-23'::date, '2027-01-24'::date), ('2027-02-13'::date, '2027-02-14'::date)]::pg_temp.tour_date[]
  );
  -- Anawangin & Nagsasa Cove Camping
  perform pg_temp.add_tour(
    'Anawangin & Nagsasa Cove Camping', 'San Antonio, Zambales', '2 Days',
    3000, 2500, 14, 'Easy',
    array['Tent']::text[],
    'Jump-off: Pundaquit Beach, San Antonio, Zambales.
Destination: Anawangin Cove and Nagsasa Cove (by boat)
Days required: 2 days (overnight beach camping)
Specs: Beach / Camping, no climb
Features: White-gray volcanic sand coves, agoho (pine-like) trees, island hopping to Capones and Camara Islands',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Boat Transfer (roundtrip)
Island Hopping (Capones & Camara Islands)
Environmental Fee
Cove Entrance Fee
Campsite Fee',
    'Food
Tent (bring your own, or rent)
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
10:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
11:00pm - ETD to San Antonio, Zambales
Day 1:
04:00am - ETA Pundaquit Beach (Breakfast - Own Account)
06:00am - Boat to Capones Island (Lighthouse, Photo Ops)
08:00am - Camara Island (Swimming, Photo Ops)
10:00am - ETA Nagsasa Cove (Set up Camp)
12:00nn - Lunch (Own Account)
01:00pm - Free Time, Swimming
06:00pm - Dinner (Own Account), Social Night by the Beach
09:00pm - Lights Off
Day 2:
05:30am - Wake Up Call (Sunrise viewing)
07:00am - Breakfast (Own Account), Break Camp
08:30am - Boat to Anawangin Cove (Swimming, Photo Ops)
11:00am - Boat back to Pundaquit (Wash Up)
12:30pm - Lunch (Own Account)
01:30pm - ETD to Manila
06:30pm - ETA Green Field',
    'At least 2 Liters of Water
Swimwear / Rash Guard
Extra Shirt / Cloths
Slippers / Sandals
Sunblock
Sun protection (hats, sunglasses)
Tent / Sleeping Bag
Flash light / headlight
Camera
Power Bank
Dry Bag (for gadgets on the boat)
ID card
Toiletries
FIRST AID KIT
Trash bag',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    16000, 1300, '[{"name": "Boat Rental", "amount": 6000}]'::jsonb,
    array[('2026-11-28'::date, '2026-11-29'::date), ('2027-01-02'::date, '2027-01-03'::date), ('2027-01-30'::date, '2027-01-31'::date)]::pg_temp.tour_date[]
  );
  -- Calaguas Island Beach Camping
  perform pg_temp.add_tour(
    'Calaguas Island Beach Camping', 'Vinzons, Camarines Norte', '3 Days',
    5800, 5300, 14, 'Easy',
    array['Tent']::text[],
    'Jump-off: Paracale or Vinzons Port, Camarines Norte.
Destination: Mahabang Buhangin Beach, Tinaga Island, Calaguas Islands
Days required: 3 days (overnight travel, 1 night camping)
Specs: Beach / Camping, no climb
Features: Long powdery white-sand beach, clear turquoise water, hilltop view deck',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Boat Transfer (roundtrip)
Environmental Fee
Registration Fee
Campsite Fee',
    'Food
Tent (bring your own, or rent)
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
08:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
09:00pm - ETD to Camarines Norte
Day 1:
06:00am - ETA Port (Breakfast - Own Account, Registration)
08:00am - Boat to Calaguas (about 2 hours)
10:00am - ETA Mahabang Buhangin Beach (Set up Camp)
12:00nn - Lunch (Own Account)
01:00pm - Free Time, Swimming
05:00pm - Hilltop View Deck (Sunset viewing, Photo Ops)
07:00pm - Dinner (Own Account), Social Night by the Beach
10:00pm - Lights Off
Day 2:
05:30am - Wake Up Call (Sunrise viewing)
07:00am - Breakfast (Own Account)
08:00am - Free Time, Swimming
11:00am - Break Camp
12:00nn - Boat back to Port (Lunch - Own Account)
03:00pm - ETD to Manila
08:00pm - Dinner Stopover (Own Account)
Day 3:
04:00am - ETA Green Field',
    'At least 2 Liters of Water
Swimwear / Rash Guard
Extra Shirt / Cloths
Slippers / Sandals
Sunblock
Sun protection (hats, sunglasses)
Tent / Sleeping Bag
Flash light / headlight
Camera
Power Bank
Dry Bag (for gadgets on the boat)
ID card
Toiletries
FIRST AID KIT
Trash bag',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    28000, 1500, '[{"name": "Boat Rental", "amount": 9000}]'::jsonb,
    array[('2026-12-18'::date, '2026-12-20'::date), ('2027-01-22'::date, '2027-01-24'::date), ('2027-02-12'::date, '2027-02-14'::date)]::pg_temp.tour_date[]
  );
end $$;

-- The tours now on the site:
select title, destination, duration, to_char(start_date, 'Mon DD, YYYY') as starts, price as joiner_rate, group_size as slots
from public.tours where not coalesce(is_archived, false) order by title, start_date;

