-- ─────────────────────────────────────────────
-- System Maintenance extras:
--   1. Payment settings: which online payment methods joiners can use, and a
--      "pause online payments" switch (the payments function reads them).
--   2. Promo codes: a discount code typed in the booking window, checked by
--      the database (dates, tour, persons, uses, once per joiner).
--   3. Undo: put back what a System Maintenance change replaced (from the
--      Audit Trail), main admin only.
--   4. Admin permissions: what each (non-main) admin may change.
--   5. Social links (Instagram, TikTok) and the website's link preview.
--   6. Planned maintenance: Maintenance Mode for a set time, switching on and
--      off by itself, with a notice to joiners before it starts.
-- Safe to run more than once.
-- ─────────────────────────────────────────────

-- ══ 4 (first, the others use it). Admin permissions ══
-- null = every permission (as before this update). The main admin always has all.
alter table public.profiles add column if not exists admin_permissions text[];

create or replace function public.admin_can(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
       and (is_main_admin or admin_permissions is null or p = any(admin_permissions)));
$$;
revoke all on function public.admin_can(text) from public;
grant execute on function public.admin_can(text) to anon, authenticated, service_role;

-- The permissions an admin can be given.
create or replace function public.admin_permission_keys()
returns text[]
language sql
immutable
as $$ select array['payments', 'refunds', 'tours', 'requests', 'joiners', 'feed', 'reports', 'maintenance']; $$;

-- Each admin's permissions (Admin Settings shows them).
create or replace function public.list_admin_permissions()
returns table (id uuid, is_main_admin boolean, permissions text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.is_main_admin, p.admin_permissions
    from public.profiles p
   where p.role = 'admin' and public.is_admin();
$$;
revoke all on function public.list_admin_permissions() from public, anon;
grant execute on function public.list_admin_permissions() to authenticated;

-- Main admin: set what another admin may change (null = everything).
create or replace function public.set_admin_permissions(p_id uuid, p_permissions text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v text[];
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can change permissions.'; end if;
  if not exists (select 1 from public.profiles where id = p_id and role = 'admin') then raise exception 'That account isn''t an admin.'; end if;
  if exists (select 1 from public.profiles where id = p_id and is_main_admin) then raise exception 'The main admin always has every permission.'; end if;
  if p_permissions is null then
    v := null;
  else
    select coalesce(array_agg(distinct x order by x), '{}') into v from unnest(p_permissions) x;
    if exists (select 1 from unnest(v) x where not x = any(public.admin_permission_keys())) then
      raise exception 'Unknown permission.';
    end if;
  end if;
  update public.profiles set admin_permissions = v where id = p_id;
  return v;
end;
$$;
revoke all on function public.set_admin_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_admin_permissions(uuid, text[]) to authenticated;

-- The guard: an admin without the permission can't add, change or remove
-- rows of these tables (joiners and the server's own jobs aren't affected).
-- Only changes an admin makes straight from the website are checked (the
-- database's own follow-up changes, like a confirmed booking updating the
-- tour's seats, are not): "security invoker" so current_user is still the
-- website's role here, and pg_trigger_depth() = 1 means it isn't another
-- trigger's change.
create or replace function public.admin_permission_direct()
returns boolean
language sql
stable
set search_path = public
as $$ select current_user = 'authenticated' and pg_trigger_depth() <= 1 and auth.uid() is not null and public.is_admin(); $$;

create or replace function public.admin_permission_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_perm text := tg_argv[0];
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_names jsonb := '{"payments":"Bookings & payments","refunds":"Refunds","tours":"Tours & tracking","requests":"Private & requested tours","joiners":"Joiner accounts","feed":"Feed & reviews","reports":"Reports","maintenance":"System Maintenance"}';
begin
  if not public.admin_permission_direct() or public.admin_can(v_perm) then
    return coalesce(new, old);
  end if;
  -- Saved chat replies (Messages) are any admin's.
  if tg_table_name = 'app_settings' and (v_row ->> 'key') = 'chat_quick_replies' then
    return coalesce(new, old);
  end if;
  -- An admin's own account (name, notifications seen) isn't "joiner accounts".
  if tg_table_name = 'profiles' and ((v_row ->> 'id') = auth.uid()::text or (v_row ->> 'role') in ('admin', 'archived_admin')) then
    return coalesce(new, old);
  end if;
  raise exception 'You don''t have permission for %. Ask the main admin.', coalesce(v_names ->> v_perm, v_perm);
end;
$$;

-- Bookings: payments and statuses need "payments"; refund details need "refunds".
create or replace function public.bookings_permission_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c text;
begin
  -- Refund steps go through the refund functions, so they're checked there too
  -- (any change made for a signed-in admin).
  if tg_op = 'UPDATE' and auth.uid() is not null and public.is_admin() and not public.admin_can('refunds') then
    foreach c in array array['weather_refund', 'weather_refund_status', 'weather_refund_ref', 'weather_refund_method', 'weather_refund_proof',
                             'weather_refund_prepared_by', 'weather_refund_received'] loop
      if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
        raise exception 'You don''t have permission for Refunds. Ask the main admin.';
      end if;
    end loop;
  end if;
  if not public.admin_permission_direct() then return coalesce(new, old); end if;
  if tg_op <> 'UPDATE' then
    if not public.admin_can('payments') then raise exception 'You don''t have permission for Bookings & payments. Ask the main admin.'; end if;
    return coalesce(new, old);
  end if;
  foreach c in array array['payment_status', 'amount_paid', 'balance_settled', 'payment_method', 'total_price', 'booking_status', 'slots_booked'] loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) and not public.admin_can('payments') then
      raise exception 'You don''t have permission for Bookings & payments. Ask the main admin.';
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare
  m record;
begin
  for m in select * from (values
      ('tours', 'tours'), ('tour_rates', 'tours'), ('tour_expenses', 'tours'), ('tour_expense_lines', 'tours'),
      ('tour_templates', 'tours'), ('tour_vehicles', 'tours'), ('tour_meetups', 'tours'), ('tour_driver_links', 'tours'),
      ('exclusive_requests', 'requests'), ('admin_messages', 'joiners'), ('profiles', 'joiners'),
      ('feed_posts', 'feed'), ('feed_comments', 'feed'), ('reviews', 'feed'),
      ('refund_log', 'refunds'),
      ('suppliers', 'maintenance'), ('fleet_drivers', 'maintenance'), ('fleet_vans', 'maintenance'), ('destinations', 'maintenance'),
      ('pickup_spots', 'maintenance'), ('option_lists', 'maintenance'), ('help_faqs', 'maintenance'), ('chat_filter_words', 'maintenance'),
      ('blackout_dates', 'maintenance'), ('notification_templates', 'maintenance'), ('site_policies', 'maintenance'), ('app_settings', 'maintenance'))
    as t(tbl, perm)
  loop
    if to_regclass('public.' || m.tbl) is not null then
      execute format('drop trigger if exists %I on public.%I', m.tbl || '_permission_guard', m.tbl);
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.admin_permission_guard(%L)',
                     m.tbl || '_permission_guard', m.tbl, m.perm);
    end if;
  end loop;
  drop trigger if exists bookings_permission_guard on public.bookings;
  create trigger bookings_permission_guard before insert or update or delete on public.bookings
    for each row execute function public.bookings_permission_guard();
end $$;

-- ══ 1. Payment settings ══
create or replace function public.get_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'methods', coalesce((select value -> 'methods' from public.app_settings where key = 'payment_settings'), '["gcash","paymaya","card","grab_pay"]'::jsonb),
    'paused', coalesce((select (value ->> 'paused')::boolean from public.app_settings where key = 'payment_settings'), false),
    'message', (select value ->> 'message' from public.app_settings where key = 'payment_settings'));
$$;
revoke all on function public.get_payment_settings() from public;
grant execute on function public.get_payment_settings() to anon, authenticated, service_role;

create or replace function public.set_payment_settings(p_methods text[], p_paused boolean, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_methods text[];
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can change the payment settings.'; end if;
  select coalesce(array_agg(distinct m), '{}') into v_methods from unnest(coalesce(p_methods, '{}')) m;
  if exists (select 1 from unnest(v_methods) m where m not in ('gcash', 'paymaya', 'card', 'grab_pay')) then
    raise exception 'Unknown payment method.';
  end if;
  if cardinality(v_methods) = 0 and not coalesce(p_paused, false) then
    raise exception 'Keep at least one payment method on, or pause online payments.';
  end if;
  if length(coalesce(p_message, '')) > 300 then raise exception 'Keep the message under 300 characters.'; end if;
  insert into public.app_settings (key, value, updated_at)
  values ('payment_settings', jsonb_build_object('methods', to_jsonb(v_methods), 'paused', coalesce(p_paused, false),
                                                 'message', nullif(btrim(coalesce(p_message, '')), '')), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.get_payment_settings();
end;
$$;
revoke all on function public.set_payment_settings(text[], boolean, text) from public, anon;
grant execute on function public.set_payment_settings(text[], boolean, text) to authenticated;

-- ══ 2. Promo codes ══
create table if not exists public.promo_codes (
  id           bigserial primary key,
  code         text not null check (code ~ '^[A-Z0-9_-]{3,20}$'),
  description  text check (description is null or length(description) <= 200),
  kind         text not null check (kind in ('percent', 'amount')),
  value        numeric(10,2) not null check (value > 0),
  tour_title   text,                 -- only this trip (all its dates); empty = any tour
  min_persons  int not null default 1 check (min_persons between 1 and 100),
  starts_on    date,
  ends_on      date,
  max_uses     int check (max_uses is null or max_uses > 0),
  once_per_joiner boolean not null default true,
  is_active    boolean not null default true,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index if not exists promo_codes_code_unique on public.promo_codes (code);
alter table public.promo_codes enable row level security;
drop policy if exists "promo_codes_admin_read" on public.promo_codes;
create policy "promo_codes_admin_read" on public.promo_codes for select to authenticated using (public.is_admin());
drop policy if exists "promo_codes_admin_insert" on public.promo_codes;
create policy "promo_codes_admin_insert" on public.promo_codes for insert to authenticated with check (public.is_admin());
drop policy if exists "promo_codes_admin_update" on public.promo_codes;
create policy "promo_codes_admin_update" on public.promo_codes for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.promo_codes to authenticated;
grant usage, select on sequence public.promo_codes_id_seq to authenticated;
do $$
begin
  drop trigger if exists promo_codes_permission_guard on public.promo_codes;
  create trigger promo_codes_permission_guard before insert or update or delete on public.promo_codes
    for each row execute function public.admin_permission_guard('maintenance');
  if to_regprocedure('public.no_hard_delete()') is not null then
    drop trigger if exists promo_codes_no_delete on public.promo_codes;
    create trigger promo_codes_no_delete before delete on public.promo_codes for each row execute function public.no_hard_delete();
  end if;
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists promo_codes_activity on public.promo_codes;
    create trigger promo_codes_activity after insert or update or delete on public.promo_codes for each row execute function public.log_admin_activity();
  end if;
end $$;
-- Archiving stamps the date (like the other lists).
create or replace function public.promo_codes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.code := upper(btrim(new.code));
  if new.is_active is distinct from old.is_active then
    new.archived_at := case when new.is_active then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists promo_codes_touch on public.promo_codes;
create trigger promo_codes_touch before update on public.promo_codes for each row execute function public.promo_codes_touch();
create or replace function public.promo_codes_upper()
returns trigger
language plpgsql
as $$ begin new.code := upper(btrim(new.code)); return new; end; $$;
drop trigger if exists promo_codes_upper on public.promo_codes;
create trigger promo_codes_upper before insert on public.promo_codes for each row execute function public.promo_codes_upper();

alter table public.bookings add column if not exists promo_code text;
alter table public.bookings add column if not exists promo_discount numeric(10,2) not null default 0;

-- Whether a code works for this tour, number of persons and joiner, and the
-- discount. (p_booking_id: a booking to leave out of the counts, i.e. the one
-- being paid.)
create or replace function public.promo_check(p_code text, p_tour_id bigint, p_slots int, p_user_id uuid, p_booking_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pc     public.promo_codes%rowtype;
  t      public.tours%rowtype;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_total numeric;
  v_off   numeric;
  v_used  int;
begin
  select * into pc from public.promo_codes where code = upper(btrim(coalesce(p_code, ''))) and is_active;
  if not found then return jsonb_build_object('ok', false, 'message', 'That promo code doesn''t exist or isn''t active.'); end if;
  select * into t from public.tours where id = p_tour_id;
  if not found then return jsonb_build_object('ok', false, 'message', 'Tour not found.'); end if;
  if pc.starts_on is not null and v_today < pc.starts_on then
    return jsonb_build_object('ok', false, 'message', format('This code starts on %s.', to_char(pc.starts_on, 'Mon DD, YYYY')));
  end if;
  if pc.ends_on is not null and v_today > pc.ends_on then return jsonb_build_object('ok', false, 'message', 'This promo code has expired.'); end if;
  if nullif(btrim(coalesce(pc.tour_title, '')), '') is not null and lower(btrim(pc.tour_title)) <> lower(btrim(t.title)) then
    return jsonb_build_object('ok', false, 'message', format('This code is only for %s.', pc.tour_title));
  end if;
  if public.tour_effective_price(t) < coalesce(t.price, 0) then
    return jsonb_build_object('ok', false, 'message', 'Promo codes can''t be used on a date that''s already on sale.');
  end if;
  if coalesce(p_slots, 1) < pc.min_persons then
    return jsonb_build_object('ok', false, 'message', format('This code needs at least %s persons.', pc.min_persons));
  end if;
  if pc.max_uses is not null then
    select count(*) into v_used from public.bookings
     where promo_code = pc.code and booking_status not in ('Cancelled', 'Rejected') and coalesce(payment_status, '') <> 'Expired'
       and (p_booking_id is null or id <> p_booking_id);
    if v_used >= pc.max_uses then return jsonb_build_object('ok', false, 'message', 'This promo code has been used up.'); end if;
  end if;
  if pc.once_per_joiner and exists (
       select 1 from public.bookings where promo_code = pc.code and user_id = p_user_id
          and booking_status not in ('Cancelled', 'Rejected') and coalesce(payment_status, '') <> 'Expired'
          and (p_booking_id is null or id <> p_booking_id)) then
    return jsonb_build_object('ok', false, 'message', 'You''ve already used this promo code.');
  end if;
  v_total := public.tour_effective_price(t) * coalesce(p_slots, 1);
  v_off := case pc.kind when 'percent' then round(v_total * pc.value / 100, 2) else least(pc.value, v_total) end;
  if v_total - v_off < 100 then
    return jsonb_build_object('ok', false, 'message', 'This code can''t be used on this booking.');
  end if;
  return jsonb_build_object('ok', true, 'code', pc.code, 'discount', v_off, 'total', v_total - v_off,
    'label', case pc.kind when 'percent' then trim(to_char(pc.value, 'FM990.##')) || '% off' else '₱' || trim(to_char(pc.value, 'FM999,999,990.00')) || ' off' end);
end;
$$;
revoke all on function public.promo_check(text, bigint, int, uuid, bigint) from public, anon, authenticated;

-- The booking window checks a code as it's typed (the joiner's own account).
create or replace function public.check_promo_code(p_code text, p_tour_id bigint, p_slots int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select public.promo_check(p_code, p_tour_id, p_slots, auth.uid(), null); $$;
revoke all on function public.check_promo_code(text, bigint, int) from public, anon;
grant execute on function public.check_promo_code(text, bigint, int) to authenticated;

-- The payments function applies it to the booking it's about to charge.
create or replace function public.apply_promo_code(p_booking_id bigint, p_user_id uuid, p_code text)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  r jsonb;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.user_id is distinct from p_user_id then raise exception 'Booking not found.'; end if;
  -- One at a time per code, so the last use can't be taken twice.
  perform 1 from public.promo_codes where code = upper(btrim(coalesce(p_code, ''))) for update;
  if p_code is null or btrim(p_code) = '' then
    return b;
  end if;
  r := public.promo_check(p_code, b.tour_id, b.slots_booked, p_user_id, b.id);
  -- A code this booking already got (a held booking paid later) keeps working.
  if not coalesce((r ->> 'ok')::boolean, false) and b.promo_code = upper(btrim(p_code)) and b.promo_discount > 0 then
    r := jsonb_build_object('ok', true, 'code', b.promo_code, 'discount', least(b.promo_discount, b.total_price - 100),
                            'total', b.total_price - least(b.promo_discount, b.total_price - 100));
  end if;
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception '%', r ->> 'message'; end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set promo_code = r ->> 'code', promo_discount = (r ->> 'discount')::numeric, total_price = (r ->> 'total')::numeric
   where id = b.id
   returning * into b;
  perform set_config('app.trusted_booking_write', 'off', true);
  return b;
end;
$$;
revoke all on function public.apply_promo_code(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_promo_code(bigint, uuid, text) to service_role;

-- ══ 3. Undo a System Maintenance change ══
create or replace function public.undo_admin_change(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a       public.admin_activity%rowtype;
  v_pk    text;
  v_now   jsonb;
  k       text;
  v_sets  text := '';
  v_has_active boolean;
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can undo changes.'; end if;
  select * into a from public.admin_activity where id = p_id;
  if not found then raise exception 'That change wasn''t found.'; end if;
  if a.table_name not in ('app_settings', 'notification_templates', 'booking_rules', 'suppliers', 'fleet_drivers', 'fleet_vans',
                          'destinations', 'pickup_spots', 'option_lists', 'help_faqs', 'chat_filter_words', 'blackout_dates', 'promo_codes') then
    raise exception 'Changes to this can''t be undone here.';
  end if;
  if a.table_name = 'app_settings' and a.row_id not in ('announcement', 'landing_content', 'agency_info', 'email_settings', 'payment_settings', 'share_preview') then
    raise exception 'This setting can''t be undone here.';
  end if;
  v_pk := case when a.table_name in ('app_settings', 'notification_templates') then 'key' else 'id' end;
  execute format('select to_jsonb(t) from public.%I t where t.%I::text = $1', a.table_name, v_pk) into v_now using a.row_id;
  if v_now is null then raise exception 'It no longer exists.'; end if;

  if a.action = 'changed' then
    if a.old_values is null then raise exception 'This change has no saved old values.'; end if;
    for k in select jsonb_object_keys(a.old_values) loop
      if jsonb_typeof(a.old_values -> k) = 'string' and (a.old_values ->> k) like '%…' and length(a.old_values ->> k) >= 301 then
        raise exception 'This text was too long to keep in the Audit Trail, so it can''t be undone. Edit it by hand.';
      end if;
      if (v_now -> k) is distinct from (a.new_values -> k) then
        raise exception 'It was changed again after this. Undo the later change first.';
      end if;
      v_sets := v_sets || format('%s%I = (jsonb_populate_record(null::public.%I, $1)).%I', case when v_sets = '' then '' else ', ' end, k, a.table_name, k);
    end loop;
    if v_sets = '' then raise exception 'Nothing to undo.'; end if;
    execute format('update public.%I set %s where %I::text = $2', a.table_name, v_sets, v_pk) using a.old_values, a.row_id;
    return 'restored';
  elsif a.action = 'added' then
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = a.table_name and column_name = 'is_active') into v_has_active;
    if not v_has_active then raise exception 'This can''t be undone here.'; end if;
    execute format('update public.%I set is_active = false where %I::text = $1', a.table_name, v_pk) using a.row_id;
    return 'archived';
  end if;
  raise exception 'This change can''t be undone here.';
end;
$$;
revoke all on function public.undo_admin_change(bigint) from public, anon;
grant execute on function public.undo_admin_change(bigint) to authenticated;

-- ══ 5. Social links and the website's link preview ══
create or replace function public.set_agency_info(p_info jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := coalesce(p_info, '{}'::jsonb);
  v_phone text;
  f text;
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can change the agency information.'; end if;
  if length(btrim(coalesce(v ->> 'name', ''))) < 2 then raise exception 'Enter the agency name.'; end if;
  if coalesce(v ->> 'email', '') <> '' and (v ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'The email doesn''t look right.'; end if;
  v_phone := regexp_replace(coalesce(v ->> 'phone', ''), '[\s\-().]', '', 'g');
  if v_phone like '+63%' then v_phone := '0' || substr(v_phone, 4); elsif v_phone ~ '^63\d{10}$' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone <> '' and v_phone !~ '^(09\d{9}|0[2-8]\d{8})$' then raise exception 'The phone must be a Philippine number like 0917 123 4567.'; end if;
  foreach f in array array['facebook', 'instagram', 'tiktok'] loop
    if coalesce(v ->> f, '') <> '' and (v ->> f) !~* '^https?://' then raise exception 'Links must start with https:// (%).', f; end if;
    if length(coalesce(v ->> f, '')) > 300 then raise exception 'That link is too long (%).', f; end if;
  end loop;
  if coalesce(v ->> 'logo_url', '') <> '' and (v ->> 'logo_url') !~* '^https?://' then raise exception 'The logo must be an uploaded image.'; end if;
  if length(coalesce(v ->> 'address', '')) > 300 then raise exception 'Keep the address under 300 characters.'; end if;
  v := jsonb_build_object(
    'name', btrim(v ->> 'name'), 'email', nullif(btrim(coalesce(v ->> 'email', '')), ''),
    'phone', nullif(btrim(coalesce(v ->> 'phone', '')), ''), 'facebook', nullif(btrim(coalesce(v ->> 'facebook', '')), ''),
    'instagram', nullif(btrim(coalesce(v ->> 'instagram', '')), ''), 'tiktok', nullif(btrim(coalesce(v ->> 'tiktok', '')), ''),
    'address', nullif(btrim(coalesce(v ->> 'address', '')), ''), 'logo_url', nullif(btrim(coalesce(v ->> 'logo_url', '')), ''));
  insert into public.app_settings (key, value, updated_at) values ('agency_info', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v;
end;
$$;
revoke all on function public.set_agency_info(jsonb) from public;
grant execute on function public.set_agency_info(jsonb) to authenticated;

-- What Facebook, Messenger and others show when the website is shared.
create or replace function public.get_share_preview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select value from public.app_settings where key = 'share_preview'), '{}'::jsonb); $$;
revoke all on function public.get_share_preview() from public;
grant execute on function public.get_share_preview() to anon, authenticated, service_role;

create or replace function public.set_share_preview(p_title text, p_description text, p_image_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('maintenance') then raise exception 'You don''t have permission for System Maintenance. Ask the main admin.'; end if;
  if length(coalesce(p_title, '')) > 90 then raise exception 'Keep the title under 90 characters.'; end if;
  if length(coalesce(p_description, '')) > 200 then raise exception 'Keep the description under 200 characters.'; end if;
  if coalesce(p_image_url, '') <> '' and p_image_url !~* '^https://' then raise exception 'The photo must be an uploaded image.'; end if;
  insert into public.app_settings (key, value, updated_at)
  values ('share_preview', jsonb_build_object('title', nullif(btrim(coalesce(p_title, '')), ''), 'description', nullif(btrim(coalesce(p_description, '')), ''),
                                              'image_url', nullif(btrim(coalesce(p_image_url, '')), '')), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.get_share_preview();
end;
$$;
revoke all on function public.set_share_preview(text, text, text) from public, anon;
grant execute on function public.set_share_preview(text, text, text) to authenticated;

-- ══ 6. Planned maintenance ══
-- maintenance_mode keeps "on" (switched by hand) and now also a planned window
-- (starts_at, ends_at): it's on during the window and off after, by itself.
create or replace function public.maintenance_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce((value ->> 'on')::boolean, false)
        or (nullif(value ->> 'starts_at', '') is not null and now() >= (value ->> 'starts_at')::timestamptz
            and (nullif(value ->> 'ends_at', '') is null or now() < (value ->> 'ends_at')::timestamptz))
      from public.app_settings where key = 'maintenance_mode'), false);
$$;
revoke all on function public.maintenance_on from public;
grant execute on function public.maintenance_on to anon, authenticated, service_role;

create or replace function public.get_maintenance()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (select value from public.app_settings where key = 'maintenance_mode')
  select jsonb_build_object(
    'on', public.maintenance_on(),
    'manual', coalesce((select (value ->> 'on')::boolean from m), false),
    'message', (select value ->> 'message' from m),
    'until', (select coalesce(nullif(value ->> 'until', ''),
                case when public.maintenance_on() and nullif(value ->> 'ends_at', '') is not null and not coalesce((value ->> 'on')::boolean, false)
                     then to_char((value ->> 'ends_at')::timestamptz at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM') end) from m),
    'started_at', (select coalesce(value ->> 'started_at', case when public.maintenance_on() then value ->> 'starts_at' end) from m),
    -- The planned window, while it hasn't ended.
    'starts_at', (select case when nullif(value ->> 'ends_at', '') is null or now() < (value ->> 'ends_at')::timestamptz then nullif(value ->> 'starts_at', '') end from m),
    'ends_at', (select case when nullif(value ->> 'ends_at', '') is null or now() < (value ->> 'ends_at')::timestamptz then nullif(value ->> 'ends_at', '') end from m),
    'agency', coalesce((select value from public.app_settings where key = 'agency_info'), '{}'::jsonb)
  );
$$;
revoke all on function public.get_maintenance from public;
grant execute on function public.get_maintenance to anon, authenticated;

-- Turning it on or off by hand keeps a planned window.
create or replace function public.set_maintenance(p_on boolean, p_message text default null, p_until text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := coalesce((select value from public.app_settings where key = 'maintenance_mode'), '{}'::jsonb);
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
            'started_at', case when p_on then coalesce(case when coalesce((v_old ->> 'on')::boolean, false) then v_old ->> 'started_at' end, now()::text) end,
            'starts_at', v_old -> 'starts_at', 'ends_at', v_old -> 'ends_at',
            'by', auth.uid()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.get_maintenance();
end;
$$;
revoke all on function public.set_maintenance from public;
grant execute on function public.set_maintenance to authenticated;

-- Plan a window (or clear it with nulls).
create or replace function public.set_maintenance_schedule(p_starts timestamptz, p_ends timestamptz, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := coalesce((select value from public.app_settings where key = 'maintenance_mode'), '{}'::jsonb);
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can plan Maintenance Mode.'; end if;
  if (p_starts is null) <> (p_ends is null) then raise exception 'Choose both the start and the end.'; end if;
  if p_starts is not null then
    if p_ends <= p_starts then raise exception 'The end must be after the start.'; end if;
    if p_ends < now() then raise exception 'That time has already passed.'; end if;
    if p_ends - p_starts > interval '3 days' then raise exception 'Plan at most 3 days at a time.'; end if;
    if p_starts > now() + interval '90 days' then raise exception 'Plan it at most 90 days ahead.'; end if;
  end if;
  if length(coalesce(p_message, '')) > 500 then raise exception 'Keep the message under 500 characters.'; end if;
  insert into public.app_settings (key, value, updated_at)
  values ('maintenance_mode', v_old || jsonb_build_object(
            'starts_at', p_starts, 'ends_at', p_ends,
            'message', coalesce(nullif(btrim(coalesce(p_message, '')), ''), v_old ->> 'message')), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return public.get_maintenance();
end;
$$;
revoke all on function public.set_maintenance_schedule(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.set_maintenance_schedule(timestamptz, timestamptz, text) to authenticated;
