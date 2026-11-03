-- ─────────────────────────────────────────────
-- Pickup points in driving order
--
-- The list joiners choose from when booking (and in My Bookings) is now in
-- the order the van reaches the stops (route_order, set when the tour is
-- saved with its route), like the driver's page and Tracking. Stops without
-- a place on the route keep the order they were added, after the others.
--
-- Run after 20261206000000_remove_place_cache.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tour_pickup_points(p_tour_id public.tours.id%type)
returns table (location_name text, scheduled_time text)
language sql
stable
security definer
set search_path = public
as $$
  select m.location_name, m.scheduled_time::text
    from public.tour_meetups m
   where m.tour_id = p_tour_id and coalesce(btrim(m.location_name), '') <> ''
   order by m.route_order nulls last, m.created_at, m.id
$$;
revoke all on function public.tour_pickup_points from public;
grant execute on function public.tour_pickup_points to anon, authenticated;
