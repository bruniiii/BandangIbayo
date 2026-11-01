-- ─────────────────────────────────────────────
-- Archived joiner accounts
--
-- 1. A joiner who deactivates (or "deletes") their account is archived: their
--    data stays, they can't log in, and an admin can restore them
--    (profiles.archived_at / archive_reason).
-- 2. Joiners with no login for a set time are archived automatically. The
--    main admin turns this on/off and sets the time in Admin Settings
--    (app_settings: inactive_archive_enabled, inactive_archive_days;
--    default on, 730 days = 2 years). Runs every day (pg_cron), and also
--    whenever an admin opens Joiner Accounts.
--
-- Run after 20261123000000_tour_favorites.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists archived_at timestamptz;
alter table public.profiles add column if not exists archive_reason text;

-- Accounts deactivated before this update count as archived.
update public.profiles
   set archived_at = deactivated_at, archive_reason = 'deactivated'
 where deactivated_at is not null and archived_at is null;

-- ── Settings (admins read; the main admin changes them) ──
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
grant select, insert, update on public.app_settings to authenticated;

drop policy if exists "app_settings_admin_read" on public.app_settings;
create policy "app_settings_admin_read" on public.app_settings
  for select to authenticated using (public.is_admin());
drop policy if exists "app_settings_main_admin_write" on public.app_settings;
create policy "app_settings_main_admin_write" on public.app_settings
  for insert to authenticated with check (public.is_main_admin());
drop policy if exists "app_settings_main_admin_update" on public.app_settings;
create policy "app_settings_main_admin_update" on public.app_settings
  for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());

insert into public.app_settings (key, value) values
  ('inactive_archive_enabled', 'true'::jsonb),
  ('inactive_archive_days', '730'::jsonb)
on conflict (key) do nothing;

-- ── The joiner archives (deactivates) their own account ──
create or replace function public.deactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'archived_admin')) then
    raise exception 'Admin accounts can''t be deactivated here.';
  end if;
  if exists (
    select 1
      from public.bookings b join public.tours t on t.id = b.tour_id
     where b.user_id = auth.uid()
       and b.booking_status not in ('Cancelled', 'Rejected')
       and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
  ) then
    raise exception 'You have an upcoming booking. You can deactivate your account after your trip, or once the booking is cancelled.';
  end if;
  update public.profiles
     set archived_at = now(), archive_reason = 'deactivated', deactivated_at = now()
   where id = auth.uid();
end;
$$;

-- Archived joiners can't restore themselves any more; an admin does.
create or replace function public.reactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'This account is archived. Contact Bandang Ibayo to restore it.';
end;
$$;

-- ── Admins restore an archived joiner ──
create or replace function public.restore_joiner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore accounts.';
  end if;
  update public.profiles
     set archived_at = null, archive_reason = null, deactivated_at = null
   where id = p_id and coalesce(role, 'joiner') = 'joiner';
  if not found then
    raise exception 'That joiner account wasn''t found.';
  end if;
  insert into public.notifications (user_id, title, message, type)
  values (p_id, 'Your account was restored', 'Welcome back! Your Bandang IBAYO account is active again.', 'account');
end;
$$;

-- ── Archive joiners with no login for the set time ──
create or replace function public.archive_inactive_joiners()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_enabled boolean;
  v_days    integer;
  v_count   integer;
begin
  -- The daily job (no signed-in user) or an admin.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can archive accounts.';
  end if;
  select coalesce((select (value)::text::boolean from public.app_settings where key = 'inactive_archive_enabled'), true) into v_enabled;
  select coalesce((select (value)::text::integer from public.app_settings where key = 'inactive_archive_days'), 730) into v_days;
  if not v_enabled or v_days is null or v_days < 30 then
    return 0;
  end if;
  update public.profiles p
     set archived_at = now(), archive_reason = 'inactive'
    from auth.users u
   where u.id = p.id
     and coalesce(p.role, 'joiner') = 'joiner'
     and p.archived_at is null
     and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => v_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.archive_inactive_joiners() from public, anon;
grant execute on function public.archive_inactive_joiners() to authenticated;
revoke all on function public.restore_joiner(uuid) from public, anon;
grant execute on function public.restore_joiner(uuid) to authenticated;

-- ── Admins: every joiner's last login, archive state and days left ──
drop function if exists public.joiner_login_activity();
create function public.joiner_login_activity()
returns table (id uuid, last_sign_in_at timestamptz, inactive boolean, archived_at timestamptz, archive_reason text, days_left integer)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_enabled boolean;
  v_days    integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see login activity.';
  end if;
  select coalesce((select (value)::text::boolean from public.app_settings where key = 'inactive_archive_enabled'), true) into v_enabled;
  select coalesce((select (value)::text::integer from public.app_settings where key = 'inactive_archive_days'), 730) into v_days;
  return query
    select p.id, u.last_sign_in_at,
           p.archived_at is not null,
           p.archived_at, p.archive_reason,
           case when v_enabled and p.archived_at is null
                then (v_days - extract(day from now() - coalesce(u.last_sign_in_at, u.created_at)))::integer
           end
      from public.profiles p
      left join auth.users u on u.id = p.id
     where coalesce(p.role, 'joiner') = 'joiner';
end;
$$;

revoke all on function public.joiner_login_activity() from public, anon;
grant execute on function public.joiner_login_activity() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'archive-inactive-joiners';
    perform cron.schedule('archive-inactive-joiners', '20 16 * * *', 'select public.archive_inactive_joiners()');
  end if;
end;
$$;
