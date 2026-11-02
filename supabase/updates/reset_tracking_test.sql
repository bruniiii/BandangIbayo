-- ═══════════════════════════════════════════════════════════════════════
-- RESET THE TRACKING TEST TOUR (to try the trip again)
--
-- For the tour "Tracking Test: Malhacan Parish to Supima Square":
--   • every pickup stop goes back to Pending Pickup (not Arrived),
--   • the "almost there" alerts can be sent again,
--   • the tracking feed is cleared and the van's last location removed.
-- The stops keep their names and map pins. Bookings are not touched.
--
-- Run it in the Supabase SQL Editor: paste it all, click Run.
-- Then on the driver's phone: open the Driver Link again → Start Trip.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_ids bigint[] := array(select id from public.tours where title = 'Tracking Test: Malhacan Parish to Supima Square');
  v_has_hits boolean := exists (select 1 from information_schema.columns
                                 where table_schema = 'public' and table_name = 'tour_meetups' and column_name = 'arrive_hits');
begin
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'The tracking test tour wasn''t found. Run tracking_test_tour.sql first.';
  end if;

  update public.tour_meetups set status = 'DEPARTURE', arrived_at = null, near_notified_at = null
   where tour_id = any (v_ids);
  if v_has_hits then
    execute 'update public.tour_meetups set arrive_hits = 0 where tour_id = any ($1)' using v_ids;
  end if;
  delete from public.tour_tracking_logs where tour_id = any (v_ids);
  delete from public.van_locations where tour_id = any (v_ids);

  raise notice 'Tracking test tour reset: % stop(s) back to Pending Pickup.',
    (select count(*) from public.tour_meetups where tour_id = any (v_ids));
end $$;
