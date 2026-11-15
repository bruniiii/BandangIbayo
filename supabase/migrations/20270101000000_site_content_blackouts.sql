-- ─────────────────────────────────────────────
-- Site content and no-tour dates (System Maintenance → Site Content)
--
--  • Announcement banner: a short notice joiners see on the homepage and
--    their dashboard (e.g. a typhoon advisory) without Maintenance Mode.
--    Any admin can post or remove it.
--  • Landing page: the headline, the text under it, and optional hero photos
--    (when there are none, open tours' photos are used, as now). Main admin.
--  • No-tour dates: days the agency doesn't run tours (holidays, days off).
--    New tours, date changes and private tour / tour requests can't fall on
--    them; a no-tour date can't be set on days that already have tours.
--  get_site_content() is readable by everyone.
--
-- Run after 20261231000000_option_lists_faq.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── Announcement and landing page ──
create or replace function public.get_site_content()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'announcement', (select case
        when (value ->> 'on')::boolean and (coalesce(value ->> 'until', '') = '' or (value ->> 'until')::timestamptz > now())
          then value - 'by' end
        from public.app_settings where key = 'announcement'),
    'landing', coalesce((select value from public.app_settings where key = 'landing_content'), '{}'::jsonb)
  )
$$;
revoke all on function public.get_site_content() from public;
grant execute on function public.get_site_content() to anon, authenticated, service_role;

create or replace function public.set_announcement(p_on boolean, p_message text, p_tone text default 'info', p_until timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'Only admins can post announcements.'; end if;
  if p_on and length(btrim(coalesce(p_message, ''))) < 5 then raise exception 'Write the announcement (5 characters or more).'; end if;
  if length(coalesce(p_message, '')) > 300 then raise exception 'Keep the announcement under 300 characters.'; end if;
  if coalesce(p_tone, 'info') not in ('info', 'warning') then raise exception 'Unknown banner color.'; end if;
  if p_on and p_until is not null and p_until <= now() then raise exception 'The end time has already passed.'; end if;
  v := jsonb_build_object('on', coalesce(p_on, false), 'message', nullif(btrim(coalesce(p_message, '')), ''), 'tone', coalesce(p_tone, 'info'),
                          'until', p_until, 'posted_at', now(), 'by', auth.uid());
  insert into public.app_settings (key, value, updated_at) values ('announcement', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v - 'by';
end;
$$;
revoke all on function public.set_announcement(boolean, text, text, timestamptz) from public;
grant execute on function public.set_announcement(boolean, text, text, timestamptz) to authenticated;

create or replace function public.set_landing_content(p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := coalesce(p_content, '{}'::jsonb);
  v_photos jsonb := coalesce(v -> 'hero_images', '[]'::jsonb);
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can change the landing page.'; end if;
  if length(coalesce(v ->> 'headline', '')) > 80 or length(coalesce(v ->> 'headline_accent', '')) > 60 then raise exception 'Keep the headline short (80 characters or less).'; end if;
  if length(coalesce(v ->> 'lead', '')) > 240 then raise exception 'Keep the text under the headline under 240 characters.'; end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 6 then raise exception 'Up to 6 hero photos.'; end if;
  if exists (select 1 from jsonb_array_elements_text(v_photos) u where u !~* '^https?://') then raise exception 'Hero photos must be uploaded images.'; end if;
  v := jsonb_build_object('headline', nullif(btrim(coalesce(v ->> 'headline', '')), ''), 'headline_accent', nullif(btrim(coalesce(v ->> 'headline_accent', '')), ''),
                          'lead', nullif(btrim(coalesce(v ->> 'lead', '')), ''), 'hero_images', v_photos);
  insert into public.app_settings (key, value, updated_at) values ('landing_content', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v;
end;
$$;
revoke all on function public.set_landing_content(jsonb) from public;
grant execute on function public.set_landing_content(jsonb) to authenticated;

-- ── No-tour dates ──
create table if not exists public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(btrim(reason)) between 2 and 120),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 366)
);
alter table public.blackout_dates enable row level security;
revoke all on public.blackout_dates from anon, authenticated;
grant select on public.blackout_dates to anon, authenticated;
grant insert, update on public.blackout_dates to authenticated;
drop policy if exists "blackout_dates_read" on public.blackout_dates;
create policy "blackout_dates_read" on public.blackout_dates for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "blackout_dates_admin_insert" on public.blackout_dates;
create policy "blackout_dates_admin_insert" on public.blackout_dates for insert to authenticated with check (public.is_admin());
drop policy if exists "blackout_dates_admin_update" on public.blackout_dates;
create policy "blackout_dates_admin_update" on public.blackout_dates for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists blackout_dates_no_delete on public.blackout_dates;
create trigger blackout_dates_no_delete before delete on public.blackout_dates for each row execute function public.no_hard_delete();

-- The no-tour date (if any) that touches these days.
create or replace function public.blackout_on(p_start date, p_end date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select b.reason || ' (' || to_char(b.start_date, 'Mon FMDD') || case when b.end_date <> b.start_date then ' – ' || to_char(b.end_date, 'Mon FMDD') else '' end || ')'
    from public.blackout_dates b
   where b.is_active and b.start_date <= coalesce(p_end, p_start) and b.end_date >= p_start
   order by b.start_date limit 1
$$;
revoke all on function public.blackout_on(date, date) from public;
grant execute on function public.blackout_on(date, date) to anon, authenticated;

-- A no-tour date can't cover days that already have tours.
create or replace function public.blackout_dates_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tours text[];
begin
  new.reason := btrim(new.reason);
  if new.is_active and (tg_op = 'INSERT' or not old.is_active or new.start_date <> old.start_date or new.end_date <> old.end_date) then
    select coalesce(array_agg(t.title || ' (' || to_char(t.start_date, 'Mon FMDD') || ')' order by t.start_date), '{}') into v_tours
      from public.tours t
     where t.start_date <= new.end_date and coalesce(t.end_date, t.start_date) >= new.start_date
       and not coalesce(t.is_archived, false) and coalesce(t.weather_status, '') <> 'cancelled';
    if cardinality(v_tours) > 0 then
      raise exception 'Tours are already set on those days: %. Move or cancel them first.', array_to_string(v_tours, ', ');
    end if;
  end if;
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists blackout_dates_guard on public.blackout_dates;
create trigger blackout_dates_guard before insert or update on public.blackout_dates
  for each row execute function public.blackout_dates_guard();

-- Tours and requests can't fall on a no-tour date (checked when the dates are set or changed).
create or replace function public.tours_check_blackout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if tg_op = 'INSERT' or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    v := public.blackout_on(new.start_date, coalesce(new.end_date, new.start_date));
    if v is not null then raise exception 'No tours on those days: %.', v; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tours_check_blackout on public.tours;
create trigger tours_check_blackout before insert or update on public.tours
  for each row execute function public.tours_check_blackout();

create or replace function public.requests_check_blackout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if new.preferred_date is not null
     and (tg_op = 'INSERT' or new.preferred_date is distinct from old.preferred_date or new.preferred_end_date is distinct from old.preferred_end_date) then
    v := public.blackout_on(new.preferred_date, coalesce(new.preferred_end_date, new.preferred_date));
    if v is not null then raise exception 'We don''t run tours on those days: %. Please pick other dates.', v; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists requests_check_blackout on public.exclusive_requests;
create trigger requests_check_blackout before insert or update on public.exclusive_requests
  for each row execute function public.requests_check_blackout();

do $$
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists blackout_dates_admin_activity on public.blackout_dates;
    create trigger blackout_dates_admin_activity after insert or update or delete on public.blackout_dates
      for each row execute function public.log_admin_activity();
  end if;
end;
$$;
