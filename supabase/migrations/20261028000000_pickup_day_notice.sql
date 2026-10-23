-- ─────────────────────────────────────────────
-- "Pickup starts today" notification
--
-- On a tour's start date (Philippine time), every joiner with an active
-- booking on it gets a notification that pickup starts today, with the first
-- pickup point and time when the admin has added them. Each joiner gets it
-- once per tour.
--
-- Runs every night at 12:10 AM Philippine time when pg_cron is available, and
-- whenever the app loads tour lists, so it also works without pg_cron.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.pickup_day_notices (
      tour_id %s not null references public.tours(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      sent_at timestamptz not null default now(),
      primary key (tour_id, user_id)
    )$f$, tour_id_type);
end;
$$;

-- Only the function below writes or reads it.
alter table public.pickup_day_notices enable row level security;

create or replace function public.notify_pickup_day()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_row record;
  v_stop record;
  v_count integer := 0;
begin
  for v_row in
    select distinct b.user_id, t.id as tour_id, t.title
      from public.bookings b
      join public.tours t on t.id = b.tour_id
     where t.start_date = v_today
       and b.booking_status not in ('Cancelled', 'Rejected')
       and b.user_id is not null
       and not exists (select 1 from public.pickup_day_notices n
                        where n.tour_id = t.id and n.user_id = b.user_id)
  loop
    -- First pickup stop, in the order the admin added them.
    select m.location_name, m.scheduled_time into v_stop
      from public.tour_meetups m
     where m.tour_id = v_row.tour_id
     order by m.created_at, m.id
     limit 1;

    insert into public.notifications (user_id, title, message, type)
    values (
      v_row.user_id,
      'Pickup Starts Today',
      case when v_stop.location_name is not null then
        format('Today is the day! Pickup for %s starts today. First pickup: %s%s. Open Tracking to see where the van is.',
               v_row.title, v_stop.location_name,
               case when coalesce(v_stop.scheduled_time, '') <> '' then ' at ' || v_stop.scheduled_time else '' end)
      else
        format('Today is the day! Pickup for %s starts today. Open Tracking for the pickup points and times.', v_row.title)
      end,
      'tour'
    );
    insert into public.pickup_day_notices (tour_id, user_id) values (v_row.tour_id, v_row.user_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_pickup_day() from public;
grant execute on function public.notify_pickup_day() to authenticated, service_role;

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'notify-pickup-day') then
    perform cron.unschedule('notify-pickup-day');
  end if;
  perform cron.schedule('notify-pickup-day', '10 16 * * *', 'select public.notify_pickup_day()');
exception when others then
  raise notice 'pg_cron not available (%); the notice is sent when the app loads tours.', sqlerrm;
end;
$$;

-- Today's tours, right away.
select public.notify_pickup_day();
