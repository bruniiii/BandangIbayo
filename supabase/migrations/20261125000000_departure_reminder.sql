-- ─────────────────────────────────────────────
-- 1. Reminder 15 minutes before departure
--    Every 5 minutes, joiners whose pickup time is 15 minutes away or less
--    get a notification ("Your pickup is in 15 minutes"), once per booking
--    (email_log kind 'departure-15'). The send-email function then emails
--    the same people (kind 'departure-15-email').
--    Departure = the joiner's chosen pickup point's time (else the first
--    pickup point) on the tour's start date, Philippine time. Times like
--    "8:00 PM", "08:00 pm" or "20:00" are understood.
-- 2. Request a Tour: the columns the form saves always exist.
--
-- Run after 20261124000000_archived_joiners.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists region text;
alter table public.exclusive_requests add column if not exists notes text;
alter table public.exclusive_requests add column if not exists budget numeric;

-- "8:00 PM" on a date → a Manila timestamp (null when the time can't be read).
create or replace function public.pickup_timestamp(p_date date, p_time text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v text := upper(regexp_replace(btrim(coalesce(p_time, '')), '\s+', ' ', 'g'));
  m text[];
  h int;
  mi int;
begin
  if p_date is null or v = '' then return null; end if;
  m := regexp_match(v, '^(\d{1,2})[:.](\d{2})\s*(AM|PM|NN|MN)?');
  if m is null then return null; end if;
  h := m[1]::int; mi := m[2]::int;
  if m[3] in ('PM') and h < 12 then h := h + 12; end if;
  if m[3] in ('AM', 'MN') and h = 12 then h := 0; end if;
  if h > 23 or mi > 59 then return null; end if;
  return (p_date + make_time(h, mi, 0)) at time zone 'Asia/Manila';
end;
$$;

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
        select m.location_name, m.scheduled_time, public.pickup_timestamp(t.start_date, m.scheduled_time) as departs_at
          from public.tour_meetups m
         where m.tour_id = t.id
         order by (lower(btrim(m.location_name)) = lower(btrim(coalesce(b.pickup_point, '')))) desc, m.created_at, m.id
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

-- Every 5 minutes: the notifications (in the database), then the emails
-- (send-email function, when pg_net is on).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('departure-reminders', 'departure-emails');
    perform cron.schedule('departure-reminders', '*/5 * * * *', 'select public.notify_departure_soon()');
    if exists (select 1 from pg_extension where extname = 'pg_net') then
      perform cron.schedule(
        'departure-emails',
        '1-59/5 * * * *',
        $job$select net.http_post(
          url := 'https://renugdlntgybazpikmbu.supabase.co/functions/v1/send-email',
          body := '{"action":"departure-emails"}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
          )
        )$job$
      );
    end if;
  end if;
exception when others then
  raise notice 'Scheduling the departure reminder failed (%). Enable pg_cron and pg_net, then run this file again.', sqlerrm;
end;
$$;
