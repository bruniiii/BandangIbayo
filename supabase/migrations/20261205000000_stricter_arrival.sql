-- ─────────────────────────────────────────────
-- Stricter "Arrived" for the driver's live location
--
-- Before: a pickup stop was marked Arrived as soon as the van was within
-- 250 m of it, so stops close together (or a rough GPS reading) were marked
-- Arrived before the van got there.
-- Now: Arrived only when the van is within 100 m of the stop's pin on two
-- location updates in a row (about 20 seconds apart), and the phone's GPS
-- reading is accurate to 60 m or better. Driving past doesn't count.
--
-- Run after 20261204000000_weather_actions.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.tour_meetups add column if not exists arrive_hits int not null default 0;

create or replace function public.share_van_location(
  p_token text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_speed double precision default null, p_heading double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
  v_title text;
  v_stop public.tour_meetups%rowtype;
  v_next public.tour_meetups%rowtype;
  v_km double precision;
  v_speed double precision;
  v_minutes int;
  v_plate text;
  v_hits int := 0;
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active. It works from the day before the tour until its last day.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'The phone sent an invalid location.';
  end if;

  insert into public.van_locations (tour_id, lat, lng, accuracy_m, speed_kmh, heading, updated_at)
  values (v_tour_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, now())
  on conflict (tour_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
        speed_kmh = excluded.speed_kmh, heading = excluded.heading, updated_at = now();

  v_title := (select title from public.tours where id = v_tour_id);
  v_plate := coalesce((select nullif(plate_number, '') from public.tour_vehicles where tour_id = v_tour_id limit 1), 'Van');

  -- The next pickup stop the van hasn't reached (in driving order).
  v_stop := (select m from public.tour_meetups m
              where m.tour_id = v_tour_id and coalesce(m.status, '') <> 'ARRIVED'
              order by m.route_order nulls last, m.created_at limit 1);
  -- No stop left, or the next one isn't on the map (typed by hand): nothing automatic.
  if v_stop.id is null or v_stop.lat is null or v_stop.lng is null then
    return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name);
  end if;

  v_km := public.km_between(p_lat, p_lng, v_stop.lat, v_stop.lng);
  -- Rough minutes: the phone's speed when moving, else 30 km/h.
  v_speed := case when coalesce(p_speed, 0) >= 10 then p_speed else 30 end;
  v_minutes := greatest(1, round(v_km / v_speed * 60));

  if coalesce(v_stop.status, '') <> 'CURRENTLY HERE' then
    update public.tour_meetups set status = 'CURRENTLY HERE' where id = v_stop.id;
    insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
    values (v_tour_id, v_stop.id, v_stop.location_name, 'CURRENTLY HERE',
            format('En Route: The van is heading to [%s]. About %s min away.', v_stop.location_name, v_minutes), '');
  end if;

  -- Arrived only when the van is really there: within 100 m of the pin on
  -- two location updates in a row (about 20 seconds apart), each with a GPS
  -- reading accurate to 60 m or better. A van just driving past, or a rough
  -- first GPS fix, doesn't count.
  if v_km <= 0.1 and coalesce(p_accuracy, 0) <= 60 then
    update public.tour_meetups set arrive_hits = coalesce(arrive_hits, 0) + 1 where id = v_stop.id
    returning arrive_hits into v_hits;
  else
    if coalesce(v_stop.arrive_hits, 0) <> 0 then
      update public.tour_meetups set arrive_hits = 0 where id = v_stop.id;
    end if;
    v_hits := 0;
  end if;

  if v_hits >= 2 then
    -- Arrived: mark it, tell its joiners to board, and head for the next stop.
    update public.tour_meetups set status = 'ARRIVED', arrived_at = now() where id = v_stop.id;
    insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
    values (v_tour_id, v_stop.id, v_stop.location_name, 'ARRIVED',
            format('Arrived: Vehicle (%s) arrived at [%s]. Joiners please board now.', v_plate, v_stop.location_name), '');
    insert into public.notifications (user_id, title, message, type, related_id)
    select distinct b.user_id, 'The van is here 🚐',
           format('The van for %s is at %s now. Please board.', v_title, v_stop.location_name), 'tracking', null::uuid
      from public.bookings b
     where b.tour_id = v_tour_id and b.user_id is not null
       and lower(btrim(coalesce(b.pickup_point, ''))) = lower(btrim(v_stop.location_name))
       and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected');

    v_next := (select m from public.tour_meetups m
                where m.tour_id = v_tour_id and coalesce(m.status, '') <> 'ARRIVED'
                order by m.route_order nulls last, m.created_at limit 1);
    if v_next.id is not null then
      update public.tour_meetups set status = 'CURRENTLY HERE' where id = v_next.id;
      insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
      values (v_tour_id, v_next.id, v_next.location_name, 'CURRENTLY HERE',
              format('En Route: Heading next to [%s].', v_next.location_name), '');
    end if;
    return jsonb_build_object('ok', true, 'arrived', v_stop.location_name, 'next_stop', v_next.location_name);
  end if;

  if v_km <= 2.5 and v_stop.near_notified_at is null then
    -- A few minutes away: tell that stop's joiners to get ready (once).
    update public.tour_meetups set near_notified_at = now() where id = v_stop.id;
    insert into public.notifications (user_id, title, message, type, related_id)
    select distinct b.user_id, 'The van is almost there ⏰',
           format('The van for %s is about %s minute%s from %s. Please be ready at the pickup point.',
                  v_title, v_minutes, case when v_minutes = 1 then '' else 's' end, v_stop.location_name), 'tracking', null::uuid
      from public.bookings b
     where b.tour_id = v_tour_id and b.user_id is not null
       and lower(btrim(coalesce(b.pickup_point, ''))) = lower(btrim(v_stop.location_name))
       and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected');
  end if;

  return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name, 'km', round(v_km::numeric, 2), 'minutes', v_minutes);
end;
$$;
revoke all on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) to anon, authenticated;
