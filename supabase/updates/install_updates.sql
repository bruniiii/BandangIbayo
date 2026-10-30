-- ─────────────────────────────────────────────
-- All database updates from 20261111 to 20261120, in order, in one go.
--
-- Paste the whole file into the Supabase SQL Editor and click Run.
-- It runs as one transaction: if anything fails, nothing is changed, and the
-- error says which part failed. Safe to run more than once (updates that are
-- already installed are simply applied again).
-- Afterwards, run supabase/updates/check_updates.sql: every row should say
-- "installed".
--
-- Generated from supabase/migrations/20261111…20261120 — edit those, not this.
-- ─────────────────────────────────────────────

begin;


-- ════════════ 20261111000000_checkin_tour_day.sql ════════════

-- ─────────────────────────────────────────────
-- Check-in opens on the day of the tour
--
-- check_in_booking() used to open check-in the day before the tour. Now it
-- opens on the tour's first day and closes after its last day.
--
-- Run after 20261110000000_sale_full_payment.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.check_in_booking(
  p_code    text,
  p_tour_id public.tours.id%type,
  p_mark    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := btrim(coalesce(p_code, ''));
  v_uuid   uuid;
  b        public.bookings%rowtype;
  t        public.tours%rowtype;
  v_info   jsonb;
  v_balance numeric;
  v_account text;
  v_today  date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can check joiners in.';
  end if;

  -- The QR holds "BANDANGIBAYO-CHECKIN:<code>"; a bare code or a booking
  -- number (e.g. BK-2026-00094) typed by hand works too.
  v_code := regexp_replace(v_code, '^BANDANGIBAYO-CHECKIN:', '', 'i');
  begin
    v_uuid := v_code::uuid;
  exception when others then
    v_uuid := null;
  end;

  if v_uuid is not null then
    select * into b from public.bookings where checkin_code = v_uuid;
  else
    select * into b from public.bookings where upper(booking_number) = upper(v_code);
  end if;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into t from public.tours where id = b.tour_id;
  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_account
    from public.profiles p where p.id = b.user_id;

  v_balance := case
    when b.payment_method = 'Downpayment' and not coalesce((to_jsonb(b) ->> 'balance_settled')::boolean, false)
      then greatest(0, coalesce(b.total_price, 0) - coalesce(b.amount_paid, 0))
    else 0
  end;

  v_info := jsonb_build_object(
    'booking_id', b.id,
    'booking_number', b.booking_number,
    'full_name', b.full_name,
    'account_name', v_account,
    'contact_number', b.contact_number,
    'slots_booked', b.slots_booked,
    'companions', coalesce(b.companions, '[]'::jsonb),
    'tour_id', b.tour_id,
    'tour_title', t.title,
    'tour_start', t.start_date,
    'tour_end', t.end_date,
    'payment_status', b.payment_status,
    'booking_status', b.booking_status,
    'balance_due', v_balance,
    'checked_in_at', b.checked_in_at
  );

  if p_tour_id is not null and b.tour_id is distinct from p_tour_id then
    return v_info || jsonb_build_object('result', 'wrong_tour');
  end if;
  if b.booking_status in ('Cancelled', 'Rejected') then
    return v_info || jsonb_build_object('result', 'cancelled');
  end if;
  if b.payment_status is distinct from 'Complete' then
    return v_info || jsonb_build_object('result', 'unpaid');
  end if;
  if b.checked_in_at is not null then
    return v_info || jsonb_build_object('result', 'already');
  end if;
  -- Open from the tour's first day until its last day.
  if p_mark and t.start_date is not null
     and (v_today < t.start_date or v_today > coalesce(t.end_date, t.start_date)) then
    return v_info || jsonb_build_object('result', 'not_open');
  end if;

  if p_mark then
    update public.bookings
       set checked_in_at = now(), checked_in_by = auth.uid()
     where id = b.id
     returning checked_in_at into b.checked_in_at;
  end if;

  return v_info || jsonb_build_object('result', 'ok', 'checked_in_at', b.checked_in_at);
end;
$$;

revoke all on function public.check_in_booking(text, public.tours.id%type, boolean) from public;
grant execute on function public.check_in_booking(text, public.tours.id%type, boolean) to authenticated;


-- ════════════ 20261112000000_signup_code_first.sql ════════════

-- ─────────────────────────────────────────────
-- Registration: the account is created only after the emailed code
--
-- signup_challenges holds a registration waiting for its 6-digit code (the
-- email, the profile details and the code's hash; never the password). The
-- auth function creates the account only when the right code is entered.
-- auth_account_for_email() lets the auth function see whether an email
-- already has an account without creating one.
-- Only the auth function (service role) can use either.
--
-- Run after 20261111000000_checkin_tour_day.sql. Safe to run more than once.
-- Then redeploy:  supabase functions deploy auth --no-verify-jwt
-- ─────────────────────────────────────────────

create table if not exists public.signup_challenges (
  id           uuid primary key,
  email        text not null,
  profile      jsonb not null default '{}'::jsonb,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  resends      integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists signup_challenges_email_idx on public.signup_challenges (email);

alter table public.signup_challenges enable row level security;
revoke all on public.signup_challenges from anon, authenticated;
grant all on public.signup_challenges to service_role;

create or replace function public.auth_account_for_email(p_email text)
returns table (id uuid, confirmed boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email_confirmed_at is not null
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1;
$$;

revoke all on function public.auth_account_for_email(text) from public, anon, authenticated;
grant execute on function public.auth_account_for_email(text) to service_role;


-- ════════════ 20261113000000_big_update.sql ════════════

-- ─────────────────────────────────────────────
-- Big update: notifications, rates, accommodation, exclusive tours and tour
-- requests, cancellations, profiles, word filter, archived accounts
--
-- Run after 20261112000000_signup_code_first.sql. Safe to run more than once.
-- Then redeploy:  supabase functions deploy payments --no-verify-jwt
--                 supabase functions deploy auth --no-verify-jwt
--                 supabase functions deploy send-email --no-verify-jwt
-- ─────────────────────────────────────────────

-- ── 1. Notifications: when the bell / Notification page was last viewed ──
alter table public.profiles add column if not exists notifications_seen_at timestamptz;

create or replace function public.mark_notifications_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set notifications_seen_at = now() where id = auth.uid();
$$;

revoke all on function public.mark_notifications_seen() from public, anon;
grant execute on function public.mark_notifications_seen() to authenticated;

-- ── 2. Tour rates: Regular Rate ₱1,300–₱7,500, Joiner Rate ₱1,800–₱7,500 ──
-- (Tour Management and requested tours. Exclusive tours have no limits.)
-- Checked only when a price is set or changed, so older tours can still be
-- edited in other ways.
create or replace function public.tours_check_price_limit()
returns trigger
language plpgsql
as $$
begin
  if new.price is not null and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    if new.price > 7500 then
      raise exception 'The Joiner Rate can be at most ₱7,500.';
    end if;
    if new.price < 1800 then
      raise exception 'The Joiner Rate must be at least ₱1,800.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tour_rates_check_limit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.regular_rate is distinct from old.regular_rate then
    if new.regular_rate > 7500 then
      raise exception 'The Regular Rate can be at most ₱7,500.';
    end if;
    if new.regular_rate < 1300 then
      raise exception 'The Regular Rate must be at least ₱1,300.';
    end if;
  end if;
  return new;
end;
$$;

-- ── 3. Cancellations are instant ──────────────
-- A joiner's cancellation no longer waits for the agency: cancel_my_booking()
-- cancels the booking at once (its slots free up, the joiner leaves the
-- tour's group chat and Tracking) and tells the admins. The rules stay: not
-- within 14 days of the tour, payments are non-refundable, and a reason is
-- required (picked from a list, or typed for "Other").
create or replace function public.cancel_my_booking(
  p_booking_id public.bookings.id%type,
  p_reason     text
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b        public.bookings%rowtype;
  v_tour   public.tours%rowtype;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_name   text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.user_id is distinct from auth.uid() then
    raise exception 'Booking not found.';
  end if;
  if b.booking_status in ('Cancelled', 'Rejected') then
    raise exception 'This booking is already closed.';
  end if;
  if b.payment_status = 'Awaiting Payment' then
    raise exception 'This booking isn''t paid yet. Release the slots instead.';
  end if;
  select * into v_tour from public.tours where id = b.tour_id;
  if v_tour.start_date is not null
     and v_tour.start_date - (now() at time zone 'Asia/Manila')::date < public.cancellation_cutoff_days() then
    raise exception 'Cancellations are not accepted within % days of the tour date.', public.cancellation_cutoff_days();
  end if;
  if length(v_reason) < 5 then
    raise exception 'Please choose a reason for cancelling.';
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_id', auth.uid()::text, true);
  update public.bookings
     set booking_status = 'Cancelled',
         cancellation_reason = v_reason,
         cancellation_requested_at = now()
   where id = b.id
   returning * into b;
  perform set_config('app.trusted_booking_write', 'off', true);

  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_name
    from public.profiles p where p.id = b.user_id;
  insert into public.notifications (user_id, title, message, type, related_id)
  values (b.user_id, 'Booking Cancelled',
          format('Your booking %s for %s has been cancelled and your slot%s released. Payments are non-refundable.',
                 b.booking_number, coalesce(v_tour.title, 'your tour'), case when b.slots_booked = 1 then ' was' else 's were' end),
          'cancellation', null);
  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id, 'Booking Cancelled',
         format('%s cancelled %s (%s). Reason: %s. The slots were released.',
                coalesce(v_name, nullif(b.full_name, 'N/A'), 'A joiner'), coalesce(v_tour.title, 'a tour'), b.booking_number, v_reason),
         'cancellation', null
    from public.profiles a where a.role = 'admin';
  return b;
end;
$$;

revoke all on function public.cancel_my_booking(public.bookings.id%type, text) from public, anon;
grant execute on function public.cancel_my_booking(public.bookings.id%type, text) to authenticated;

-- ── 4. Accommodation choices ──────────────────
-- The admin ticks which accommodation a tour (or an exclusive tour package)
-- offers: Tent, AC Room and/or Non-AC Room. Joiners choose one when they book
-- (bookings.accommodation) or pay an exclusive tour (exclusive_requests.accommodation).
-- The payments function checks the choice against the tour's options.
alter table public.tours add column if not exists accommodation_options text[] not null default '{}';
alter table public.bookings add column if not exists accommodation text;

create or replace function public.accommodation_choices()
returns text[] language sql immutable as $$ select array['Tent', 'AC Room', 'Non-AC Room'] $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tours_accommodation_options_check') then
    alter table public.tours add constraint tours_accommodation_options_check
      check (accommodation_options <@ array['Tent', 'AC Room', 'Non-AC Room']);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_accommodation_check') then
    alter table public.bookings add constraint bookings_accommodation_check
      check (accommodation is null or accommodation in ('Tent', 'AC Room', 'Non-AC Room'));
  end if;
end;
$$;

-- ── 5. Exclusive tours and tour requests ──────
-- a. participants: exclusive tours list each person's name and number.
alter table public.exclusive_requests add column if not exists participants jsonb not null default '[]'::jsonb;

-- b. Trips last at most 1 week, and a joiner can't send the same request twice
--    while one for that destination is still open (For Approval or Approved,
--    and its trip not over yet).
create or replace function public.exclusive_requests_check_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (Checked when the dates are set, so older, longer requests can still be handled.)
  if (tg_op = 'INSERT' or new.preferred_date is distinct from old.preferred_date or new.preferred_end_date is distinct from old.preferred_end_date)
     and new.preferred_date is not null and new.preferred_end_date is not null
     and new.preferred_end_date - new.preferred_date + 1 > 7 then
    raise exception 'A trip can be at most 1 week (7 days) long.';
  end if;
  if new.user_id is not null and new.status in ('Pending', 'Approved') and exists (
    select 1 from public.exclusive_requests r
     where r.user_id = new.user_id
       and r.id is distinct from new.id
       and r.request_type = new.request_type
       and lower(btrim(r.destination)) = lower(btrim(new.destination))
       and r.status in ('Pending', 'Approved')
       and (r.preferred_date is null or r.preferred_date >= (now() at time zone 'Asia/Manila')::date)
  ) and (tg_op = 'INSERT' or new.destination is distinct from old.destination) then
    raise exception 'You already sent a request for %. You can edit that one under Your Submitted Requests.', btrim(new.destination);
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_check_request on public.exclusive_requests;
create trigger exclusive_requests_check_request
  before insert or update of destination, preferred_date, preferred_end_date, status on public.exclusive_requests
  for each row execute function public.exclusive_requests_check_request();

-- notifications.related_id is a uuid; a request id that isn't one is left out.
create or replace function public.request_ref(p_id text)
returns uuid language sql immutable as $$
  select case when p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_id::uuid end
$$;

-- c. Joiners can edit their request until the agency approves it.
create or replace function public.update_my_request(
  p_request_id public.exclusive_requests.id%type,
  p_fields     jsonb
)
returns public.exclusive_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.exclusive_requests%rowtype;
  v_from date := nullif(p_fields ->> 'preferred_date', '')::date;
  v_to   date := nullif(p_fields ->> 'preferred_end_date', '')::date;
begin
  select * into r from public.exclusive_requests where id = p_request_id for update;
  if not found or r.user_id is distinct from auth.uid() then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'Pending' or r.package_sent_at is not null then
    raise exception 'This request was already reviewed, so it can''t be changed. Please message us instead.';
  end if;
  if length(btrim(coalesce(p_fields ->> 'destination', ''))) < 2 then
    raise exception 'Please enter the destination.';
  end if;
  if v_from is null or v_from < (now() at time zone 'Asia/Manila')::date + 21 then
    raise exception 'Trips can be booked from 3 weeks ahead. Please pick a later date.';
  end if;
  if v_to is null or v_to < v_from then
    raise exception 'Please choose your trip dates.';
  end if;

  -- Lets the request guard (below) accept this joiner edit.
  perform set_config('app.joiner_request_edit', 'on', true);
  update public.exclusive_requests
     set full_name = left(btrim(coalesce(p_fields ->> 'full_name', full_name)), 120),
         contact_number = left(btrim(coalesce(p_fields ->> 'contact_number', contact_number)), 40),
         email = left(btrim(coalesce(p_fields ->> 'email', email)), 200),
         destination = left(btrim(p_fields ->> 'destination'), 150),
         region = case when r.request_type = 'request' then nullif(left(btrim(coalesce(p_fields ->> 'region', '')), 150), '') else region end,
         group_size = greatest(1, least(100, coalesce(nullif(p_fields ->> 'group_size', '')::integer, group_size))),
         preferred_date = v_from,
         preferred_end_date = v_to,
         trip_days = v_to - v_from + 1,
         budget = case when r.request_type = 'exclusive' then nullif(p_fields ->> 'budget', '')::numeric else budget end,
         notes = left(coalesce(p_fields ->> 'notes', ''), 2000),
         participants = case when r.request_type = 'exclusive' and jsonb_typeof(p_fields -> 'participants') = 'array'
                             then p_fields -> 'participants' else participants end,
         updated_at = now()
   where id = r.id
   returning * into r;
  perform set_config('app.joiner_request_edit', 'off', true);

  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id, 'Request Updated',
         format('%s changed their %s for %s.', coalesce(nullif(r.full_name, ''), 'A joiner'),
                case when r.request_type = 'exclusive' then 'exclusive tour request' else 'tour request' end, r.destination),
         'exclusive_request', public.request_ref(r.id::text)
    from public.profiles a where a.role = 'admin';
  return r;
end;
$$;

revoke all on function public.update_my_request(public.exclusive_requests.id%type, jsonb) from public, anon;
grant execute on function public.update_my_request(public.exclusive_requests.id%type, jsonb) to authenticated;

-- update_my_request() and reject_overdue_requests() pass the "only the agency
-- changes a request" guard.
create or replace function public.exclusive_requests_guard_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_request() and not public.is_admin()
     and coalesce(current_setting('app.joiner_request_edit', true), '') <> 'on' then
    raise exception 'Only Bandang IBAYO can change a request after it is sent.';
  end if;
  return new;
end;
$$;

-- d. The agency has 1 month to review a request and send its tour package,
--    and the package must be sent at least 2 weeks before the trip. Requests
--    that miss either are Rejected automatically, and the joiner is told.
create or replace function public.reject_overdue_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_count integer := 0;
begin
  perform set_config('app.joiner_request_edit', 'on', true);
  for v_r in
    update public.exclusive_requests r
       set status = 'Rejected',
           admin_response = case
             when r.preferred_date is not null and r.preferred_date < (now() at time zone 'Asia/Manila')::date + 14
               then 'The tour package wasn''t ready at least 2 weeks before the trip date.'
             else 'The tour package wasn''t ready within 1 month of the request.' end,
           reviewed_at = now(),
           updated_at = now()
     where r.status in ('Pending', 'Approved')
       and r.package_sent_at is null
       and ((r.preferred_date is not null and r.preferred_date < (now() at time zone 'Asia/Manila')::date + 14)
            or r.created_at < now() - interval '30 days')
    returning r.id, r.user_id, r.destination, r.request_type, r.admin_response
  loop
    v_count := v_count + 1;
    if v_r.user_id is not null then
      insert into public.notifications (user_id, title, message, type, related_id)
      values (v_r.user_id,
              case when v_r.request_type = 'exclusive' then 'Exclusive Tour Update' else 'Tour Request Update' end,
              format('Your request for %s was not approved. %s You''re welcome to send a new request for a later date.', v_r.destination, v_r.admin_response),
              'exclusive_request', public.request_ref(v_r.id::text));
    end if;
  end loop;
  perform set_config('app.joiner_request_edit', 'off', true);
  return v_count;
end;
$$;

revoke all on function public.reject_overdue_requests() from public, anon, authenticated;

-- Anyone logged in may run it (the pages do when they open); it only rejects overdue requests.
create or replace function public.run_overdue_requests()
returns integer
language sql
security definer
set search_path = public
as $$ select public.reject_overdue_requests() $$;

revoke all on function public.run_overdue_requests() from public, anon;
grant execute on function public.run_overdue_requests() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'reject-overdue-requests';
    perform cron.schedule('reject-overdue-requests', '7 * * * *', 'select public.reject_overdue_requests()');
  end if;
end;
$$;

-- ── 6. Profiles: a second email and phone number ──
-- phone_number is always the primary number (used for bookings);
-- secondary_phone is the other one. primary_email chooses which email gets
-- notification emails: 'login' (the account's email) or 'secondary'.
alter table public.profiles add column if not exists secondary_email text;
alter table public.profiles add column if not exists secondary_phone text;
alter table public.profiles add column if not exists primary_email text not null default 'login';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_primary_email_check') then
    alter table public.profiles add constraint profiles_primary_email_check
      check (primary_email in ('login', 'secondary') and (primary_email = 'login' or secondary_email is not null));
  end if;
end;
$$;

-- ── 7. Archived joiner accounts ───────────────
-- Joiner Accounts → Archived shows:
--  - joiners who haven't logged in for 2 years (from their login activity), and
--  - joiners who deleted their account (archived_accounts keeps only their
--    name, username, email and dates; the send-email function adds the row).
create table if not exists public.archived_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  full_name       text,
  username        text,
  email           text,
  registered_at   timestamptz,
  last_sign_in_at timestamptz,
  reason          text not null default 'deleted' check (reason in ('deleted')),
  archived_at     timestamptz not null default now()
);

alter table public.archived_accounts enable row level security;
revoke all on public.archived_accounts from anon, authenticated;
grant select on public.archived_accounts to authenticated;
grant all on public.archived_accounts to service_role;

drop policy if exists "archived_accounts_admin_read" on public.archived_accounts;
create policy "archived_accounts_admin_read" on public.archived_accounts
  for select to authenticated using (public.is_admin());

-- Admins: every joiner's last login, for the 2-year inactivity rule.
create or replace function public.joiner_login_activity()
returns table (id uuid, last_sign_in_at timestamptz, inactive boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see login activity.';
  end if;
  return query
    select p.id, u.last_sign_in_at,
           coalesce(u.last_sign_in_at, u.created_at) < now() - interval '2 years'
      from public.profiles p
      left join auth.users u on u.id = p.id
     where coalesce(p.role, 'joiner') <> 'admin';
end;
$$;

revoke all on function public.joiner_login_activity() from public, anon;
grant execute on function public.joiner_login_activity() to authenticated;

-- ── 8. Sensitive words are blocked in Group Chat and Reviews ──
-- Offensive words (English, Filipino/Tagalog, Bisaya, Ilocano, Spanish) are
-- replaced with **** before a chat message or review is saved. The website
-- uses the same list (src/profanity.js); keep them in sync.
create or replace function public.mask_sensitive_words(p_text text)
returns text
language sql
immutable
as $$
  select case when p_text is null then null
    else regexp_replace(p_text, '(?<![[:alnum:]_])(motherfuckers|putang\s+ina\s+mo|hijo\s+de\s+puta|motherfucker|pesteng\s+yawa|putanginamo|tang\s+ina\s+mo|putang\s+ina|tangina\s+mo|tanginamo|animal\s+ka|hinayupak|tarantada|douchebag|pistiyawa|putangina|tarantado|kinginamo|bastards|okininam|sira\s+ulo|ukininam|retarded|arsehole|dickhead|hayop\s+ka|tang\s+ina|kantutan|assholes|punyemas|bullshit|fucking|ukinnam|gago\s+ka|niggers|pendejo|dumbass|gi\s+atay|okinnam|buwisit|jackass|faggots|ulol\s+ka|puta\s+mo|puta\s+ka|fuckers|pussies|bitches|pendeja|tangena|pakshet|asshole|siraulo|tangang|bastard|tangina|kingina|punyeta|shunga|cabron|kepyas|cabrón|pekpek|betlog|niggas|pak\s+yu|mierda|fucked|kantot|bwisit|giatay|putcha|shitty|bobong|pokpok|biatch|wanker|retard|fuking|hindot|rapist|inutil|fcking|whores|nigger|fucker|faggot|fuckin|lintik|pussy|kupal|cocks|pisti|bayag|leche|bilat|engot|pakyu|peste|piste|sluts|buang|whore|dicks|fucks|burat|chupa|nigga|tamod|prick|phuck|shits|bitch|jakol|tanga|joder|pucha|yawaa|boang|tsupa|cunts|stfu|mofo|olol|ulol|gaga|fuck|gagu|gago|gagi|iyot|boba|coño|twat|oten|rape|puto|btch|gtfo|otin|dick|shit|bobo|slut|puta|yawa|ulul|cock|titi|porn|cunt|puke|wtf|fag|sht|fck|fuk|mf|fk)(?![[:alnum:]_])', '****', 'gi') end
$$;

create or replace function public.tour_chat_messages_mask_words()
returns trigger
language plpgsql
as $$
begin
  new.body := public.mask_sensitive_words(new.body);
  return new;
end;
$$;

drop trigger if exists tour_chat_messages_mask_words on public.tour_chat_messages;
create trigger tour_chat_messages_mask_words
  before insert or update of body on public.tour_chat_messages
  for each row execute function public.tour_chat_messages_mask_words();

create or replace function public.reviews_mask_words()
returns trigger
language plpgsql
as $$
begin
  new.comment := public.mask_sensitive_words(new.comment);
  return new;
end;
$$;

drop trigger if exists reviews_mask_words on public.reviews;
create trigger reviews_mask_words
  before insert or update of comment on public.reviews
  for each row execute function public.reviews_mask_words();


-- ════════════ 20261114000000_request_participants.sql ════════════

-- ─────────────────────────────────────────────
-- Request a Tour: the names and numbers of everyone in the group
--
-- Tour requests now list each person's name and contact number, like
-- exclusive tours (exclusive_requests.participants).
-- 1. update_my_request(): a joiner's edit saves the list for both kinds of request.
-- 2. hold_requested_slots(): the requester's held booking starts with the
--    people they listed, so the names are already filled in when they pay.
--
-- Run after 20261113000000_big_update.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Joiner edits ───────────────────────────
create or replace function public.update_my_request(
  p_request_id public.exclusive_requests.id%type,
  p_fields     jsonb
)
returns public.exclusive_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.exclusive_requests%rowtype;
  v_from date := nullif(p_fields ->> 'preferred_date', '')::date;
  v_to   date := nullif(p_fields ->> 'preferred_end_date', '')::date;
begin
  select * into r from public.exclusive_requests where id = p_request_id for update;
  if not found or r.user_id is distinct from auth.uid() then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'Pending' or r.package_sent_at is not null then
    raise exception 'This request was already reviewed, so it can''t be changed. Please message us instead.';
  end if;
  if length(btrim(coalesce(p_fields ->> 'destination', ''))) < 2 then
    raise exception 'Please enter the destination.';
  end if;
  if v_from is null or v_from < (now() at time zone 'Asia/Manila')::date + 21 then
    raise exception 'Trips can be booked from 3 weeks ahead. Please pick a later date.';
  end if;
  if v_to is null or v_to < v_from then
    raise exception 'Please choose your trip dates.';
  end if;

  -- Lets the request guard (below) accept this joiner edit.
  perform set_config('app.joiner_request_edit', 'on', true);
  update public.exclusive_requests
     set full_name = left(btrim(coalesce(p_fields ->> 'full_name', full_name)), 120),
         contact_number = left(btrim(coalesce(p_fields ->> 'contact_number', contact_number)), 40),
         email = left(btrim(coalesce(p_fields ->> 'email', email)), 200),
         destination = left(btrim(p_fields ->> 'destination'), 150),
         region = case when r.request_type = 'request' then nullif(left(btrim(coalesce(p_fields ->> 'region', '')), 150), '') else region end,
         group_size = greatest(1, least(100, coalesce(nullif(p_fields ->> 'group_size', '')::integer, group_size))),
         preferred_date = v_from,
         preferred_end_date = v_to,
         trip_days = v_to - v_from + 1,
         budget = case when r.request_type = 'exclusive' then nullif(p_fields ->> 'budget', '')::numeric else budget end,
         notes = left(coalesce(p_fields ->> 'notes', ''), 2000),
         participants = case when jsonb_typeof(p_fields -> 'participants') = 'array'
                             then p_fields -> 'participants' else participants end,
         updated_at = now()
   where id = r.id
   returning * into r;
  perform set_config('app.joiner_request_edit', 'off', true);

  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id, 'Request Updated',
         format('%s changed their %s for %s.', coalesce(nullif(r.full_name, ''), 'A joiner'),
                case when r.request_type = 'exclusive' then 'exclusive tour request' else 'tour request' end, r.destination),
         'exclusive_request', public.request_ref(r.id::text)
    from public.profiles a where a.role = 'admin';
  return r;
end;
$$;

revoke all on function public.update_my_request(public.exclusive_requests.id%type, jsonb) from public, anon;
grant execute on function public.update_my_request(public.exclusive_requests.id%type, jsonb) to authenticated;

-- ── 2. Held slots start with the listed people ──
create or replace function public.hold_requested_slots(
  p_request_id public.exclusive_requests.id%type,
  p_tour_id    public.tours.id%type
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.exclusive_requests%rowtype;
  t         public.tours%rowtype;
  v_profile public.profiles%rowtype;
  v_email   text;
  v_name    text;
  v_slots   integer;
  v_booked  integer;
  v_booking public.bookings%rowtype;
  v_companions jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can hold slots for a request.';
  end if;

  select * into r from public.exclusive_requests where id = p_request_id;
  if not found or r.request_type is distinct from 'request' or r.status is distinct from 'Approved' then
    raise exception 'Only an approved tour request can get held slots.';
  end if;
  if r.user_id is null then
    raise exception 'This request has no account to hold slots for.';
  end if;

  -- Already held (or booked) for this request: keep it.
  select * into v_booking from public.bookings
   where request_id = p_request_id and booking_status not in ('Cancelled', 'Rejected')
   limit 1;
  if found then
    return v_booking;
  end if;
  -- The requester already booked this tour themselves.
  select * into v_booking from public.bookings
   where tour_id = p_tour_id and user_id = r.user_id and booking_status not in ('Cancelled', 'Rejected')
   limit 1;
  if found then
    return v_booking;
  end if;

  select * into t from public.tours where id = p_tour_id for update;
  if not found then
    raise exception 'Tour not found.';
  end if;

  select coalesce(sum(slots_booked), 0) into v_booked
    from public.bookings where tour_id = p_tour_id and booking_status not in ('Cancelled', 'Rejected');
  v_slots := least(greatest(coalesce(r.group_size, 1), 1), coalesce(t.group_size, 15) - v_booked);
  if v_slots < 1 then
    raise exception 'This tour has no free slots left to hold.';
  end if;

  select * into v_profile from public.profiles where id = r.user_id;
  select email into v_email from auth.users where id = r.user_id;
  v_name := nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), '');

  -- The people the requester listed (besides themselves) fill in the
  -- companions, so they don't have to type them again when they pay.
  select coalesce(jsonb_agg(jsonb_build_object(
           'full_name', left(btrim(p ->> 'full_name'), 120),
           'contact_number', left(btrim(coalesce(p ->> 'contact_number', '')), 40)) order by n), '[]'::jsonb)
    into v_companions
    from jsonb_array_elements(coalesce(r.participants, '[]'::jsonb)) with ordinality as x(p, n)
   where n > 1 and n <= v_slots and nullif(btrim(p ->> 'full_name'), '') is not null;

  perform set_config('app.trusted_booking_write', 'on', true);
  insert into public.bookings (
    tour_id, user_id, request_id, booking_number, full_name, email, contact_number,
    slots_booked, total_price, amount_paid, payment_method, companions,
    payment_status, booking_status, hold_expires_at
  ) values (
    p_tour_id, r.user_id, p_request_id,
    'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
    coalesce(v_name, nullif(trim(r.full_name), ''), 'N/A'),
    coalesce(v_email, nullif(trim(r.email), ''), 'N/A'),
    coalesce(nullif(trim(v_profile.phone_number), ''), nullif(trim(r.contact_number), ''), 'N/A'),
    v_slots, coalesce(t.price, 0) * v_slots, 0, 'Full Payment', v_companions,
    'Awaiting Payment', 'Active', now() + make_interval(hours => public.requested_tour_hold_hours())
  )
  returning * into v_booking;
  perform set_config('app.trusted_booking_write', 'off', true);

  insert into public.notifications (user_id, title, message, type)
  values (r.user_id, 'Your requested tour is posted! 🎉',
          format('%s is now open on Explore Tours, and we''re holding %s slot%s for you until %s. Pay in My Bookings to keep them, or they''ll be released to other joiners.',
                 t.title, v_slots, case when v_slots = 1 then '' else 's' end,
                 to_char(v_booking.hold_expires_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')),
          'booking');

  return v_booking;
end;
$$;

revoke all on function public.hold_requested_slots from public, anon;
grant execute on function public.hold_requested_slots to authenticated;


-- ════════════ 20261115000000_admin_messages.sql ════════════

-- ─────────────────────────────────────────────
-- Admin messages: a copy of every message an admin sends a joiner
--
-- Joiner Accounts (Send Email to Joiner, Email a Joiner) and Tour Management
-- (Message Joiners) save each message here, so:
--   • admins can see what was sent to a joiner, and when;
--   • joiners can read them on their Messages page.
-- mark_admin_messages_read() marks the joiner's own messages as read.
--
-- Run after 20261114000000_request_participants.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.admin_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sender_id  uuid default auth.uid() references public.profiles(id) on delete set null,
  source     text not null default 'email' check (source in ('email', 'tour')),
  subject    text not null check (length(btrim(subject)) between 1 and 200),
  message    text not null check (length(btrim(message)) between 1 and 5000),
  tour_id    text,           -- tours.id, as text (Message Joiners only)
  emailed    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_messages_user_idx on public.admin_messages (user_id, created_at desc);

alter table public.admin_messages enable row level security;

drop policy if exists "admin_messages_admin_all" on public.admin_messages;
create policy "admin_messages_admin_all" on public.admin_messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_messages_own_select" on public.admin_messages;
create policy "admin_messages_own_select" on public.admin_messages
  for select using (auth.uid() = user_id);

-- Joiners can't edit messages; they only mark their own as read.
create or replace function public.mark_admin_messages_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.admin_messages set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_admin_messages_read() from public, anon;
grant execute on function public.mark_admin_messages_read() to authenticated;
grant select, insert, update, delete on public.admin_messages to authenticated;


-- ════════════ 20261116000000_group_limits.sql ════════════

-- ─────────────────────────────────────────────
-- Group size limits
--
-- 1. A tour takes at most 14 joiners per date (one van). Checked when a tour
--    is posted or its slots are changed, so older tours keep their number.
-- 2. Request a Tour: at most 14 people. Exclusive Tours: at most 5 vans of 14
--    (70 people).
--
-- Run after 20261115000000_admin_messages.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tours_slot_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.group_size is not null and new.group_size > 14
     and (tg_op = 'INSERT' or new.group_size is distinct from old.group_size) then
    raise exception 'A tour can have at most 14 slots per date.';
  end if;
  return new;
end;
$$;

drop trigger if exists tours_slot_limit on public.tours;
create trigger tours_slot_limit
  before insert or update of group_size on public.tours
  for each row execute function public.tours_slot_limit();

create or replace function public.exclusive_requests_group_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.group_size is null
     or (tg_op = 'UPDATE' and new.group_size is not distinct from old.group_size
         and new.request_type is not distinct from old.request_type) then
    return new;
  end if;
  if new.request_type = 'request' and new.group_size > 14 then
    raise exception 'A requested tour takes at most 14 people (one van).';
  end if;
  if new.group_size > 70 then
    raise exception 'Exclusive tours fit up to 5 vans of 14 (70 people). For a bigger group, please message us.';
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_group_limit on public.exclusive_requests;
create trigger exclusive_requests_group_limit
  before insert or update of group_size, request_type on public.exclusive_requests
  for each row execute function public.exclusive_requests_group_limit();


-- ════════════ 20261117000000_realtime_tables.sql ════════════

-- ─────────────────────────────────────────────
-- Live updates for every table the app listens to
--
-- The app subscribes to changes (Supabase Realtime) on these tables, but a
-- table only sends changes once it's in the supabase_realtime publication.
-- Only the group chat tables were added before, so the notification bell,
-- the Notification page and other live lists didn't update until a reload.
-- Row level security still applies: everyone only gets changes to rows
-- they're allowed to see.
--
-- Run after 20261116000000_group_limits.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'notifications', 'admin_messages', 'bookings', 'exclusive_requests',
    'feed_posts', 'feed_comments', 'feed_reactions', 'profiles', 'reviews',
    'tours', 'tour_meetups', 'tour_tracking_logs', 'tour_vehicles',
    'tour_chat_messages', 'tour_chat_reactions'
  ] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


-- ════════════ 20261118000000_admin_accounts.sql ════════════

-- ─────────────────────────────────────────────
-- More than one admin
--
-- 1. A main admin (profiles.is_main_admin). The admins that exist now become
--    main admins. Only a main admin can add or remove admins; every admin can
--    do everything else, the same as before.
-- 2. Admin Settings: list_admins(), make_admin(email) for an existing account,
--    remove_admin(id). New admin accounts are created by the auth function
--    ("create-admin"), which checks is_main_admin() the same way.
-- 3. Who processed a payment: when an admin changes a booking's or exclusive
--    tour's payment, their name is saved (processed_by_name, and
--    balance_processed_by_name for the balance) and shown on the receipt.
--    Online payments (PayMongo) have no admin name.
--
-- Run after 20261117000000_realtime_tables.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Main admin ─────────────────────────────
alter table public.profiles add column if not exists is_main_admin boolean not null default false;

-- The admins there are now become main admins (only the first time).
update public.profiles set is_main_admin = true
 where role = 'admin'
   and not exists (select 1 from public.profiles where is_main_admin);

create or replace function public.is_main_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_main_admin);
$$;

-- Admin name as shown on receipts and the top-right card.
create or replace function public.admin_display_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, u.email, 'Admin')
    from public.profiles p left join auth.users u on u.id = p.id
   where p.id = p_id;
$$;

-- Roles: only a main admin (or the SQL Editor) changes who is an admin, and a
-- main admin can't remove their own admin rights (so there's always one).
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client_request() or pg_trigger_depth() > 1 then
      new.role := 'joiner';
      new.is_main_admin := false;
    end if;
    return new;
  end if;

  if public.is_client_request() then
    if new.id is distinct from old.id then
      raise exception 'You cannot change this field.';
    end if;
    if (new.role is distinct from old.role or new.is_main_admin is distinct from old.is_main_admin)
       and not public.is_main_admin() then
      raise exception 'Only the main admin can add or remove admins.';
    end if;
    if old.id = auth.uid() and (new.role is distinct from 'admin' or not new.is_main_admin) and old.is_main_admin then
      raise exception 'You can''t remove your own main admin rights.';
    end if;
  end if;
  if new.role is distinct from 'admin' then
    new.is_main_admin := false;
  end if;
  return new;
end;
$$;

-- ── 2. Admin Settings ─────────────────────────
create or replace function public.list_admins()
returns table (id uuid, name text, email text, is_main_admin boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.is_main_admin, u.created_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'admin' and public.is_admin()
   order by p.is_main_admin desc, u.created_at;
$$;

create or replace function public.make_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can add admins.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No account uses that email. Create a new admin account instead.';
  end if;
  update public.profiles set role = 'admin' where id = v_id;
  return public.admin_display_name(v_id);
end;
$$;

create or replace function public.remove_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can remove admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t remove yourself.';
  end if;
  if exists (select 1 from public.profiles where id = p_id and is_main_admin) then
    raise exception 'Main admins can''t be removed here.';
  end if;
  update public.profiles set role = 'joiner', is_main_admin = false where id = p_id and role = 'admin';
end;
$$;

revoke all on function public.list_admins() from public, anon;
revoke all on function public.make_admin(text) from public, anon;
revoke all on function public.remove_admin(uuid) from public, anon;
revoke all on function public.admin_display_name(uuid) from public, anon;
grant execute on function public.is_main_admin() to authenticated;
grant execute on function public.list_admins() to authenticated;
grant execute on function public.make_admin(text) to authenticated;
grant execute on function public.remove_admin(uuid) to authenticated;
grant execute on function public.admin_display_name(uuid) to authenticated;

-- ── 3. Who processed a payment ────────────────
alter table public.bookings add column if not exists processed_by uuid;
alter table public.bookings add column if not exists processed_by_name text;
alter table public.bookings add column if not exists balance_processed_by_name text;
alter table public.exclusive_requests add column if not exists processed_by uuid;
alter table public.exclusive_requests add column if not exists processed_by_name text;
alter table public.exclusive_requests add column if not exists balance_processed_by_name text;

-- When an admin changes the payment, their name is saved. Nobody else can set
-- these columns.
create or replace function public.stamp_processed_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := auth.uid() is not null and public.is_admin();
  v_name  text;
begin
  -- Only this trigger writes these.
  new.processed_by := old.processed_by;
  new.processed_by_name := old.processed_by_name;
  new.balance_processed_by_name := old.balance_processed_by_name;
  if not v_admin then
    return new;
  end if;
  v_name := public.admin_display_name(auth.uid());

  if new.balance_settled is distinct from old.balance_settled and coalesce(new.balance_settled, false) then
    new.balance_processed_by_name := v_name;
  elsif new.payment_status is distinct from old.payment_status
     or new.amount_paid is distinct from old.amount_paid
     or (tg_table_name = 'bookings' and to_jsonb(new) ->> 'booking_status' is distinct from to_jsonb(old) ->> 'booking_status') then
    new.processed_by := auth.uid();
    new.processed_by_name := v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_bookings_stamp_processed_by on public.bookings;
create trigger zz_bookings_stamp_processed_by
  before update on public.bookings
  for each row execute function public.stamp_processed_by();

drop trigger if exists zz_exclusive_requests_stamp_processed_by on public.exclusive_requests;
create trigger zz_exclusive_requests_stamp_processed_by
  before update on public.exclusive_requests
  for each row execute function public.stamp_processed_by();


-- ════════════ 20261119000000_remove_main_admin.sql ════════════

-- ─────────────────────────────────────────────
-- Admin Settings: a main admin can also remove another main admin
--
-- (Every admin that existed when 20261118 ran became a main admin.) A main
-- admin still can't remove themselves, so there's always at least one.
--
-- Run after 20261118000000_admin_accounts.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.remove_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can remove admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t remove yourself.';
  end if;
  update public.profiles set role = 'joiner', is_main_admin = false where id = p_id and role = 'admin';
end;
$$;

revoke all on function public.remove_admin(uuid) from public, anon;
grant execute on function public.remove_admin(uuid) to authenticated;



-- ════════════ 20261120000000_downpayment_50.sql ════════════

-- ─────────────────────────────────────────────
-- Tour downpayment is now 50% (it was 40%)
--
-- bookings.downpayment_amount remembers what a joiner actually paid as their
-- downpayment, so older 40% bookings keep showing the right amounts on their
-- receipts after the switch. It's filled in automatically when a downpayment
-- is paid; existing bookings are filled in below.
--
-- Run after 20261119000000_remove_main_admin.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.bookings add column if not exists downpayment_amount numeric(12,2);

create or replace function public.bookings_remember_downpayment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_method = 'Downpayment'
     and new.payment_status = 'Complete'
     and new.downpayment_amount is null
     and not coalesce(new.balance_settled, false)
     and new.amount_paid is not null then
    new.downpayment_amount := new.amount_paid;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_bookings_remember_downpayment on public.bookings;
create trigger zz_bookings_remember_downpayment
  before insert or update on public.bookings
  for each row execute function public.bookings_remember_downpayment();

-- Bookings from before this update: still owing → what they paid; balance
-- already paid → the 40% they were charged then.
update public.bookings
set downpayment_amount = case
      when coalesce(balance_settled, false) then round(coalesce(total_price, 0) * 0.4, 2)
      else amount_paid
    end
where payment_method = 'Downpayment'
  and payment_status = 'Complete'
  and downpayment_amount is null
  and (coalesce(balance_settled, false) or amount_paid is not null);


commit;
