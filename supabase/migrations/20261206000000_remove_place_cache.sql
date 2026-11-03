-- ─────────────────────────────────────────────
-- Remove the old "places along the road" list
--
-- Pickup points are now found with the place search (OpenRouteService through
-- the routes function), not the free OpenStreetMap servers, so the saved
-- list of places along a road (route_place_cache, 20261203) isn't used.
-- 1. The nightly cleanup no longer clears it (only old website errors).
-- 2. The table is removed.
--
-- Run after 20261205000000_stricter_arrival.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cleanup-client-errors';
    perform cron.schedule('cleanup-client-errors', '25 17 * * *',
      $job$delete from public.client_errors where created_at < now() - interval '30 days'$job$);
  end if;
end $$;

drop table if exists public.route_place_cache;
