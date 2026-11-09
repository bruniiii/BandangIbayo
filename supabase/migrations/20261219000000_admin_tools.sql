-- ─────────────────────────────────────────────
-- Tools that make the admins' work easier
--
--   1. Saved chat replies: any admin can change them (app_settings
--      "chat_quick_replies"; other settings stay main-admin only).
--   2. System Maintenance: system_health() and run_maintenance() + maintenance_log.
--   3. Admin activity log: who added, changed or removed what, and when.
--
-- Run after 20261218000000_private_tour_wording.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Saved chat replies ──
drop policy if exists "app_settings_admin_quick_replies_insert" on public.app_settings;
create policy "app_settings_admin_quick_replies_insert" on public.app_settings
  for insert to authenticated with check (public.is_admin() and key = 'chat_quick_replies');
drop policy if exists "app_settings_admin_quick_replies_update" on public.app_settings;
create policy "app_settings_admin_quick_replies_update" on public.app_settings
  for update to authenticated using (public.is_admin() and key = 'chat_quick_replies') with check (public.is_admin() and key = 'chat_quick_replies');

-- ── 2. System Maintenance: health check, cleanup, and its log ──
create table if not exists public.maintenance_log (
  id        bigserial primary key,
  task      text not null,
  affected  integer not null default 0,
  admin_id  uuid default auth.uid(),
  automatic boolean not null default false,
  ran_at    timestamptz not null default now()
);
alter table public.maintenance_log enable row level security;
drop policy if exists "maintenance_log_admin_read" on public.maintenance_log;
create policy "maintenance_log_admin_read" on public.maintenance_log
  for select to authenticated using (public.is_admin());
grant select on public.maintenance_log to authenticated;

-- What needs cleaning, as counts.
create or replace function public.system_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see this.';
  end if;
  v := jsonb_build_object(
    'past_tours_open', (select count(*) from public.tours where not coalesce(is_archived, false) and coalesce(end_date, start_date) < v_today),
    'expired_holds', (select count(*) from public.bookings where payment_status = 'Awaiting Payment' and booking_status not in ('Cancelled', 'Rejected') and hold_expires_at < now()),
    'old_notifications', (select count(*) from public.notifications where is_read and created_at < now() - interval '90 days'),
    'old_errors', (select count(*) from public.client_errors where created_at < now() - interval '30 days'),
    'errors_7_days', (select count(*) from public.client_errors where created_at > now() - interval '7 days'),
    'stale_requests', (select count(*) from public.exclusive_requests where status = 'Pending' and created_at < now() - interval '30 days'),
    'archived_joiners', (select count(*) from public.profiles where archived_at is not null and coalesce(role, 'joiner') = 'joiner'),
    'tours', (select count(*) from public.tours where not coalesce(is_archived, false)),
    'bookings', (select count(*) from public.bookings),
    'joiners', (select count(*) from public.profiles where coalesce(role, 'joiner') = 'joiner'),
    'last_run', (select max(ran_at) from public.maintenance_log)
  );
  return v;
end;
$$;

-- Runs one cleanup and logs it. Returns how many rows it changed.
create or replace function public.run_maintenance(p_task text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  b record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can run maintenance.';
  end if;
  if p_task = 'archive_past_tours' then
    update public.tours set is_archived = true
     where not coalesce(is_archived, false)
       and coalesce(end_date, start_date) < (now() at time zone 'Asia/Manila')::date;
    get diagnostics n = row_count;
  elsif p_task = 'expire_holds' then
    for b in select id from public.bookings
              where payment_status = 'Awaiting Payment' and booking_status not in ('Cancelled', 'Rejected') and hold_expires_at < now() loop
      if public.release_payment_hold(b.id, 'Checkout expired (maintenance)', 'System Maintenance') then n := n + 1; end if;
    end loop;
  elsif p_task = 'old_notifications' then
    delete from public.notifications where is_read and created_at < now() - interval '90 days';
    get diagnostics n = row_count;
  elsif p_task = 'old_errors' then
    delete from public.client_errors where created_at < now() - interval '30 days';
    get diagnostics n = row_count;
  elsif p_task = 'inactive_joiners' then
    n := coalesce(public.archive_inactive_joiners(), 0);
  else
    raise exception 'Unknown maintenance task.';
  end if;
  insert into public.maintenance_log (task, affected) values (p_task, n);
  return n;
end;
$$;

revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;
revoke all on function public.run_maintenance(text) from public, anon;
grant execute on function public.run_maintenance(text) to authenticated;

-- ── 3. Admin activity log: who changed what, and when ──
create table if not exists public.admin_activity (
  id         bigserial primary key,
  admin_id   uuid,
  admin_name text,
  table_name text not null,
  row_id     text,
  action     text not null,          -- added | changed | removed
  summary    text,
  changed    text[],
  at         timestamptz not null default now()
);
create index if not exists admin_activity_at on public.admin_activity (at desc);
alter table public.admin_activity enable row level security;
drop policy if exists "admin_activity_admin_read" on public.admin_activity;
create policy "admin_activity_admin_read" on public.admin_activity
  for select to authenticated using (public.is_admin());
grant select on public.admin_activity to authenticated;

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
begin
  -- Only changes made by an admin on the website (not joiners, not the system).
  if auth.uid() is null or not public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    v_changed := array(select k from jsonb_object_keys(v_new) k
                        where k not in ('updated_at') and v_new -> k is distinct from v_old -> k);
    if coalesce(array_length(v_changed, 1), 0) = 0 then return new; end if;
  end if;
  v_label := coalesce(v_row ->> 'title', v_row ->> 'booking_number', v_row ->> 'name', v_row ->> 'plate_number',
                      v_row ->> 'destination', v_row ->> 'key', v_row ->> 'tour_id', v_row ->> 'id');
  insert into public.admin_activity (admin_id, admin_name, table_name, row_id, action, summary, changed)
  values (auth.uid(),
          (select nullif(btrim(concat_ws(' ', first_name, last_name)), '') from public.profiles where id = auth.uid()),
          tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'tour_id', v_row ->> 'key'),
          case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end,
          v_label, v_changed);
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tours', 'tour_rates', 'tour_expenses', 'bookings', 'exclusive_requests', 'feed_posts',
                           'pickup_spots', 'fleet_drivers', 'fleet_vans', 'tour_vehicles', 'app_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_admin_activity', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_activity()', t || '_admin_activity', t);
    end if;
  end loop;
end;
$$;
