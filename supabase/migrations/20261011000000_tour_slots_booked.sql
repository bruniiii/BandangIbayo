-- Public slot counts per open tour.
--
-- The tour pages need "X slots left" for logged-out visitors too. This returns
-- only per-tour totals (no names, emails or other booking details), so anon
-- users can call it without being able to read the bookings table itself.
-- Counts the same bookings create_booking() counts against capacity.

create or replace function public.tour_slots_booked()
returns table (tour_id public.tours.id%type, slots_booked bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.tour_id, coalesce(sum(b.slots_booked), 0)::bigint
  from public.bookings b
  join public.tours t on t.id = b.tour_id
  where not coalesce(t.is_archived, false)
    and b.booking_status not in ('Cancelled', 'Rejected')
  group by b.tour_id;
$$;

revoke all on function public.tour_slots_booked from public;
grant execute on function public.tour_slots_booked to anon, authenticated;
