-- ─────────────────────────────────────────────
-- Live van location (maps step 2)
--
-- • tour_driver_links: a private link per tour for the driver's phone
--   (/driver/<token>). Admins create or reset it in Tracking Management. The
--   driver needs no account. Only admins can read the tokens.
-- • van_locations: where the van is now (one row per tour), sent by the
--   driver's phone about every 20 seconds while the trip page is open.
--   Admins and joiners booked on the tour see it (live).
-- • share_van_location(): the driver's phone sends the location; the next
--   pickup stop is set "currently here", and:
--     – about 2.5 km away: the joiners at that stop are told the van is
--       a few minutes away (once),
--     – about 250 m away: the stop is marked Arrived, they're told to board,
--       and the live feed is updated.
--   The link only works from the day before the tour until its last day.
--
-- Run after 20261130000000_route_pickup_spots.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.tour_driver_links (
  tour_id    bigint primary key references public.tours(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.tour_driver_links enable row level security;
drop policy if exists "driver_links_admin" on public.tour_driver_links;
create policy "driver_links_admin" on public.tour_driver_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.van_locations (
  tour_id    bigint primary key references public.tours(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  accuracy_m double precision,
  speed_kmh  double precision,
  heading    double precision,
  updated_at timestamptz not null default now()
);
alter table public.van_locations enable row level security;
drop policy if exists "van_locations_read" on public.van_locations;
create policy "van_locations_read" on public.van_locations
  for select to authenticated using (public.is_admin() or public.has_active_booking_on_tour(tour_id));
drop policy if exists "van_locations_admin" on public.van_locations;
create policy "van_locations_admin" on public.van_locations
  for delete to authenticated using (public.is_admin());

alter table public.tour_meetups add column if not exists near_notified_at timestamptz;
alter table public.tour_meetups add column if not exists arrived_at timestamptz;

-- Live updates on the Tracking pages.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'van_locations') then
    alter publication supabase_realtime add table public.van_locations;
  end if;
end $$;

-- Straight-line distance in km.
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- ── Admins: create (or reset) a tour's driver link ──
create or replace function public.create_driver_link(p_tour_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  if not public.is_admin() then
    raise exception 'Only admins can make driver links.';
  end if;
  insert into public.tour_driver_links (tour_id, token) values (p_tour_id, v_token)
    on conflict (tour_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;
revoke all on function public.create_driver_link(bigint) from public, anon;
grant execute on function public.create_driver_link(bigint) to authenticated;

-- The tour a driver link belongs to, while the link may be used (from the
-- day before the tour until its last day, Philippine time).
create or replace function public.driver_link_tour(p_token text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.tour_driver_links l
    join public.tours t on t.id = l.tour_id
   where l.token = p_token
     and (now() at time zone 'Asia/Manila')::date between t.start_date - 1 and coalesce(t.end_date, t.start_date);
$$;
revoke all on function public.driver_link_tour(text) from public;

-- ── Driver page: the tour, its route and pickup stops ──
create or replace function public.driver_trip_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active. It works from the day before the tour until its last day. Ask Bandang IBAYO for a new link if needed.';
  end if;
  return (
    select jsonb_build_object(
      'tour', jsonb_build_object('id', t.id, 'title', t.title, 'start_date', t.start_date, 'end_date', t.end_date, 'route', t.route),
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', m.location_name, 'lat', m.lat, 'lng', m.lng, 'status', m.status,
                 'scheduled_time', m.scheduled_time, 'route_order', m.route_order)
               order by m.route_order nulls last, m.created_at)
          from public.tour_meetups m where m.tour_id = t.id), '[]'::jsonb),
      'sharing', exists (select 1 from public.van_locations v where v.tour_id = t.id))
      from public.tours t where t.id = v_tour_id);
end;
$$;
revoke all on function public.driver_trip_info(text) from public;
grant execute on function public.driver_trip_info(text) to anon, authenticated;

-- ── Driver's phone: the van's location (about every 20 seconds) ──
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

  if v_km <= 0.25 then
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

  return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name, 'km', round(v_km::numeric, 1), 'minutes', v_minutes);
end;
$$;
revoke all on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) to anon, authenticated;

-- ── Driver's phone: End Trip (the van leaves the map) ──
create or replace function public.end_van_trip(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active.';
  end if;
  if exists (select 1 from public.van_locations where tour_id = v_tour_id) then
    delete from public.van_locations where tour_id = v_tour_id;
    insert into public.tour_tracking_logs (tour_id, location_name, status, display_text, note)
    values (v_tour_id, '', 'ARRIVED', 'Trip update: The driver stopped sharing the van''s location.', '');
  end if;
end;
$$;
revoke all on function public.end_van_trip(text) from public;
grant execute on function public.end_van_trip(text) to anon, authenticated;

-- Ended tours: the van leaves the map (the daily archive job also runs this).
delete from public.van_locations v
 using public.tours t
 where t.id = v.tour_id and coalesce(t.end_date, t.start_date) < (now() at time zone 'Asia/Manila')::date;
