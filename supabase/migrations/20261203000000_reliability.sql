-- ─────────────────────────────────────────────
-- Reliability
--
-- 1. Every notification about a booking or a feed post remembers exactly
--    which one (notifications.ref = 'booking:<id>' or 'post:<id>'), filled
--    in by the database when the notification is made, so clicking it never
--    has to guess from the names in the text.
-- 2. "Van leaves at" (tours.departure_time, e.g. "10:00 PM"): the pickup
--    ETAs are worked out from it.
-- 3. The van's location went quiet: when the driver's phone stops sending
--    for 10 minutes during a trip (screen off, no signal, dead battery), the
--    admins are told, once each time it goes quiet.
-- 4. Website errors: when something breaks on someone's screen, the website
--    saves the error (client_errors) so admins can see it in Admin Settings.
--    Kept for 30 days.
-- 5. Places along a road found on the map are saved (route_place_cache), so
--    the next look-up of the same road doesn't need the busy free servers.
--
-- Run after 20261202000000_auto_tracking.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Notifications remember their booking / post ──
alter table public.notifications add column if not exists ref text;

create or replace function public.notification_fill_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := coalesce(new.title, '') || ' ' || coalesce(new.message, '');
  v_num  text;
  v_id   text;
begin
  if new.ref is not null then return new; end if;

  if new.type = 'feed' then
    -- The post that was just shared (made in this same moment), else the newest waiting one.
    v_id := (select p.id::text from public.feed_posts p
              where p.created_at >= now() - interval '2 minutes'
              order by (p.created_at = now()) desc, p.created_at desc
              limit 1);
    if v_id is not null then new.ref := 'post:' || v_id; end if;
    return new;
  end if;

  if new.type in ('booking', 'payment', 'cancellation', 'waitlist', 'tracking', 'review') then
    v_num := upper(substring(v_text from '(?i)BK-[0-9]{4}-[0-9]+'));
    if v_num is not null then
      v_id := (select b.id::text from public.bookings b where upper(b.booking_number) = v_num limit 1);
    end if;
    -- "New Booking Paid Online" (no booking number): the booking paid in this same moment.
    if v_id is null and new.title = 'New Booking Paid Online' then
      v_id := (select b.id::text from public.bookings b
                where b.paid_online_at = now()
                order by b.paid_online_at desc limit 1);
    end if;
    if v_id is null and new.related_id is not null then
      v_id := (select b.id::text from public.bookings b where b.id::text = new.related_id::text limit 1);
    end if;
    if v_id is not null then new.ref := 'booking:' || v_id; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_fill_ref on public.notifications;
create trigger notifications_fill_ref
  before insert on public.notifications
  for each row execute function public.notification_fill_ref();

-- ── 2. "Van leaves at" ──
alter table public.tours add column if not exists departure_time text;

-- ── 3. The van's location went quiet ──
create or replace function public.notify_van_quiet()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_key text;
begin
  for v_row in
    select v.tour_id, v.updated_at, t.title
      from public.van_locations v
      join public.tours t on t.id = v.tour_id
     where v.updated_at < now() - interval '10 minutes'
       and v.updated_at > now() - interval '6 hours'
       and exists (select 1 from public.tour_meetups m
                    where m.tour_id = v.tour_id and coalesce(m.status, '') <> 'ARRIVED')
  loop
    v_key := v_row.tour_id::text || ':' || extract(epoch from v_row.updated_at)::bigint::text;
    continue when exists (select 1 from public.email_log l where l.kind = 'van-quiet' and l.ref = v_key);
    insert into public.notifications (user_id, title, message, type, related_id)
    select a.id, 'The van''s location stopped updating',
           format('%s: the driver''s phone hasn''t sent the van''s location since %s (Philippine time). The screen may be off, the page closed, or there''s no signal. Call the driver, or use Manual Override in Tracking Management.',
                  v_row.title, to_char(v_row.updated_at at time zone 'Asia/Manila', 'HH12:MI AM')),
           'tracking', null::uuid
      from public.profiles a where a.role = 'admin';
    insert into public.email_log (kind, ref) values ('van-quiet', v_key) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_van_quiet() from public, anon;
grant execute on function public.notify_van_quiet() to authenticated, service_role;

-- ── 4. Website errors ──
create table if not exists public.client_errors (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid(),
  page       text,
  message    text not null,
  detail     text,
  user_agent text
);
alter table public.client_errors enable row level security;
drop policy if exists "client_errors_insert" on public.client_errors;
create policy "client_errors_insert" on public.client_errors
  for insert to anon, authenticated
  with check (length(message) <= 1000 and length(coalesce(detail, '')) <= 4000
              and length(coalesce(page, '')) <= 300 and length(coalesce(user_agent, '')) <= 300
              and (user_id is null or user_id = auth.uid()));
drop policy if exists "client_errors_admin" on public.client_errors;
create policy "client_errors_admin" on public.client_errors
  for select to authenticated using (public.is_admin());
drop policy if exists "client_errors_admin_delete" on public.client_errors;
create policy "client_errors_admin_delete" on public.client_errors
  for delete to authenticated using (public.is_admin());
grant insert on public.client_errors to anon, authenticated;
grant select, delete on public.client_errors to authenticated;
grant usage, select on sequence public.client_errors_id_seq to anon, authenticated;

-- ── 5. Places along a road, saved ──
create table if not exists public.route_place_cache (
  key      text primary key,
  places   jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.route_place_cache enable row level security;
drop policy if exists "route_place_cache_admin" on public.route_place_cache;
create policy "route_place_cache_admin" on public.route_place_cache
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.route_place_cache to authenticated;

-- Every 5 minutes: the van-quiet check. Every night: old errors and saved places are cleared.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('van-quiet', 'cleanup-client-errors');
    perform cron.schedule('van-quiet', '4-59/5 * * * *', 'select public.notify_van_quiet()');
    perform cron.schedule('cleanup-client-errors', '25 17 * * *',
      $job$delete from public.client_errors where created_at < now() - interval '30 days';
           delete from public.route_place_cache where saved_at < now() - interval '30 days'$job$);
  end if;
end $$;
