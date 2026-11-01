-- ─────────────────────────────────────────────
-- Tracking runs by itself
--
-- 1. Trips that leave the night before (an itinerary with "Day 0") start on
--    the day before the tour's start date, and stops after midnight are on
--    the next day. The 15-minute pickup reminder now uses that date (it was
--    a day late for overnight trips).
-- 2. "The van hasn't started the trip": 10 minutes after the first pickup
--    time, if the driver hasn't tapped Start Trip on the driver link (and
--    nobody moved the van by hand), the admins are told once, so they can
--    send the driver link or use Manual Override. Checked every 5 minutes.
--
-- Run after 20261201000000_live_van_location.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- The day the trip really starts: the day before the start date when the
-- itinerary has a "Day 0" (travel night), else the start date.
create or replace function public.trip_start_day(p_start date, p_itinerary text)
returns date
language sql
immutable
as $$
  select case when coalesce(p_itinerary, '') ~* '(^|\n)\s*day\s*0\y' then p_start - 1 else p_start end;
$$;

-- When the van reaches a stop (Manila time): its time on the trip's first
-- day, or the next day when it's earlier than the first stop (past midnight).
create or replace function public.stop_departs_at(p_start date, p_itinerary text, p_first_time text, p_time text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_day   date := public.trip_start_day(p_start, p_itinerary);
  v_first timestamptz := public.pickup_timestamp(v_day, p_first_time);
  v_at    timestamptz := public.pickup_timestamp(v_day, p_time);
begin
  if v_at is null then return null; end if;
  if v_first is not null and v_at < v_first then v_at := v_at + interval '1 day'; end if;
  return v_at;
end;
$$;

-- The first stop's time (in the order the van reaches them).
create or replace function public.first_stop_time(p_tour_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.scheduled_time from public.tour_meetups m
   where m.tour_id = p_tour_id and btrim(coalesce(m.scheduled_time, '')) <> ''
   order by m.route_order nulls last, m.created_at, m.id
   limit 1;
$$;

-- ── 1. The 15-minute reminder, on the right day ──
create or replace function public.notify_departure_soon()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select b.id, b.user_id, b.pickup_point, t.title, d.location_name, d.scheduled_time, d.departs_at
      from public.bookings b
      join public.tours t on t.id = b.tour_id
      cross join lateral (
        select m.location_name, m.scheduled_time,
               public.stop_departs_at(t.start_date, t.itinerary, public.first_stop_time(t.id), m.scheduled_time) as departs_at
          from public.tour_meetups m
         where m.tour_id = t.id
         order by (lower(btrim(m.location_name)) = lower(btrim(coalesce(b.pickup_point, '')))) desc,
                  m.route_order nulls last, m.created_at, m.id
         limit 1
      ) d
     where b.booking_status not in ('Cancelled', 'Rejected')
       and b.payment_status = 'Complete'
       and b.user_id is not null
       and t.start_date between (now() at time zone 'Asia/Manila')::date - 1 and (now() at time zone 'Asia/Manila')::date + 1
       and d.departs_at is not null
       and now() >= d.departs_at - interval '15 minutes'
       and now() < d.departs_at
       and not exists (select 1 from public.email_log l where l.kind = 'departure-15' and l.ref = b.id::text)
  loop
    insert into public.notifications (user_id, title, message, type, related_id)
    values (
      v_row.user_id,
      'Your pickup is in 15 minutes ⏰',
      format('%s: pickup at %s at %s. Please be at the pickup point now, and open Tracking to see where the van is.',
             v_row.title, v_row.location_name, v_row.scheduled_time),
      'tracking', null
    );
    insert into public.email_log (kind, ref) values ('departure-15', v_row.id::text) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_departure_soon() from public, anon;
grant execute on function public.notify_departure_soon() to authenticated, service_role;

-- ── 2. The van hasn't started the trip ──
create or replace function public.notify_trip_not_started()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  for v_row in
    select t.id, t.title, f.location_name, f.scheduled_time,
           public.stop_departs_at(t.start_date, t.itinerary, f.scheduled_time, f.scheduled_time) as departs_at
      from public.tours t
      cross join lateral (
        select m.location_name, m.scheduled_time from public.tour_meetups m
         where m.tour_id = t.id and btrim(coalesce(m.scheduled_time, '')) <> ''
         order by m.route_order nulls last, m.created_at, m.id
         limit 1
      ) f
     where not coalesce(t.is_archived, false)
       and t.start_date between v_today - 1 and v_today + 1
  loop
    continue when v_row.departs_at is null
      or now() < v_row.departs_at + interval '10 minutes'
      or now() > v_row.departs_at + interval '3 hours';
    -- Started: the driver is sharing, or the van was moved along by hand.
    continue when exists (select 1 from public.van_locations v where v.tour_id = v_row.id);
    continue when exists (select 1 from public.tour_meetups m
                           where m.tour_id = v_row.id and m.status in ('CURRENTLY HERE', 'ARRIVED'));
    -- Nobody booked: nothing to track.
    continue when not exists (select 1 from public.bookings b
                               where b.tour_id = v_row.id and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected'));
    continue when exists (select 1 from public.email_log l where l.kind = 'trip-not-started' and l.ref = v_row.id::text);

    insert into public.notifications (user_id, title, message, type, related_id)
    select a.id, 'The van hasn''t started the trip',
           format('%s: the van was due at %s at %s, but the driver hasn''t tapped Start Trip yet. Send the Driver Link from Tracking Management, or use Manual Override there.',
                  v_row.title, v_row.location_name, v_row.scheduled_time),
           'tracking', null::uuid
      from public.profiles a where a.role = 'admin';
    insert into public.email_log (kind, ref) values ('trip-not-started', v_row.id::text) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_trip_not_started() from public, anon;
grant execute on function public.notify_trip_not_started() to authenticated, service_role;

-- Every 5 minutes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'trip-not-started';
    perform cron.schedule('trip-not-started', '2-59/5 * * * *', 'select public.notify_trip_not_started()');
  end if;
end $$;
