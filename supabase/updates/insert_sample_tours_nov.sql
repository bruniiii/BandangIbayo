-- ═══════════════════════════════════════════════════════════════════════
-- SAMPLE TOURS: NOV 3–4 AND NOV 6–9, 2026
--
--   • Mt. Daraitan Overnight Camp (Tanay, Rizal)        Nov 3–4  (2 Days)
--   • Sagada & Banaue Rice Terraces (Mountain Province)  Nov 6–9  (4 Days)
--
-- Made the same way as insert_real_tours.sql: Joiner Rate, Regular Rate,
-- expenses, pickup points (SM Mall of Asia (MOA), Greenfield, Cubao) and a
-- "New tour posted" feed post. Add photos later in Tour Management → Edit.
-- Safe to run again: a tour whose title is already there is skipped.
-- Only one tour per day: if another tour already uses one of these dates,
-- the SQL Editor says so — move or archive that tour first.
-- Limits the site checks: Joiner and Regular Rate at most ₱7,500, Van Rent at
-- most ₱30,000, Tour Guide at most ₱2,000.
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

  -- Mt. Daraitan Overnight Camp (summit + Tinipak River)
  perform pg_temp.add_tour(
    'Mt. Daraitan Overnight Camp', 'Tanay, Rizal', '2 Days',
    2800, 2200, 14, 'Moderate',
    array['Tent']::text[],
    'Major jump-off: Brgy. Daraitan, Tanay, Rizal.
Elevation: 739 MASL
Days required / Hours to summit: 1-2 days / 3-4 hours
Specs: Minor Climb, Difficulty 4/9, Trail class 1-3
Features: Sea of clouds at the summit, limestone rock formations, Tinipak River and cave',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Registration Fee
Environmental Fee
Local Guide Fee
River Crossing (Bangka)
Campsite Fee',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 1:
03:00am - Assembly Time McDonald’s Greenfields Edsa Shaw
04:00am - ETD to Tanay, Rizal
06:30am - ETA Brgy. Daraitan (Registration & Orientation, Secure Guide)
07:00am - River crossing, Start Trek
10:30am - ETA Summit (Photo Ops, Lunch - Own Account)
12:00nn - Start Descent
03:00pm - ETA Campsite near Tinipak River (Set Up Tents)
04:00pm - Swim at Tinipak River
06:00pm - Dinner - Own Account (Rest / Social)
09:00pm - Lights Off
Day 2:
05:30am - Wake Up Call (Breakfast - Own Account)
07:00am - Tinipak Cave and River (Photo Ops)
10:00am - Break Camp, Wash Up
11:30am - Lunch - Own Account
12:30pm - ETD to Manila
03:30pm - ETA Green Field',
    'At least 2 Liters of Water
Packed Lunch and Trail Foods
Tent / Sleeping Bag
Extra Shirt / Cloths
Swimwear
Shoes / Sandals
Sunblock
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Power Bank
Camera
ID card
Trash bag
FIRST AID KIT',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

The river can rise after heavy rain: swimming is allowed only when the guides say it is safe.

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    15000, 1500, '[{"name": "Campsite Fee", "amount": 2100}]'::jsonb,
    array[('2026-11-03'::date, '2026-11-04'::date)]::pg_temp.tour_date[]
  );

  -- Sagada & Banaue Rice Terraces
  perform pg_temp.add_tour(
    'Sagada & Banaue Rice Terraces', 'Sagada, Mountain Province', '4 Days',
    7500, 6800, 14, 'Easy',
    array['Non-AC Room']::text[],
    'A 4-day Cordillera road trip: Sagada''s caves, falls and sunrise, then the UNESCO-listed Banaue Rice Terraces.
Highlights: Kiltepan sunrise and sea of clouds, Sumaguing Cave, Bomod-ok Falls, Hanging Coffins, Banaue and Batad viewpoints',
    'Van Roundtrip
Parking Fee
Toll Fee
Driver''s Meal
Environmental Fee
Local Guide Fees
Cave Connection Tour (Lumiang to Sumaguing)
Homestay / Accommodation (3 nights)',
    'Food
Souvenirs/ Pasalubong
Not Mention Above',
    'Day 0:
09:00pm - Assembly Time McDonald’s Greenfields Edsa Shaw
10:00pm - ETD to Sagada
Day 1:
08:00am - ETA Sagada (Registration & Orientation, Breakfast - Own Account)
09:30am - Check In at Homestay
10:30am - Hanging Coffins and Echo Valley
12:30pm - Lunch - Own Account
02:00pm - Cave Connection (Lumiang to Sumaguing)
06:00pm - Dinner - Own Account (Rest / Social)
Day 2:
04:30am - Kiltepan Viewpoint (Sunrise and Sea of Clouds)
07:00am - Breakfast - Own Account
08:30am - Bomod-ok Falls Trek
12:30pm - Lunch - Own Account
02:00pm - Free Time (Sagada town, Lemon Pie House, Weaving)
06:00pm - Dinner - Own Account
Day 3:
06:00am - Breakfast - Own Account, Check Out
07:00am - ETD to Banaue
10:00am - ETA Banaue (Check In at Homestay)
11:00am - Banaue Rice Terraces Viewpoint
12:30pm - Lunch - Own Account
02:00pm - Batad Saddle Viewpoint
06:00pm - Dinner - Own Account (Rest / Social)
Day 4:
06:00am - Breakfast - Own Account, Check Out
07:00am - ETD to Manila
12:00nn - Lunch - Own Account
06:00pm - ETA Green Field',
    'Jacket (it gets cold at night)
Extra Shirt / Cloths (4 days)
Swimwear (for the falls and cave)
Shoes / Sandals with good grip
Umbrella/poncho/rain coat (weather is unpredictable)
Flash light / headlight
Water Bottle
Power Bank
Camera
Toiletries
ID card
Cash (few ATMs in Sagada)
Trash bag
FIRST AID KIT',
    'This Itinerary Will Serve As Guide During Our Tour. But Can Possibly Change In Many Factors Like Traffic, Weather, Pacing Of Participants Etc. But We Will Make Sure To Follow This Guide As Much As Possible As We Can.

Respect the local culture: no touching or climbing on the Hanging Coffins, and ask before taking photos of the locals.

Leave No Trace Principles
1. Plan ahead and prepare
2. Travel and camp on
3. Dispose of waste properly
4. Leave what you find
5. Respect wildlife
6. Minimize campfire impacts
7. Be Considerate of other Visitors',
    28000, 1500, '[{"name": "Homestay (3 nights)", "amount": 21000}, {"name": "Cave Connection Guide", "amount": 4200}]'::jsonb,
    array[('2026-11-06'::date, '2026-11-09'::date)]::pg_temp.tour_date[]
  );
end $$;

-- The new sample tours:
select title, destination, duration, to_char(start_date, 'Mon DD') || ' – ' || to_char(end_date, 'Mon DD, YYYY') as dates,
  price as joiner_rate, group_size as slots
from public.tours
where title in ('Mt. Daraitan Overnight Camp', 'Sagada & Banaue Rice Terraces') and not coalesce(is_archived, false)
order by start_date;
