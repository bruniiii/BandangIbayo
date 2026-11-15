-- ─────────────────────────────────────────────
-- Job & email health, joiner data requests, chat filter preview
--
--  • system_jobs(): each scheduled job (pg_cron) with its last run and the
--    failures of the last 24 hours, for System Status (admins).
--  • email_failures: emails that couldn't be sent (the send-email function
--    records them); admins read them. Nothing is deleted.
--  • export_joiner_data(): one joiner's data as a file (main admin), for a
--    Data Privacy Act request.
--  • anonymize_joiner(): removes a joiner's personal details for good
--    (main admin; not while they have an upcoming trip). Bookings and money
--    records stay, under "Removed joiner".
--  • Auto-anonymize: joiners archived longer than the days set by the main
--    admin (off by default) are anonymized every day.
--  • chat_filter_list(): the active blocked words for joiners' preview.
--
-- Run after 20270101000000_site_content_blackouts.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── Scheduled jobs ──
create or replace function public.system_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'Only admins can see this.'; end if;
  if to_regclass('cron.job') is null then return jsonb_build_object('available', false, 'jobs', '[]'::jsonb); end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last_run', l.start_time, 'last_status', l.status, 'last_message', left(l.return_message, 300),
      'failed_24h', coalesce(f.n, 0)) order by j.jobname), '[]')
      from cron.job j
      left join lateral (select d.start_time, d.status, d.return_message from cron.job_run_details d
                          where d.jobid = j.jobid order by d.start_time desc limit 1) l on true
      left join lateral (select count(*) as n from cron.job_run_details d
                          where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours') f on true
  $q$ into v;
  return jsonb_build_object('available', true, 'jobs', v);
exception when others then
  return jsonb_build_object('available', false, 'jobs', '[]'::jsonb, 'error', sqlerrm);
end;
$$;
revoke all on function public.system_jobs() from public;
grant execute on function public.system_jobs() to authenticated;

-- ── Emails that failed ──
create table if not exists public.email_failures (
  id bigserial primary key,
  kind text not null,
  ref text,
  recipient text,
  subject text,
  error text,
  at timestamptz not null default now()
);
create index if not exists email_failures_at on public.email_failures (at desc);
alter table public.email_failures enable row level security;
revoke all on public.email_failures from anon, authenticated;
grant select on public.email_failures to authenticated;
drop policy if exists "email_failures_admin_read" on public.email_failures;
create policy "email_failures_admin_read" on public.email_failures for select to authenticated using (public.is_admin());

-- ── Joiner data requests ──
create or replace function public.export_joiner_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can export a joiner''s data.'; end if;
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'is_main_admin' from public.profiles p where p.id = p_user_id),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b) - 'checkin_code' order by b.created_at), '[]') from public.bookings b where b.user_id = p_user_id),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]') from public.exclusive_requests r where r.user_id = p_user_id),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]') from public.reviews r where r.user_id = p_user_id),
    'part_ratings', (select coalesce(jsonb_agg(jsonb_build_object('tour_id', r.tour_id, 'rating', r.rating, 'at', r.created_at)), '[]') from public.inclusion_ratings r where r.user_id = p_user_id)
  ) into v;
  if v -> 'profile' is null or v -> 'profile' = 'null'::jsonb then raise exception 'Joiner not found.'; end if;
  insert into public.backup_log (what, rows, admin_name)
  values ('one joiner''s data', 1, (select nullif(btrim(concat_ws(' ', first_name, last_name)), '') from public.profiles where id = auth.uid()));
  return v;
end;
$$;
revoke all on function public.export_joiner_data(uuid) from public;
grant execute on function public.export_joiner_data(uuid) to authenticated;

-- The work of anonymizing (no permission check; called below).
create or replace function public.anonymize_joiner_now(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- table, column, new value (SQL); a column the database doesn't have is skipped.
  v_cols text[][] := array[
    ['profiles', 'first_name', quote_literal('Removed joiner')], ['profiles', 'middle_name', 'null'], ['profiles', 'last_name', 'null'],
    ['profiles', 'suffix', 'null'], ['profiles', 'username', quote_literal('removed-' || left(replace(p_user_id::text, '-', ''), 12))],
    ['profiles', 'email', 'null'], ['profiles', 'phone_number', 'null'], ['profiles', 'date_of_birth', 'null'], ['profiles', 'address', 'null'],
    ['profiles', 'province', 'null'], ['profiles', 'city_municipality', 'null'], ['profiles', 'barangay', 'null'], ['profiles', 'street', 'null'],
    ['profiles', 'avatar_url', 'null'], ['profiles', 'emergency_contact_name', 'null'], ['profiles', 'emergency_contact_number', 'null'],
    ['bookings', 'full_name', quote_literal('Removed joiner')], ['bookings', 'contact_number', 'null'], ['bookings', 'email', 'null'],
    ['bookings', 'companions', quote_literal('[]') || '::jsonb'], ['bookings', 'gcash_number', 'null'],
    ['exclusive_requests', 'full_name', quote_literal('Removed joiner')], ['exclusive_requests', 'contact', 'null'],
    ['exclusive_requests', 'contact_number', 'null'], ['exclusive_requests', 'email', 'null'], ['exclusive_requests', 'notes', 'null'],
    ['exclusive_requests', 'participants', quote_literal('[]') || '::jsonb']
  ];
  v_sets jsonb := '{}'::jsonb;
  i integer;
  t text;
  v_set text;
begin
  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.joiner_request_edit', 'on', true);
  for i in 1 .. array_length(v_cols, 1) loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = v_cols[i][1] and column_name = v_cols[i][2]) then
      v_sets := jsonb_set(v_sets, array[v_cols[i][1]],
        to_jsonb(coalesce(v_sets ->> v_cols[i][1] || ', ', '') || quote_ident(v_cols[i][2]) || ' = ' || v_cols[i][3]));
    end if;
  end loop;
  foreach t in array array['profiles', 'bookings', 'exclusive_requests'] loop
    v_set := v_sets ->> t;
    if v_set is not null then
      execute format('update public.%I set %s where %I = $1', t, v_set, case when t = 'profiles' then 'id' else 'user_id' end) using p_user_id;
    end if;
  end loop;
  update public.profiles
     set archived_at = coalesce(archived_at, now()), archive_reason = 'anonymized: ' || left(coalesce(p_reason, ''), 200)
   where id = p_user_id;
  -- They can't log in anymore, and the email address is gone.
  update auth.users
     set email = 'removed-' || replace(p_user_id::text, '-', '') || '@removed.invalid',
         raw_user_meta_data = '{}'::jsonb, banned_until = '9999-12-31'::timestamptz
   where id = p_user_id;
end;
$$;
revoke all on function public.anonymize_joiner_now(uuid, text) from public, anon, authenticated;

create or replace function public.anonymize_joiner(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can remove a joiner''s personal details.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Write the reason (e.g. the joiner asked by email on …).'; end if;
  if (select role from public.profiles where id = p_user_id) is distinct from 'joiner' then raise exception 'Only joiner accounts can be anonymized.'; end if;
  if exists (select 1 from public.bookings b join public.tours t on t.id = b.tour_id
              where b.user_id = p_user_id and b.booking_status not in ('Cancelled', 'Rejected')
                and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date) then
    raise exception 'This joiner has an upcoming trip. Cancel it (or wait until it''s over) first.';
  end if;
  perform public.anonymize_joiner_now(p_user_id, p_reason);
end;
$$;
revoke all on function public.anonymize_joiner(uuid, text) from public;
grant execute on function public.anonymize_joiner(uuid, text) to authenticated;

-- Auto-anonymize (app_settings 'privacy' → anonymize_after_days; off when empty).
create or replace function public.set_privacy_settings(p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can change this.'; end if;
  if p_days is not null and (p_days < 180 or p_days > 3650) then raise exception 'Pick from 180 days to 10 years, or turn it off.'; end if;
  insert into public.app_settings (key, value, updated_at) values ('privacy', jsonb_build_object('anonymize_after_days', p_days), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('anonymize_after_days', p_days);
end;
$$;
revoke all on function public.set_privacy_settings(integer) from public;
grant execute on function public.set_privacy_settings(integer) to authenticated;

create or replace function public.anonymize_old_archived()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := (select (value ->> 'anonymize_after_days')::int from public.app_settings where key = 'privacy');
  r record;
  n integer := 0;
begin
  if v_days is null then return 0; end if;
  for r in select id from public.profiles
            where coalesce(role, 'joiner') = 'joiner' and archived_at is not null
              and archived_at < now() - make_interval(days => v_days)
              and coalesce(archive_reason, '') not like 'anonymized%' loop
    perform public.anonymize_joiner_now(r.id, 'archived over ' || v_days || ' days');
    n := n + 1;
  end loop;
  if n > 0 and to_regclass('public.maintenance_log') is not null then
    insert into public.maintenance_log (task, affected) values ('anonymize_old_archived', n);
  end if;
  return n;
end;
$$;
revoke all on function public.anonymize_old_archived() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anonymize-old-archived';
    perform cron.schedule('anonymize-old-archived', '40 16 * * *', 'select public.anonymize_old_archived()');
  end if;
end;
$$;

-- ── Chat filter: the joiners' preview uses the same words ──
create or replace function public.chat_filter_list()
returns text[]
language sql
stable
security definer
set search_path = public
as $$ select coalesce(array_agg(word order by word), '{}') from public.chat_filter_words where is_active $$;
revoke all on function public.chat_filter_list() from public;
grant execute on function public.chat_filter_list() to authenticated;
