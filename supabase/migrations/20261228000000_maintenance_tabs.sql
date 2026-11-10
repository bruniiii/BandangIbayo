-- ─────────────────────────────────────────────
-- System Maintenance: the remaining tabs
--
--  1. Drivers & Vehicles: archived (never deleted), restorable; a driver or
--     van an upcoming tour uses can't be archived (the database says which).
--  2. Pickup Points: archived instead of deleted; joiners only see active
--     ones; one an upcoming tour uses can't be archived.
--  3. Policies & Content: the Terms & Conditions as versions. Joiners read
--     the current one; only the main admin publishes a new version (old
--     versions stay). {cancellation_cutoff_days}-style words are filled in
--     from the Booking Rules when shown.
--  4. Notification Templates: the subject, heading and message of each
--     email; admins edit them; "Use default" archives the change.
--  5. Chat Filter: the blocked words (group chat and reviews) in a table;
--     only the main admin changes them; mask_sensitive_words() reads it.
--  6. Agency Information: get_agency_info() for everyone (name, email,
--     phone, Facebook, address, logo); only the main admin changes it.
--  7. Audit Trail: no one can edit or delete a log entry, not even the
--     main admin.
--  8. Backup & Export: only the main admin can export (export_data) and
--     record backups.
-- Every new table has row-level security; every change is logged.
--
-- Run after 20261227000000_check_out.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- Shared: never delete master data.
create or replace function public.no_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Records here can''t be deleted. Archive it instead (it can be restored).';
end;
$$;

-- ── 1. Drivers & Vehicles ──
alter table public.fleet_drivers add column if not exists archived_at timestamptz;
alter table public.fleet_vans add column if not exists archived_at timestamptz;

create or replace function public.fleet_upcoming_tours(p_kind text, p_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct t.title || ' (' || to_char(t.start_date, 'Mon FMDD, YYYY') || ')'), '{}')
    from public.tour_vehicles v
    join public.tours t on t.id = v.tour_id
   where ((p_kind = 'driver' and v.driver_id = p_id) or (p_kind = 'van' and v.van_id = p_id))
     and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
     and not coalesce(t.is_archived, false)
     and coalesce(t.weather_status, '') <> 'cancelled'
$$;
revoke all on function public.fleet_upcoming_tours(text, uuid) from public;
grant execute on function public.fleet_upcoming_tours(text, uuid) to authenticated;

create or replace function public.fleet_guard_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tours text[];
  v_what text := case when tg_table_name = 'fleet_drivers' then 'This driver' else 'This van' end;
begin
  if old.is_active and not new.is_active then
    v_tours := public.fleet_upcoming_tours(case when tg_table_name = 'fleet_drivers' then 'driver' else 'van' end, old.id);
    if cardinality(v_tours) > 0 then
      raise exception '% can''t be archived: it''s assigned to upcoming tour%: %. Pick another one for % first.',
        v_what, case when cardinality(v_tours) = 1 then '' else 's' end, array_to_string(v_tours, ', '),
        case when cardinality(v_tours) = 1 then 'that tour' else 'those tours' end;
    end if;
  end if;
  if new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists fleet_drivers_guard_archive on public.fleet_drivers;
create trigger fleet_drivers_guard_archive before update on public.fleet_drivers
  for each row execute function public.fleet_guard_archive();
drop trigger if exists fleet_vans_guard_archive on public.fleet_vans;
create trigger fleet_vans_guard_archive before update on public.fleet_vans
  for each row execute function public.fleet_guard_archive();
drop trigger if exists fleet_drivers_no_delete on public.fleet_drivers;
create trigger fleet_drivers_no_delete before delete on public.fleet_drivers
  for each row execute function public.no_hard_delete();
drop trigger if exists fleet_vans_no_delete on public.fleet_vans;
create trigger fleet_vans_no_delete before delete on public.fleet_vans
  for each row execute function public.no_hard_delete();

-- A driver's number: a Philippine number (checked from now on; old rows stay).
create or replace function public.fleet_drivers_check()
returns trigger
language plpgsql
as $$
declare
  v text := regexp_replace(coalesce(new.contact, ''), '[\s\-().]', '', 'g');
begin
  if tg_op = 'INSERT' or new.contact is distinct from old.contact then
    if v like '+63%' then v := '0' || substr(v, 4); elsif v ~ '^63\d{10}$' then v := '0' || substr(v, 3); end if;
    if v !~ '^(09\d{9}|0[2-8]\d{8})$' then
      raise exception 'The driver''s number must be a Philippine number like 0917 123 4567.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists fleet_drivers_check on public.fleet_drivers;
create trigger fleet_drivers_check before insert or update on public.fleet_drivers
  for each row execute function public.fleet_drivers_check();

-- ── 2. Pickup Points ──
alter table public.pickup_spots add column if not exists is_active boolean not null default true;
alter table public.pickup_spots add column if not exists archived_at timestamptz;

drop policy if exists "pickup_spots_read" on public.pickup_spots;
create policy "pickup_spots_read" on public.pickup_spots
  for select to authenticated using (is_active or public.is_admin());

create or replace function public.pickup_spot_upcoming_tours(p_id bigint)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct t.title || ' (' || to_char(t.start_date, 'Mon FMDD, YYYY') || ')'), '{}')
    from public.pickup_spots s
    join public.tour_meetups m on lower(btrim(m.location_name)) = lower(btrim(s.name))
    join public.tours t on t.id = m.tour_id
   where s.id = p_id
     and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
     and not coalesce(t.is_archived, false)
     and coalesce(t.weather_status, '') <> 'cancelled'
$$;
revoke all on function public.pickup_spot_upcoming_tours(bigint) from public;
grant execute on function public.pickup_spot_upcoming_tours(bigint) to authenticated;

create or replace function public.pickup_spots_guard_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tours text[];
begin
  if old.is_active and not new.is_active then
    v_tours := public.pickup_spot_upcoming_tours(old.id);
    if cardinality(v_tours) > 0 then
      raise exception '% can''t be archived: it''s a pickup point of upcoming tour%: %. Remove it from % first.',
        old.name, case when cardinality(v_tours) = 1 then '' else 's' end, array_to_string(v_tours, ', '),
        case when cardinality(v_tours) = 1 then 'that tour' else 'those tours' end;
    end if;
  end if;
  if new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists pickup_spots_guard_archive on public.pickup_spots;
create trigger pickup_spots_guard_archive before update on public.pickup_spots
  for each row execute function public.pickup_spots_guard_archive();
drop trigger if exists pickup_spots_no_delete on public.pickup_spots;
create trigger pickup_spots_no_delete before delete on public.pickup_spots
  for each row execute function public.no_hard_delete();

-- ── 3. Policies & Content ──
create table if not exists public.site_policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug in ('terms')),
  title text not null check (length(btrim(title)) between 3 and 120),
  body text not null check (length(btrim(body)) between 20 and 30000),
  version integer not null,
  is_current boolean not null default false,
  note text check (coalesce(length(note), 0) <= 300),
  published_at timestamptz not null default now(),
  published_by uuid,
  unique (slug, version)
);
create unique index if not exists site_policies_one_current on public.site_policies (slug) where is_current;
alter table public.site_policies enable row level security;
revoke all on public.site_policies from anon, authenticated;
grant select on public.site_policies to anon, authenticated;
drop policy if exists "site_policies_read" on public.site_policies;
create policy "site_policies_read" on public.site_policies
  for select to anon, authenticated using (is_current or public.is_admin());
drop trigger if exists site_policies_no_delete on public.site_policies;
create trigger site_policies_no_delete before delete on public.site_policies
  for each row execute function public.no_hard_delete();
-- Versions are never edited: a change is a new version.
create or replace function public.site_policies_guard()
returns trigger
language plpgsql
as $$
begin
  if new.slug is distinct from old.slug or new.title is distinct from old.title or new.body is distinct from old.body
     or new.version is distinct from old.version or new.published_at is distinct from old.published_at then
    raise exception 'A published version can''t be changed. Publish a new version instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists site_policies_guard on public.site_policies;
create trigger site_policies_guard before update on public.site_policies
  for each row execute function public.site_policies_guard();

create or replace function public.publish_policy(p_slug text, p_title text, p_body text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can publish policies.'; end if;
  if length(btrim(coalesce(p_body, ''))) < 20 then raise exception 'The policy text is too short.'; end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Give the policy a title.'; end if;
  perform pg_advisory_xact_lock(hashtext('site_policies:' || p_slug));
  v_version := coalesce((select max(version) from public.site_policies where slug = p_slug), 0) + 1;
  update public.site_policies set is_current = false where slug = p_slug and is_current;
  insert into public.site_policies (slug, title, body, version, is_current, note, published_by)
  values (p_slug, btrim(p_title), btrim(p_body), v_version, true, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return v_version;
end;
$$;
revoke all on function public.publish_policy from public;
grant execute on function public.publish_policy to authenticated;

insert into public.site_policies (slug, title, body, version, is_current, note)
select 'terms', 'Terms & Conditions', $terms$## 1. Booking & Payment
All bookings are confirmed only after payment is received online (GCash, Maya or card), either in full or as a {downpayment_percent}% downpayment. Private tours are confirmed with a {private_downpayment_percent}% downpayment of the package price the agency sends you; the remaining balance can be paid online or settled with the agency before the trip. Every joiner is charged the full listed tour price regardless of age or status — the platform does not offer PWD or senior citizen discounts.

## 2. Non-Refundable & Cancellation Policy
All payments made through the platform are strictly non-refundable. Cancellations are not accepted within {cancellation_cutoff_days} days of the scheduled tour date. This policy protects the agency from the financial losses caused by last-minute withdrawals, since the cost of shared transport and accommodations depends on a fixed number of confirmed passengers.

## 3. Medical Disclaimer
Joiner tours may involve physical activity, travel to remote areas, and varying difficulty levels. By booking, you confirm that you are physically fit to participate and that you have disclosed any relevant medical conditions, allergies, or limitations to the organizer prior to the trip. Bandang IBAYO and its partner organizers are not liable for pre-existing health conditions not disclosed at the time of booking.

## 4. Date Changes (Weather & Safety)
A tour date may be postponed or cancelled because of bad weather (such as typhoons or heavy rain), road closures, or other safety concerns. Affected joiners are notified right away and in the tour's group chat. Whether a date is postponed or cancelled, you have {weather_choice_hours} hours to choose: keep your slot on the new date (if it was postponed), move to another date of the same tour, or receive a {weather_refund_percent}% refund of what you paid. If you don't choose within {weather_choice_hours} hours, the {weather_refund_percent}% refund is given.

## 5. Tracking & Vehicle Information
Estimated Time of Arrival (ETA), driver details, and vehicle plate numbers shown on the platform are provided for transparency and safety. ETA information is an estimate only and does not reflect real-time GPS tracking.

## 6. Account & Data Privacy
Your account information, including your contact details and payment records, is stored securely and protected through role-based access controls. Information you provide is used solely to process your bookings, verify payments, and send tour-related reminders and updates.

## 7. Conduct & Reviews
Joiners are expected to conduct themselves respectfully toward organizers, drivers, and fellow travelers. Reviews and comments posted on tours should reflect genuine experiences and may be moderated by the agency to maintain a trustworthy platform for future joiners.$terms$, 1, true, 'The terms the website used before policies became editable.'
 where not exists (select 1 from public.site_policies where slug = 'terms');

-- ── 4. Notification Templates ──
create table if not exists public.notification_templates (
  key text primary key check (key in ('reminder', 'booking_received', 'booking_confirmed', 'booking_rejected', 'balance_reminder',
                                      'cancellation_approved', 'pickup_day', 'review_invite', 'departure_soon', 'waitlist_opening')),
  subject text not null check (length(btrim(subject)) between 3 and 200),
  heading text not null check (length(btrim(heading)) between 2 and 120),
  message text not null check (length(btrim(message)) between 5 and 4000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.notification_templates enable row level security;
revoke all on public.notification_templates from anon, authenticated;
grant select, insert, update on public.notification_templates to authenticated;
drop policy if exists "notification_templates_admin" on public.notification_templates;
create policy "notification_templates_admin" on public.notification_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists notification_templates_no_delete on public.notification_templates;
create trigger notification_templates_no_delete before delete on public.notification_templates
  for each row execute function public.no_hard_delete();
create or replace function public.notification_templates_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
drop trigger if exists notification_templates_touch on public.notification_templates;
create trigger notification_templates_touch before insert or update on public.notification_templates
  for each row execute function public.notification_templates_touch();

-- ── 5. Chat Filter ──
create table if not exists public.chat_filter_words (
  id uuid primary key default gen_random_uuid(),
  word text not null check (length(btrim(word)) between 2 and 60 and btrim(word) !~ '[<>{}\\]'),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists chat_filter_words_unique on public.chat_filter_words (lower(regexp_replace(btrim(word), '\s+', ' ', 'g')));
alter table public.chat_filter_words enable row level security;
revoke all on public.chat_filter_words from anon, authenticated;
grant select, insert, update on public.chat_filter_words to authenticated;
drop policy if exists "chat_filter_words_admin_read" on public.chat_filter_words;
create policy "chat_filter_words_admin_read" on public.chat_filter_words
  for select to authenticated using (public.is_admin());
drop policy if exists "chat_filter_words_main_insert" on public.chat_filter_words;
create policy "chat_filter_words_main_insert" on public.chat_filter_words
  for insert to authenticated with check (public.is_main_admin());
drop policy if exists "chat_filter_words_main_update" on public.chat_filter_words;
create policy "chat_filter_words_main_update" on public.chat_filter_words
  for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
drop trigger if exists chat_filter_words_no_delete on public.chat_filter_words;
create trigger chat_filter_words_no_delete before delete on public.chat_filter_words
  for each row execute function public.no_hard_delete();
create or replace function public.chat_filter_words_tidy()
returns trigger
language plpgsql
as $$
begin
  new.word := lower(regexp_replace(btrim(new.word), '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists chat_filter_words_tidy on public.chat_filter_words;
create trigger chat_filter_words_tidy before insert or update on public.chat_filter_words
  for each row execute function public.chat_filter_words_tidy();

-- The words the website blocked before this update.
insert into public.chat_filter_words (word)
select w from (values
  ('fuck'),
  ('fucks'),
  ('fucked'),
  ('fucker'),
  ('fuckers'),
  ('fucking'),
  ('fuckin'),
  ('fck'),
  ('fcking'),
  ('fk'),
  ('fuk'),
  ('fuking'),
  ('phuck'),
  ('wtf'),
  ('stfu'),
  ('gtfo'),
  ('shit'),
  ('shits'),
  ('shitty'),
  ('bullshit'),
  ('sht'),
  ('bitch'),
  ('bitches'),
  ('biatch'),
  ('btch'),
  ('asshole'),
  ('assholes'),
  ('arsehole'),
  ('dumbass'),
  ('jackass'),
  ('bastard'),
  ('bastards'),
  ('dick'),
  ('dicks'),
  ('dickhead'),
  ('cock'),
  ('cocks'),
  ('pussy'),
  ('pussies'),
  ('cunt'),
  ('cunts'),
  ('slut'),
  ('sluts'),
  ('whore'),
  ('whores'),
  ('motherfucker'),
  ('motherfuckers'),
  ('mf'),
  ('mofo'),
  ('nigger'),
  ('niggers'),
  ('nigga'),
  ('niggas'),
  ('faggot'),
  ('faggots'),
  ('fag'),
  ('retard'),
  ('retarded'),
  ('twat'),
  ('wanker'),
  ('prick'),
  ('douchebag'),
  ('porn'),
  ('rape'),
  ('rapist'),
  ('putangina'),
  ('putang ina'),
  ('putanginamo'),
  ('putang ina mo'),
  ('puta'),
  ('puta ka'),
  ('tangina'),
  ('tang ina'),
  ('tanginamo'),
  ('tangina mo'),
  ('tang ina mo'),
  ('puta mo'),
  ('gago ka'),
  ('ulol ka'),
  ('tangena'),
  ('pakyu'),
  ('pak yu'),
  ('pakshet'),
  ('pucha'),
  ('putcha'),
  ('punyeta'),
  ('punyemas'),
  ('gago'),
  ('gaga'),
  ('gagu'),
  ('gagi'),
  ('ulol'),
  ('ulul'),
  ('olol'),
  ('tarantado'),
  ('tarantada'),
  ('bobo'),
  ('boba'),
  ('bobong'),
  ('tanga'),
  ('tangang'),
  ('inutil'),
  ('siraulo'),
  ('sira ulo'),
  ('kupal'),
  ('hinayupak'),
  ('hayop ka'),
  ('leche'),
  ('lintik'),
  ('pokpok'),
  ('kantot'),
  ('kantutan'),
  ('jakol'),
  ('chupa'),
  ('tsupa'),
  ('titi'),
  ('burat'),
  ('bayag'),
  ('betlog'),
  ('puke'),
  ('pekpek'),
  ('kepyas'),
  ('tamod'),
  ('hindot'),
  ('kingina'),
  ('kinginamo'),
  ('engot'),
  ('shunga'),
  ('bwisit'),
  ('buwisit'),
  ('peste'),
  ('pesteng yawa'),
  ('yawa'),
  ('yawaa'),
  ('piste'),
  ('pisti'),
  ('pistiyawa'),
  ('buang'),
  ('boang'),
  ('animal ka'),
  ('bilat'),
  ('oten'),
  ('otin'),
  ('iyot'),
  ('giatay'),
  ('gi atay'),
  ('ukinnam'),
  ('okinnam'),
  ('ukininam'),
  ('okininam'),
  ('mierda'),
  ('pendejo'),
  ('pendeja'),
  ('cabron'),
  ('cabrón'),
  ('coño'),
  ('joder'),
  ('hijo de puta'),
  ('puto')
) as v(w)
on conflict do nothing;

-- Group chat messages and reviews: blocked words become ****.
create or replace function public.mask_sensitive_words(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pattern text;
begin
  if p_text is null then return null; end if;
  select string_agg(regexp_replace(regexp_replace(word, '([.*+?^$(){}|\[\]\\])', '\\\1', 'g'), '\s+', '\\s+', 'g'), '|'
                    order by length(word) desc)
    into v_pattern
    from public.chat_filter_words where is_active;
  if v_pattern is null then return p_text; end if;
  return regexp_replace(p_text, '(?<![[:alnum:]_])(' || v_pattern || ')(?![[:alnum:]_])', '****', 'gi');
end;
$$;

-- ── 6. Agency Information ──
create or replace function public.get_agency_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.app_settings where key = 'agency_info'), '{}'::jsonb)
$$;
revoke all on function public.get_agency_info() from public;
grant execute on function public.get_agency_info() to anon, authenticated, service_role;

create or replace function public.set_agency_info(p_info jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := coalesce(p_info, '{}'::jsonb);
  v_phone text;
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can change the agency information.'; end if;
  if length(btrim(coalesce(v ->> 'name', ''))) < 2 then raise exception 'Enter the agency name.'; end if;
  if coalesce(v ->> 'email', '') <> '' and (v ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'The email doesn''t look right.'; end if;
  v_phone := regexp_replace(coalesce(v ->> 'phone', ''), '[\s\-().]', '', 'g');
  if v_phone like '+63%' then v_phone := '0' || substr(v_phone, 4); elsif v_phone ~ '^63\d{10}$' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone <> '' and v_phone !~ '^(09\d{9}|0[2-8]\d{8})$' then raise exception 'The phone must be a Philippine number like 0917 123 4567.'; end if;
  if coalesce(v ->> 'facebook', '') <> '' and (v ->> 'facebook') !~* '^https?://' then raise exception 'The Facebook link must start with https://'; end if;
  if coalesce(v ->> 'logo_url', '') <> '' and (v ->> 'logo_url') !~* '^https?://' then raise exception 'The logo must be an uploaded image.'; end if;
  if length(coalesce(v ->> 'address', '')) > 300 then raise exception 'Keep the address under 300 characters.'; end if;
  v := jsonb_build_object(
    'name', btrim(v ->> 'name'), 'email', nullif(btrim(coalesce(v ->> 'email', '')), ''),
    'phone', nullif(btrim(coalesce(v ->> 'phone', '')), ''), 'facebook', nullif(btrim(coalesce(v ->> 'facebook', '')), ''),
    'address', nullif(btrim(coalesce(v ->> 'address', '')), ''), 'logo_url', nullif(btrim(coalesce(v ->> 'logo_url', '')), ''));
  insert into public.app_settings (key, value, updated_at) values ('agency_info', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v;
end;
$$;
revoke all on function public.set_agency_info(jsonb) from public;
grant execute on function public.set_agency_info(jsonb) to authenticated;

-- ── 7. Audit Trail: entries can't be changed or removed by anyone ──
revoke update, delete, truncate on public.admin_activity from anon, authenticated, service_role;
create or replace function public.admin_activity_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit trail entries can''t be changed or deleted.';
end;
$$;
drop trigger if exists admin_activity_immutable on public.admin_activity;
create trigger admin_activity_immutable before update or delete on public.admin_activity
  for each row execute function public.admin_activity_immutable();
drop trigger if exists admin_activity_no_truncate on public.admin_activity;
create trigger admin_activity_no_truncate before truncate on public.admin_activity
  for each statement execute function public.admin_activity_immutable();

-- ── 8. Backup & Export: main admin only ──
drop policy if exists "backup_log_admin" on public.backup_log;
drop policy if exists "backup_log_admin_read" on public.backup_log;
create policy "backup_log_admin_read" on public.backup_log
  for select to authenticated using (public.is_admin());
drop policy if exists "backup_log_main_insert" on public.backup_log;
create policy "backup_log_main_insert" on public.backup_log
  for insert to authenticated with check (public.is_main_admin());

create or replace function public.export_data(p_what text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_name text := (select nullif(btrim(concat_ws(' ', first_name, last_name)), '') from public.profiles where id = auth.uid());
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can export data.'; end if;
  case p_what
    when 'bookings' then
      select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('tour_title', t.title, 'tour_start', t.start_date, 'tour_end', t.end_date) order by b.created_at desc), '[]')
        into v from public.bookings b left join public.tours t on t.id = b.tour_id;
    when 'tours' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.start_date desc), '[]') into v from public.tours t;
    when 'joiners' then
      select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]') into v from public.profiles p
       where coalesce(p.role, 'joiner') not in ('admin', 'archived_admin');
    when 'requests' then
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]') into v from public.exclusive_requests r;
    when 'refunds' then
      select coalesce(jsonb_agg(jsonb_build_object('booking_number', b.booking_number, 'full_name', b.full_name, 'weather_refund', b.weather_refund,
               'weather_refund_status', b.weather_refund_status, 'weather_refund_ref', b.weather_refund_ref, 'weather_refund_at', b.weather_refund_at)
               order by b.weather_refund_at desc nulls last), '[]')
        into v from public.bookings b where b.weather_refund is not null;
    when 'activity' then
      select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc), '[]') into v from (select * from public.admin_activity order by at desc limit 20000) a;
    when 'suppliers' then
      select coalesce(jsonb_agg(to_jsonb(s) order by s.name), '[]') into v from public.suppliers s;
    when 'expenses' then
      select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object('tour_title', t.title, 'tour_start', t.start_date, 'supplier', s.name) order by t.start_date desc, l.sort_order), '[]')
        into v from public.tour_expense_lines l join public.tours t on t.id = l.tour_id left join public.suppliers s on s.id = l.supplier_id;
    else
      raise exception 'Unknown export.';
  end case;
  insert into public.backup_log (what, rows, admin_name) values (p_what, jsonb_array_length(v), v_name);
  return v;
end;
$$;
revoke all on function public.export_data(text) from public;
grant execute on function public.export_data(text) to authenticated;

-- ── Activity log for the new tables ──
do $$
declare
  t text;
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    foreach t in array array['site_policies', 'notification_templates', 'chat_filter_words'] loop
      execute format('drop trigger if exists %I on public.%I', t || '_admin_activity', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_activity()', t || '_admin_activity', t);
    end loop;
  end if;
end;
$$;
