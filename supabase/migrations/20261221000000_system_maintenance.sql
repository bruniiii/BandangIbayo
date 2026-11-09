-- ─────────────────────────────────────────────
-- System Maintenance: the website's control center
--
--   1. Maintenance Mode (main admin only): the joiner side shows a
--      "We'll be back soon" page, and joiners can't add bookings, requests,
--      posts, reviews or chat messages until it's turned off. Admins (and the
--      payment webhook) keep working. get_maintenance() can be read by anyone.
--   2. System Settings (main admin only): agency info and the email
--      reminders on/off switches (app_settings "agency_info", "email_settings").
--   3. Backup log: each CSV backup downloaded from System Maintenance.
--   4. Data checks: data_integrity() lists incomplete or inconsistent records.
--   5. Activity Logs: each change now keeps its old and new values.
--   6. Security summary: security_summary() (admins, locked logins).
--
-- Run after 20261220000000_tour_templates.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Maintenance Mode ──
-- Anyone (also logged out) can read whether the site is under maintenance,
-- plus the agency's contact info for the "We'll be back soon" page.
create or replace function public.get_maintenance()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'on', coalesce((select (value ->> 'on')::boolean from public.app_settings where key = 'maintenance_mode'), false),
    'message', (select value ->> 'message' from public.app_settings where key = 'maintenance_mode'),
    'until', (select value ->> 'until' from public.app_settings where key = 'maintenance_mode'),
    'started_at', (select value ->> 'started_at' from public.app_settings where key = 'maintenance_mode'),
    'agency', coalesce((select value from public.app_settings where key = 'agency_info'), '{}'::jsonb)
  );
$$;
revoke all on function public.get_maintenance from public;
grant execute on function public.get_maintenance to anon, authenticated;

create or replace function public.maintenance_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value ->> 'on')::boolean from public.app_settings where key = 'maintenance_mode'), false);
$$;
revoke all on function public.maintenance_on from public;
grant execute on function public.maintenance_on to anon, authenticated, service_role;

-- Turn it on or off (main admin only). The change is in the activity log
-- (app_settings has the activity trigger).
create or replace function public.set_maintenance(p_on boolean, p_message text default null, p_until text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can turn Maintenance Mode on or off.';
  end if;
  if length(coalesce(p_message, '')) > 500 then
    raise exception 'Keep the message under 500 characters.';
  end if;
  insert into public.app_settings (key, value, updated_at)
  values ('maintenance_mode', jsonb_build_object(
            'on', coalesce(p_on, false),
            'message', nullif(btrim(coalesce(p_message, '')), ''),
            'until', nullif(btrim(coalesce(p_until, '')), ''),
            'started_at', case when p_on then now() end,
            'by', auth.uid()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.get_maintenance();
end;
$$;
revoke all on function public.set_maintenance from public;
grant execute on function public.set_maintenance to authenticated;

-- While it's on, joiners can't add anything from the website.
create or replace function public.block_during_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_client_request() and not public.is_admin() and public.maintenance_on() then
    raise exception 'Bandang IBAYO is under maintenance right now. Please try again later.';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'exclusive_requests', 'feed_posts', 'feed_comments', 'reviews',
                           'tour_chat_messages', 'tour_waitlist', 'system_feedback'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_maintenance_guard', t);
      execute format('create trigger %I before insert on public.%I for each row execute function public.block_during_maintenance()', t || '_maintenance_guard', t);
    end if;
  end loop;
end;
$$;

-- ── 2. System Settings ──
-- Agency info (name, contacts) and the email switches; written by the main
-- admin through the usual app_settings policies. Defaults:
insert into public.app_settings (key, value) values
  ('agency_info', jsonb_build_object('name', 'Bandang IBAYO', 'email', '', 'phone', '', 'facebook', '', 'address', '')),
  ('email_settings', jsonb_build_object('day_before', true, 'balance', true, 'monthly_summary', true))
on conflict (key) do nothing;

-- ── 3. Backup log ──
create table if not exists public.backup_log (
  id         bigserial primary key,
  what       text not null,
  rows       integer not null default 0,
  admin_id   uuid default auth.uid(),
  admin_name text,
  at         timestamptz not null default now()
);
alter table public.backup_log enable row level security;
drop policy if exists "backup_log_admin" on public.backup_log;
create policy "backup_log_admin" on public.backup_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin() and admin_id = auth.uid());
grant select, insert on public.backup_log to authenticated;
grant usage, select on sequence public.backup_log_id_seq to authenticated;

-- ── 4. Data checks ──
-- Each check: { key, count, items: [{ id, label }] (up to 8) }. A check whose
-- table or column is missing is skipped, so one problem doesn't hide the rest.
create or replace function public.data_integrity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_out jsonb := '[]'::jsonb;
  v_items jsonb;
  v_count integer;
  v_check record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see this.';
  end if;

  for v_check in
    select * from (values
      ('overbooked',
       $q$select t.id::text as id, t.title || ' (' || to_char(t.start_date, 'Mon DD, YYYY') || '): ' || sum(b.slots_booked) || ' booked of ' || t.group_size as label
            from public.tours t join public.bookings b on b.tour_id = t.id
           where not coalesce(t.is_archived, false) and b.booking_status not in ('Cancelled', 'Rejected')
           group by t.id, t.title, t.start_date, t.group_size
          having sum(b.slots_booked) > t.group_size$q$),
      ('booking_without_tour',
       $q$select b.id::text, coalesce(b.booking_number, 'Booking') || ' · ' || coalesce(b.full_name, '') as label
            from public.bookings b left join public.tours t on t.id = b.tour_id
           where b.tour_id is not null and t.id is null$q$),
      ('overpaid',
       $q$select b.id::text, coalesce(b.booking_number, 'Booking') || ' · paid ₱' || to_char(b.amount_paid, 'FM999,999,990.00') || ' of ₱' || to_char(b.total_price, 'FM999,999,990.00') as label
            from public.bookings b
           where coalesce(b.amount_paid, 0) > coalesce(b.total_price, 0) + 1 and coalesce(b.total_price, 0) > 0$q$),
      ('open_tour_missing_details',
       $q$select t.id::text, t.title || ' (' || to_char(t.start_date, 'Mon DD, YYYY') || '): ' ||
                 concat_ws(', ',
                   case when coalesce(t.price, 0) <= 0 then 'no price' end,
                   case when coalesce(t.group_size, 0) <= 0 then 'no slots' end,
                   case when coalesce(array_length(t.image_urls, 1), 0) = 0 then 'no photo' end,
                   case when not exists (select 1 from public.tour_meetups m where m.tour_id = t.id) then 'no pickup points' end) as label
            from public.tours t
           where not coalesce(t.is_archived, false) and not coalesce(t.is_exclusive, false)
             and (coalesce(t.price, 0) <= 0 or coalesce(t.group_size, 0) <= 0 or coalesce(array_length(t.image_urls, 1), 0) = 0
                  or not exists (select 1 from public.tour_meetups m where m.tour_id = t.id))$q$),
      ('bad_dates',
       $q$select t.id::text, t.title || ': ends ' || to_char(t.end_date, 'Mon DD, YYYY') || ', before it starts ' || to_char(t.start_date, 'Mon DD, YYYY') as label
            from public.tours t where t.end_date < t.start_date$q$),
      ('past_tour_open',
       $q$select t.id::text, t.title || ' ended ' || to_char(coalesce(t.end_date, t.start_date), 'Mon DD, YYYY') as label
            from public.tours t
           where not coalesce(t.is_archived, false) and coalesce(t.end_date, t.start_date) < (now() at time zone 'Asia/Manila')::date$q$),
      ('joiner_missing_contact',
       $q$select p.id::text, coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, 'Joiner') ||
                 ': ' || concat_ws(', ', case when coalesce(btrim(p.phone_number), '') = '' then 'no phone' end,
                                         case when coalesce(btrim(p.first_name), '') = '' then 'no name' end) as label
            from public.profiles p
           where coalesce(p.role, 'joiner') = 'joiner' and p.archived_at is null
             and (coalesce(btrim(p.phone_number), '') = '' or coalesce(btrim(p.first_name), '') = '')$q$)
    ) as c(key, sql)
  loop
    begin
      execute format('select count(*), coalesce(jsonb_agg(x) filter (where n <= 8), ''[]''::jsonb) from (select row_number() over () as n, q.* from (%s) q) x', v_check.sql)
        into v_count, v_items;
      v_items := coalesce((select jsonb_agg(jsonb_build_object('id', e ->> 'id', 'label', e ->> 'label')) from jsonb_array_elements(v_items) e), '[]'::jsonb);
      v_out := v_out || jsonb_build_array(jsonb_build_object('key', v_check.key, 'count', v_count, 'items', v_items));
    exception when others then
      v_out := v_out || jsonb_build_array(jsonb_build_object('key', v_check.key, 'count', null, 'error', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('checked_at', now(), 'today', v_today, 'checks', v_out);
end;
$$;
revoke all on function public.data_integrity from public;
grant execute on function public.data_integrity to authenticated;

-- ── 5. Activity Logs: old and new values ──
alter table public.admin_activity add column if not exists old_values jsonb;
alter table public.admin_activity add column if not exists new_values jsonb;

create or replace function public.log_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_changed text[];
  v_row jsonb := coalesce(v_new, v_old);
  v_label text;
  v_before jsonb;
  v_after jsonb;
begin
  -- Only changes made by an admin on the website (not joiners, not the system).
  if auth.uid() is null or not public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    v_changed := array(select k from jsonb_object_keys(v_new) k
                        where k not in ('updated_at', 'notifications_seen_at', 'last_seen_at', 'last_login_at', 'last_feed_post_at')
                          and v_new -> k is distinct from v_old -> k);
    if coalesce(array_length(v_changed, 1), 0) = 0 then return new; end if;
    -- Old and new value of each changed field (long text is shortened).
    select jsonb_object_agg(k, case when jsonb_typeof(v_old -> k) = 'string' and length(v_old ->> k) > 300
                                    then to_jsonb(left(v_old ->> k, 300) || '…') else v_old -> k end),
           jsonb_object_agg(k, case when jsonb_typeof(v_new -> k) = 'string' and length(v_new ->> k) > 300
                                    then to_jsonb(left(v_new ->> k, 300) || '…') else v_new -> k end)
      into v_before, v_after
      from unnest(v_changed) k;
  end if;
  v_label := coalesce(v_row ->> 'title', v_row ->> 'booking_number', v_row ->> 'name', v_row ->> 'plate_number',
                      v_row ->> 'destination', v_row ->> 'key', v_row ->> 'tour_id', v_row ->> 'id');
  insert into public.admin_activity (admin_id, admin_name, table_name, row_id, action, summary, changed, old_values, new_values)
  values (auth.uid(),
          (select nullif(btrim(concat_ws(' ', first_name, last_name)), '') from public.profiles where id = auth.uid()),
          tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'tour_id', v_row ->> 'key'),
          case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end,
          v_label, v_changed, v_before, v_after);
  return coalesce(new, old);
end;
$$;

-- Admin accounts and joiner accounts are logged too (who removed or restored whom).
do $$
declare
  t text;
begin
  foreach t in array array['tours', 'tour_rates', 'tour_expenses', 'bookings', 'exclusive_requests', 'feed_posts',
                           'pickup_spots', 'fleet_drivers', 'fleet_vans', 'tour_vehicles', 'app_settings',
                           'tour_templates', 'profiles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_admin_activity', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_activity()', t || '_admin_activity', t);
    end if;
  end loop;
end;
$$;

-- ── 6. Security summary ──
create or replace function public.security_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see this.';
  end if;
  return jsonb_build_object(
    'admins', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'email', p.email,
                 'main', coalesce(p.is_main_admin, false),
                 'last_sign_in', (select u.last_sign_in_at from auth.users u where u.id = p.id))
               order by p.is_main_admin desc nulls last, p.first_name)
               from public.profiles p where p.role = 'admin'), '[]'::jsonb),
    'locked_now', (select count(*) from public.login_lockouts where locked_until > now()),
    'failed_recent', coalesce((select jsonb_agg(jsonb_build_object('email', l.email, 'failed', l.failed_count, 'locked_until', l.locked_until, 'at', l.updated_at)
                                 order by l.updated_at desc)
                               from (select * from public.login_lockouts
                                      where failed_count > 0 and updated_at > now() - interval '7 days'
                                      order by updated_at desc limit 20) l), '[]'::jsonb),
    'archived_admins', (select count(*) from public.profiles where role = 'archived_admin')
  );
end;
$$;
revoke all on function public.security_summary from public;
grant execute on function public.security_summary to authenticated;

-- ── System Overview: a few more totals ──
create or replace function public.system_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see this.';
  end if;
  return jsonb_build_object(
    'joiners', (select count(*) from public.profiles where coalesce(role, 'joiner') = 'joiner' and archived_at is null),
    'archived_joiners', (select count(*) from public.profiles where coalesce(role, 'joiner') = 'joiner' and archived_at is not null),
    'active_tours', (select count(*) from public.tours where not coalesce(is_archived, false) and not coalesce(is_exclusive, false)),
    'archived_tours', (select count(*) from public.tours where coalesce(is_archived, false)),
    'bookings', (select count(*) from public.bookings),
    'requests', (select count(*) from public.exclusive_requests),
    'last_maintenance', (select max(ran_at) from public.maintenance_log),
    'last_backup', (select max(at) from public.backup_log),
    'maintenance', public.get_maintenance(),
    'db_time', now()
  );
end;
$$;
revoke all on function public.system_overview from public;
grant execute on function public.system_overview to authenticated;
