-- ─────────────────────────────────────────────
-- Trip emails and the "Rate your trip" invite
--
-- 1. "How was your trip?": the day after a tour ends, each joiner who went
--    (paid, not cancelled) and hasn't reviewed it yet gets a notification
--    inviting them to leave a review. Once per joiner per tour.
-- 2. "Pickup Starts Today" notices now open the Tracking tab.
-- 3. Email copies: every hour the send-email function sends, once each,
--      - the day-before reminder (in the evening, from 5 PM),
--      - the "Pickup Starts Today" email,
--      - the "Cancellation Approved" email (also for auto-approved ones),
--      - the "Rate your trip" email.
--    email_log remembers what was sent. The hourly job needs the pg_cron and
--    pg_net extensions (Database → Extensions); a secret for it is created here.
--
-- Run after 20261028000000_pickup_day_notice.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Review invites ─────────────────────────
do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.review_invites (
      tour_id %s not null references public.tours(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      sent_at timestamptz not null default now(),
      primary key (tour_id, user_id)
    )$f$, tour_id_type);
end;
$$;
alter table public.review_invites enable row level security;

create or replace function public.notify_review_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select distinct b.user_id, t.id as tour_id, t.title
      from public.bookings b
      join public.tours t on t.id = b.tour_id
     -- ended yesterday, or up to 3 days ago (in case a day was missed)
     where coalesce(t.end_date, t.start_date) between v_today - 3 and v_today - 1
       and (b.payment_status = 'Complete' or b.booking_status = 'Completed')
       and b.booking_status not in ('Cancelled', 'Rejected')
       and b.user_id is not null
       and not exists (select 1 from public.reviews r where r.tour_id = t.id and r.user_id = b.user_id)
       and not exists (select 1 from public.review_invites i where i.tour_id = t.id and i.user_id = b.user_id)
  loop
    insert into public.notifications (user_id, title, message, type)
    values (v_row.user_id, 'How was your trip?',
            format('We hope you enjoyed %s! Tap here to rate your trip and leave a review. It helps other travelers and helps us improve.', v_row.title),
            'review');
    insert into public.review_invites (tour_id, user_id) values (v_row.tour_id, v_row.user_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_review_invites() from public;
grant execute on function public.notify_review_invites() to authenticated, service_role;

-- ── 2. Pickup notice opens Tracking ───────────
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
      'tracking'
    );
    insert into public.pickup_day_notices (tour_id, user_id) values (v_row.tour_id, v_row.user_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Both daily notices in one call (the app calls this when tour lists load).
create or replace function public.daily_notices()
returns integer
language sql
security definer
set search_path = public
as $$ select public.notify_pickup_day() + public.notify_review_invites() $$;

revoke all on function public.daily_notices() from public;
grant execute on function public.daily_notices() to authenticated, service_role;

-- ── 3. Email log + hourly email run ───────────
create table if not exists public.email_log (
  kind    text not null,  -- 'pickup-day' | 'cancellation-approved' | 'review-invite'
  ref     text not null,  -- booking id, or 'tour_id:user_id'
  sent_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.email_log enable row level security;

-- Cancellations approved before today were already handled: don't email them now.
insert into public.email_log (kind, ref)
select 'cancellation-approved', b.id::text
  from public.bookings b
 where b.booking_status = 'Cancelled' and b.cancellation_requested_at is not null
on conflict do nothing;

-- A random secret the hourly job sends, so only it can start the run.
create table if not exists public.app_secrets (
  name  text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value)
values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'notify-pickup-day') then
    perform cron.unschedule('notify-pickup-day');
  end if;
  perform cron.schedule('notify-pickup-day', '10 16 * * *', 'select public.daily_notices()');

  if exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from cron.job where jobname = 'trip-emails') then
      perform cron.unschedule('trip-emails');
    end if;
    perform cron.schedule(
      'trip-emails',
      '7 * * * *',
      $job$select net.http_post(
        url := 'https://renugdlntgybazpikmbu.supabase.co/functions/v1/send-email',
        body := '{"action":"scheduled"}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
        )
      )$job$
    );
  else
    raise notice 'pg_net is not enabled: enable it (Database → Extensions) and run this file again, so trip emails are sent automatically.';
  end if;
exception when others then
  raise notice 'pg_cron not available (%); notices are sent when the app loads tours, but trip emails need pg_cron.', sqlerrm;
end;
$$;

select public.daily_notices();
