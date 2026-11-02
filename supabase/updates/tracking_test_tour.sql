-- ═══════════════════════════════════════════════════════════════════════
-- TRACKING TEST TOUR (today): San Isidro Labrador Parish → Supima Square,
-- Malhacan, Meycauayan, Bulacan
--
-- 1. Removes the "All Souls' Day Pilgrimage" sample tour (if it was added;
--    archived instead if someone already booked it).
-- 2. Adds "Tracking Test: Malhacan Parish to Supima Square" for TODAY
--    (Philippine time), with two pickup points:
--      1. San Isidro Labrador Parish, Malhacan   (the van leaves in about 30 minutes)
--      2. Supima Square, Malhacan                 (10 minutes later)
--
-- After running it, set the exact places on the map (tracking needs them):
--   Tour Management → the test tour → Edit → The Van's Route:
--     Starting point: search "San Isidro Labrador Parish Meycauayan"
--     Destination:    search "Supima Square Meycauayan"
--     → Find pickup points, tick both stops (or add them as Pickup Spots) → Save.
-- Then: Tracking Management → the test tour → Driver Link → open it on a
-- phone → Start Trip, and walk or drive from the church to Supima Square.
--
-- Safe to run again. Run it in the Supabase SQL Editor: paste it all, click Run.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_old constant text := 'All Souls'' Day Pilgrimage: San Isidro Labrador Parish';
  v_title constant text := 'Tracking Test: Malhacan Parish to Supima Square';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  -- The van leaves about 30 minutes from now (rounded to 5 minutes).
  v_leave timestamp := date_trunc('hour', now() at time zone 'Asia/Manila')
                       + (ceil(extract(minute from now() at time zone 'Asia/Manila') / 5) * 5 + 30) * interval '1 minute';
  v_t1 text;
  v_t2 text;
  v_id bigint;
  v_admin uuid;
  v_img_type text;
  v_has_status boolean;
  v_has_departure boolean;
  v_old_id bigint;
begin
  -- 1. The pilgrimage sample tour goes away.
  for v_old_id in select id from public.tours where title = v_old loop
    if exists (select 1 from public.bookings where tour_id = v_old_id) then
      update public.tours set is_archived = true where id = v_old_id;
      raise notice 'Archived % (it has bookings)', v_old;
    else
      delete from public.feed_posts where tour_id = v_old_id;
      delete from public.tour_meetups where tour_id = v_old_id;
      delete from public.tour_rates where tour_id = v_old_id;
      delete from public.tour_expenses where tour_id = v_old_id;
      delete from public.tours where id = v_old_id;
      raise notice 'Removed %', v_old;
    end if;
  end loop;

  -- 2. The test tour (once).
  if exists (select 1 from public.tours where title = v_title and start_date = v_today and not coalesce(is_archived, false)) then
    raise notice 'Skipped % (already there for today)', v_title;
    return;
  end if;
  if v_leave::date > v_today then v_leave := v_today + time '23:30'; end if;
  v_t1 := to_char(v_leave, 'FMHH12:MI AM');
  v_t2 := to_char(v_leave + interval '10 minutes', 'FMHH12:MI AM');

  v_img_type := (select data_type from information_schema.columns
                  where table_schema = 'public' and table_name = 'tours' and column_name = 'image_urls');
  v_has_status := exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'tour_meetups' and column_name = 'status');
  v_has_departure := exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'tours' and column_name = 'departure_time');

  insert into public.tours (
    title, destination, duration, price, group_size, difficulty, accommodation_options,
    description, inclusions, exclusions, itinerary, things_to_bring, important_note,
    start_date, end_date, sale_starts, sale_ends, is_archived
  ) values (
    v_title, 'Supima Square, Malhacan, Meycauayan, Bulacan', '1 Day', 1500, 14, 'Easy', array[]::text[],
    'A short test trip to try live tracking: from San Isidro Labrador Parish to Supima Square, both in Malhacan, Meycauayan.',
    'Test only', 'Test only',
    format(E'Day 1:\n%s - Leave San Isidro Labrador Parish\n%s - Arrive at Supima Square', v_t1, v_t2),
    'Phone with location turned on',
    'This is a test tour for trying the tracking. Archive it when you''re done.',
    v_today, v_today, null, null, false
  );
  v_id := (select max(id) from public.tours where title = v_title and start_date = v_today);

  execute format('update public.tours set image_urls = %L where id = $1',
                 case when v_img_type = 'jsonb' then '[]' else '{}' end) using v_id;
  if v_has_departure then
    execute 'update public.tours set departure_time = $2 where id = $1' using v_id, v_t1;
  end if;

  insert into public.tour_rates (tour_id, regular_rate) values (v_id, 1000)
    on conflict (tour_id) do update set regular_rate = excluded.regular_rate;
  insert into public.tour_expenses (tour_id, van_rent, tour_guide, bag_tag, others)
    values (v_id, 15000, 1300, 260, '[]'::jsonb)
    on conflict (tour_id) do update set van_rent = excluded.van_rent, tour_guide = excluded.tour_guide,
      bag_tag = excluded.bag_tag, others = excluded.others;

  if v_has_status then
    execute 'insert into public.tour_meetups (tour_id, location_name, scheduled_time, status) values ($1, $2, $3, ''DEPARTURE''), ($1, $4, $5, ''DEPARTURE'')'
      using v_id, 'San Isidro Labrador Parish, Malhacan', v_t1, 'Supima Square, Malhacan', v_t2;
  else
    insert into public.tour_meetups (tour_id, location_name, scheduled_time)
    values (v_id, 'San Isidro Labrador Parish, Malhacan', v_t1), (v_id, 'Supima Square, Malhacan', v_t2);
  end if;

  raise notice 'Added % for today: leaves the parish at %, Supima Square at %', v_title, v_t1, v_t2;
end $$;

select title, to_char(start_date, 'Mon DD, YYYY') as date,
       (select string_agg(location_name || ' ' || scheduled_time, '  →  ' order by id) from public.tour_meetups m where m.tour_id = t.id) as stops
from public.tours t where title = 'Tracking Test: Malhacan Parish to Supima Square' and not coalesce(is_archived, false);
