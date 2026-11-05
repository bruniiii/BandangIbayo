-- ─────────────────────────────────────────────
-- All database updates from 20261111 to 20261213, in order, in one go.
--
-- Paste the whole file into the Supabase SQL Editor and click Run.
-- It runs as one transaction: if anything fails, nothing is changed, and the
-- error says which part failed. Safe to run more than once (updates that are
-- already installed are simply applied again).
-- Afterwards, run supabase/updates/check_updates.sql: every row should say
-- "installed".
--
-- Generated from supabase/migrations/20261111…20261213 — edit those, not this.
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
-- (Dropped first: 20261124 gives it more columns, and re-running this file
-- after that must not fail.)
drop function if exists public.joiner_login_activity();
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



-- ════════════ 20261121000000_archive_admins.sql ════════════

-- ─────────────────────────────────────────────
-- Admin Settings: archive an admin instead of removing them, and restore them
--
-- An archived admin's role is 'archived_admin': they can't open the admin
-- dashboard (or log in at all), but their account, name and history stay.
-- The main admin can restore them later, as the kind of admin they were.
--
-- Run after 20261120000000_downpayment_50.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- Your database has a rule that a profile's role can only be 'admin' or
-- 'joiner'. Replace it with one that also allows 'archived_admin'.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.profiles'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%role%'
       and pg_get_constraintdef(con.oid) not ilike '%primary_email%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.profiles
  add constraint role_check check (role is null or role in ('joiner', 'admin', 'archived_admin')) not valid;

alter table public.profiles add column if not exists admin_archived_at timestamptz;
alter table public.profiles add column if not exists archived_was_main boolean not null default false;

create or replace function public.archive_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can archive admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t archive yourself.';
  end if;
  update public.profiles
     set archived_was_main = is_main_admin, role = 'archived_admin', is_main_admin = false, admin_archived_at = now()
   where id = p_id and role = 'admin';
  if not found then
    raise exception 'That account isn''t an admin.';
  end if;
end;
$$;

create or replace function public.restore_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can restore admins.';
  end if;
  update public.profiles
     set role = 'admin', is_main_admin = archived_was_main, archived_was_main = false, admin_archived_at = null
   where id = p_id and role = 'archived_admin';
  if not found then
    raise exception 'That admin isn''t archived.';
  end if;
end;
$$;

-- (Dropped first: 20261126 adds a column; re-running this must not fail.)
drop function if exists public.list_archived_admins();
create or replace function public.list_archived_admins()
returns table (id uuid, name text, email text, was_main_admin boolean, archived_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.archived_was_main, p.admin_archived_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'archived_admin' and public.is_main_admin()
   order by p.admin_archived_at desc;
$$;

revoke all on function public.archive_admin(uuid) from public, anon;
revoke all on function public.restore_admin(uuid) from public, anon;
revoke all on function public.list_archived_admins() from public, anon;
grant execute on function public.archive_admin(uuid) to authenticated;
grant execute on function public.restore_admin(uuid) to authenticated;
grant execute on function public.list_archived_admins() to authenticated;



-- ════════════ 20261122000000_deactivate_account.sql ════════════

-- ─────────────────────────────────────────────
-- Joiners: deactivate your account (instead of deleting it), reactivate later
--
-- profiles.deactivated_at is set while the account is deactivated. The joiner
-- can't use the site until they log in again and choose to reactivate it.
-- Nothing is deleted: bookings, reviews and profile details stay.
--
-- Run after 20261121000000_archive_admins.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists deactivated_at timestamptz;

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
  update public.profiles set deactivated_at = now() where id = auth.uid();
end;
$$;

create or replace function public.reactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  update public.profiles set deactivated_at = null where id = auth.uid();
end;
$$;

revoke all on function public.deactivate_my_account() from public, anon;
revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.reactivate_my_account() to authenticated;



-- ════════════ 20261123000000_tour_favorites.sql ════════════

-- ─────────────────────────────────────────────
-- Favorites: joiners star tours on Explore Tours to book later.
-- Each joiner only sees and changes their own favorites.
--
-- Run after 20261122000000_deactivate_account.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.tour_favorites (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tour_id    bigint not null references public.tours(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tour_id)
);

alter table public.tour_favorites enable row level security;

drop policy if exists "Joiners see their own favorites" on public.tour_favorites;
create policy "Joiners see their own favorites"
  on public.tour_favorites for select using (user_id = auth.uid());

drop policy if exists "Joiners add their own favorites" on public.tour_favorites;
create policy "Joiners add their own favorites"
  on public.tour_favorites for insert with check (user_id = auth.uid());

drop policy if exists "Joiners remove their own favorites" on public.tour_favorites;
create policy "Joiners remove their own favorites"
  on public.tour_favorites for delete using (user_id = auth.uid());

grant select, insert, delete on public.tour_favorites to authenticated;



-- ════════════ 20261124000000_archived_joiners.sql ════════════

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



-- ════════════ 20261125000000_departure_reminder.sql ════════════

-- ─────────────────────────────────────────────
-- 1. Reminder 15 minutes before departure
--    Every 5 minutes, joiners whose pickup time is 15 minutes away or less
--    get a notification ("Your pickup is in 15 minutes"), once per booking
--    (email_log kind 'departure-15'). The send-email function then emails
--    the same people (kind 'departure-15-email').
--    Departure = the joiner's chosen pickup point's time (else the first
--    pickup point) on the tour's start date, Philippine time. Times like
--    "8:00 PM", "08:00 pm" or "20:00" are understood.
-- 2. Request a Tour: the columns the form saves always exist.
--
-- Run after 20261124000000_archived_joiners.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists region text;
alter table public.exclusive_requests add column if not exists notes text;
alter table public.exclusive_requests add column if not exists budget numeric;

-- "8:00 PM" on a date → a Manila timestamp (null when the time can't be read).
create or replace function public.pickup_timestamp(p_date date, p_time text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v text := upper(regexp_replace(btrim(coalesce(p_time, '')), '\s+', ' ', 'g'));
  m text[];
  h int;
  mi int;
begin
  if p_date is null or v = '' then return null; end if;
  m := regexp_match(v, '^(\d{1,2})[:.](\d{2})\s*(AM|PM|NN|MN)?');
  if m is null then return null; end if;
  h := m[1]::int; mi := m[2]::int;
  if m[3] in ('PM') and h < 12 then h := h + 12; end if;
  if m[3] in ('AM', 'MN') and h = 12 then h := 0; end if;
  if h > 23 or mi > 59 then return null; end if;
  return (p_date + make_time(h, mi, 0)) at time zone 'Asia/Manila';
end;
$$;

create or replace function public.notify_departure_soon()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select b.id, b.user_id, b.pickup_point, t.title, d.location_name, d.scheduled_time, d.departs_at
      from public.bookings b
      join public.tours t on t.id = b.tour_id
      cross join lateral (
        select m.location_name, m.scheduled_time, public.pickup_timestamp(t.start_date, m.scheduled_time) as departs_at
          from public.tour_meetups m
         where m.tour_id = t.id
         order by (lower(btrim(m.location_name)) = lower(btrim(coalesce(b.pickup_point, '')))) desc, m.created_at, m.id
         limit 1
      ) d
     where b.booking_status not in ('Cancelled', 'Rejected')
       and b.payment_status = 'Complete'
       and b.user_id is not null
       and t.start_date between (now() at time zone 'Asia/Manila')::date - 1 and (now() at time zone 'Asia/Manila')::date + 1
       and d.departs_at is not null
       and now() >= d.departs_at - interval '15 minutes'
       and now() < d.departs_at
       and not exists (select 1 from public.email_log l where l.kind = 'departure-15' and l.ref = b.id::text)
  loop
    insert into public.notifications (user_id, title, message, type, related_id)
    values (
      v_row.user_id,
      'Your pickup is in 15 minutes ⏰',
      format('%s: pickup at %s at %s. Please be at the pickup point now, and open Tracking to see where the van is.',
             v_row.title, v_row.location_name, v_row.scheduled_time),
      'tracking', null
    );
    insert into public.email_log (kind, ref) values ('departure-15', v_row.id::text) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_departure_soon() from public, anon;
grant execute on function public.notify_departure_soon() to authenticated, service_role;

-- Every 5 minutes: the notifications (in the database), then the emails
-- (send-email function, when pg_net is on).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('departure-reminders', 'departure-emails');
    perform cron.schedule('departure-reminders', '*/5 * * * *', 'select public.notify_departure_soon()');
    if exists (select 1 from pg_extension where extname = 'pg_net') then
      perform cron.schedule(
        'departure-emails',
        '1-59/5 * * * *',
        $job$select net.http_post(
          url := 'https://renugdlntgybazpikmbu.supabase.co/functions/v1/send-email',
          body := '{"action":"departure-emails"}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
          )
        )$job$
      );
    end if;
  end if;
exception when others then
  raise notice 'Scheduling the departure reminder failed (%). Enable pg_cron and pg_net, then run this file again.', sqlerrm;
end;
$$;



-- ════════════ 20261126000000_restore_admin_verify.sql ════════════

-- ─────────────────────────────────────────────
-- Restoring an archived admin needs their email verified again
--
-- Admin Settings → Restore emails a 6-digit code to the admin (auth function,
-- "restore-admin"; the code expires after 10 minutes). Until the code is
-- entered ("restore-admin-verify") the account stays archived, can't log in,
-- and shows as "Pending verification" (profiles.admin_restore_pending_at).
--
-- Run after 20261125000000_departure_reminder.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists admin_restore_pending_at timestamptz;

-- Restoring now goes through the email code; the old one-click restore is off.
create or replace function public.restore_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Restoring an admin needs their email verified. Use Restore in Admin Settings.';
end;
$$;

drop function if exists public.list_archived_admins();
create function public.list_archived_admins()
returns table (id uuid, name text, email text, was_main_admin boolean, archived_at timestamptz, pending boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.archived_was_main, p.admin_archived_at,
         p.admin_restore_pending_at is not null
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'archived_admin' and public.is_main_admin()
   order by p.admin_archived_at desc;
$$;

revoke all on function public.list_archived_admins() from public, anon;
grant execute on function public.list_archived_admins() to authenticated;



-- ════════════ 20261127000000_one_tour_per_day.sql ════════════

-- ─────────────────────────────────────────────
-- One tour per day
--
-- Two tours (that haven't ended and aren't archived) can't share a day.
-- tours_no_overlap() checks every new date, changed date and restored
-- tour, whoever saves it (Tour Management, a requested tour's auto-post, SQL).
--
-- First, tours that already overlap are spread out: going from the earliest,
-- a date that lands on a day already taken moves 1 week later (same weekday)
-- until its days are free. Dates that already have bookings are never moved.
--
-- Run after 20261126000000_restore_admin_verify.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

drop trigger if exists tours_no_overlap on public.tours;

-- ── Spread out the tours that overlap today ──
do $$
declare
  r record;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_kept daterange[] := '{}';
  v_range daterange;
  v_weeks int;
  v_booked boolean;
begin
  for r in
    select id, title, start_date, coalesce(end_date, start_date) as end_date
      from public.tours
     where not coalesce(is_archived, false)
       and start_date is not null
       and coalesce(end_date, start_date) >= v_today
     order by start_date, id
  loop
    v_booked := exists (select 1 from public.bookings b
                         where b.tour_id = r.id and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected'));
    v_weeks := 0;
    v_range := daterange(r.start_date, r.end_date, '[]');
    while not v_booked
          and exists (select 1 from unnest(v_kept) k where k && v_range)
          and v_weeks < 104 loop
      v_weeks := v_weeks + 1;
      v_range := daterange(r.start_date + 7 * v_weeks, r.end_date + 7 * v_weeks, '[]');
    end loop;
    if v_weeks > 0 then
      update public.tours
         set start_date = r.start_date + 7 * v_weeks,
             end_date = r.end_date + 7 * v_weeks
       where id = r.id;
      raise notice 'Moved % from % to % (it overlapped another tour)', r.title, r.start_date, r.start_date + 7 * v_weeks;
    elsif v_booked and exists (select 1 from unnest(v_kept) k where k && v_range) then
      raise notice 'Left % on % as it is: it already has bookings. Move it or the other tour by hand.', r.title, r.start_date;
    end if;
    v_kept := v_kept || v_range;
  end loop;
end $$;

-- ── From now on: no two tours on the same day ──
create or replace function public.tours_no_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_other text;
begin
  if coalesce(new.is_archived, false) or new.start_date is null then
    return new;
  end if;
  -- Ended tours never block anything.
  if coalesce(new.end_date, new.start_date) < (now() at time zone 'Asia/Manila')::date then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date
     and coalesce(new.is_archived, false) = coalesce(old.is_archived, false) then
    return new;
  end if;

  v_other := (
    select format('%s (%s)', t.title,
             case when coalesce(t.end_date, t.start_date) = t.start_date
                  then to_char(t.start_date, 'Mon DD, YYYY')
                  else to_char(t.start_date, 'Mon DD') || ' – ' || to_char(t.end_date, 'Mon DD, YYYY') end)
      from public.tours t
     where t.id is distinct from new.id
       and not coalesce(t.is_archived, false)
       and t.start_date is not null
       and daterange(t.start_date, coalesce(t.end_date, t.start_date), '[]')
           && daterange(new.start_date, coalesce(new.end_date, new.start_date), '[]')
     order by t.start_date
     limit 1);

  if v_other is not null then
    raise exception 'Only one tour per day: % is already on those days. Pick other dates.', v_other;
  end if;
  return new;
end;
$$;

create trigger tours_no_overlap
  before insert or update on public.tours
  for each row execute function public.tours_no_overlap();



-- ════════════ 20261128000000_joiner_restores_account.sql ════════════

-- ─────────────────────────────────────────────
-- Joiners decide whether to restore their archived account
--
-- An archived joiner (deactivated, deleted, or no login for a long time) is
-- asked when they log in with the right password whether they want their
-- account back. Only their "yes" restores it; admins no longer restore
-- joiners. The password login does it in the auth function; this function
-- does it for Sign in with Google (the joiner is already signed in then).
--
-- Run after 20261127000000_one_tour_per_day.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.reactivate_my_account()
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
    raise exception 'Admin accounts are restored by the main admin.';
  end if;
  update public.profiles
     set archived_at = null, archive_reason = null, deactivated_at = null
   where id = auth.uid() and archived_at is not null;
end;
$$;

revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.reactivate_my_account() to authenticated;



-- ════════════ 20261129000000_feed_post_cooldown.sql ════════════

-- ─────────────────────────────────────────────
-- Joiners wait 48 hours between feed posts
--
-- A joiner can share one post, then wait 2 days (48 hours) before the next.
-- profiles.last_feed_post_at remembers the last one, so deleting a post
-- doesn't reset the wait. Admins can post any time.
--
-- Run after 20261128000000_joiner_restores_account.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists last_feed_post_at timestamptz;

create or replace function public.feed_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_next timestamptz;
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- 48 hours since their last post (even one they deleted since).
    v_last := greatest(
      (select last_feed_post_at from public.profiles where id = auth.uid()),
      (select max(created_at) from public.feed_posts where author_id = auth.uid()));
    v_next := v_last + interval '48 hours';
    if v_next is not null and v_next > now() then
      raise exception 'You can share a new post every 48 hours. You can post again on %.',
        to_char(v_next at time zone 'Asia/Manila', 'Mon DD, YYYY "at" FMHH12:MI AM');
    end if;
    update public.profiles set last_feed_post_at = now() where id = auth.uid();

    new.author_id := auth.uid();
    new.status := 'Pending';
    new.post_type := 'post';
    new.tour_id := null;
    return new;
  end if;
  raise exception 'Only Bandang IBAYO can change posts.';
end;
$$;



-- ════════════ 20261130000000_route_pickup_spots.sql ════════════

-- ─────────────────────────────────────────────
-- Pickup points along the van's route
--
-- • pickup_spots: Bandang IBAYO's saved pickup spots (name + map location).
--   Admins manage them in Tour Management → Pickup Spots.
-- • tours.route: the trip's starting point, destination and the road between
--   them ({ start, end, coords, distance_km, duration_min }). The tour form
--   lists the saved spots near that road so the admin can tick the ones on
--   the van's way.
-- • tour_meetups.lat/lng/route_order/minutes_from_start: where each pickup
--   stop is and how long the van takes to get there from the starting point,
--   so Tracking can fill in every stop's ETA from the departure time and show
--   the stops on a map.
--
-- Run after 20261129000000_feed_post_cooldown.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.pickup_spots (
  id         bigint generated by default as identity primary key,
  name       text not null check (length(btrim(name)) between 2 and 120),
  address    text,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);
create unique index if not exists pickup_spots_name_key on public.pickup_spots (lower(btrim(name)));

alter table public.pickup_spots enable row level security;
drop policy if exists "pickup_spots_read" on public.pickup_spots;
create policy "pickup_spots_read" on public.pickup_spots
  for select to authenticated using (true);
drop policy if exists "pickup_spots_admin_write" on public.pickup_spots;
create policy "pickup_spots_admin_write" on public.pickup_spots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.tours add column if not exists route jsonb;

alter table public.tour_meetups add column if not exists lat double precision;
alter table public.tour_meetups add column if not exists lng double precision;
alter table public.tour_meetups add column if not exists route_order integer;
alter table public.tour_meetups add column if not exists minutes_from_start integer;

-- The pickup spots used so far (their places can be fixed on the map later
-- in Tour Management → Pickup Spots).
insert into public.pickup_spots (name, address, lat, lng)
select v.name, v.address, v.lat, v.lng
  from (values
    ('SM Mall of Asia (MOA)', 'Seaside Blvd, Pasay, Metro Manila', 14.5352, 120.9822),
    ('Greenfield', 'McDonald''s Greenfield, EDSA cor. Shaw Blvd, Mandaluyong', 14.5826, 121.0533),
    ('Cubao', 'Araneta City, Cubao, Quezon City', 14.6206, 121.0530)
  ) as v(name, address, lat, lng)
 where not exists (select 1 from public.pickup_spots s where lower(btrim(s.name)) = lower(v.name));



-- ════════════ 20261201000000_live_van_location.sql ════════════

-- ─────────────────────────────────────────────
-- Live van location (maps step 2)
--
-- • tour_driver_links: a private link per tour for the driver's phone
--   (/driver/<token>). Admins create or reset it in Tracking Management. The
--   driver needs no account. Only admins can read the tokens.
-- • van_locations: where the van is now (one row per tour), sent by the
--   driver's phone about every 20 seconds while the trip page is open.
--   Admins and joiners booked on the tour see it (live).
-- • share_van_location(): the driver's phone sends the location; the next
--   pickup stop is set "currently here", and:
--     – about 2.5 km away: the joiners at that stop are told the van is
--       a few minutes away (once),
--     – about 250 m away: the stop is marked Arrived, they're told to board,
--       and the live feed is updated.
--   The link only works from the day before the tour until its last day.
--
-- Run after 20261130000000_route_pickup_spots.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create table if not exists public.tour_driver_links (
  tour_id    bigint primary key references public.tours(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.tour_driver_links enable row level security;
drop policy if exists "driver_links_admin" on public.tour_driver_links;
create policy "driver_links_admin" on public.tour_driver_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.van_locations (
  tour_id    bigint primary key references public.tours(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  accuracy_m double precision,
  speed_kmh  double precision,
  heading    double precision,
  updated_at timestamptz not null default now()
);
alter table public.van_locations enable row level security;
drop policy if exists "van_locations_read" on public.van_locations;
create policy "van_locations_read" on public.van_locations
  for select to authenticated using (public.is_admin() or public.has_active_booking_on_tour(tour_id));
drop policy if exists "van_locations_admin" on public.van_locations;
create policy "van_locations_admin" on public.van_locations
  for delete to authenticated using (public.is_admin());

alter table public.tour_meetups add column if not exists near_notified_at timestamptz;
alter table public.tour_meetups add column if not exists arrived_at timestamptz;

-- Live updates on the Tracking pages.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'van_locations') then
    alter publication supabase_realtime add table public.van_locations;
  end if;
end $$;

-- Straight-line distance in km.
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- ── Admins: create (or reset) a tour's driver link ──
create or replace function public.create_driver_link(p_tour_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  if not public.is_admin() then
    raise exception 'Only admins can make driver links.';
  end if;
  insert into public.tour_driver_links (tour_id, token) values (p_tour_id, v_token)
    on conflict (tour_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;
revoke all on function public.create_driver_link(bigint) from public, anon;
grant execute on function public.create_driver_link(bigint) to authenticated;

-- The tour a driver link belongs to, while the link may be used (from the
-- day before the tour until its last day, Philippine time).
create or replace function public.driver_link_tour(p_token text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.tour_driver_links l
    join public.tours t on t.id = l.tour_id
   where l.token = p_token
     and (now() at time zone 'Asia/Manila')::date between t.start_date - 1 and coalesce(t.end_date, t.start_date);
$$;
revoke all on function public.driver_link_tour(text) from public;

-- ── Driver page: the tour, its route and pickup stops ──
create or replace function public.driver_trip_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active. It works from the day before the tour until its last day. Ask Bandang IBAYO for a new link if needed.';
  end if;
  return (
    select jsonb_build_object(
      'tour', jsonb_build_object('id', t.id, 'title', t.title, 'start_date', t.start_date, 'end_date', t.end_date, 'route', t.route),
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', m.location_name, 'lat', m.lat, 'lng', m.lng, 'status', m.status,
                 'scheduled_time', m.scheduled_time, 'route_order', m.route_order)
               order by m.route_order nulls last, m.created_at)
          from public.tour_meetups m where m.tour_id = t.id), '[]'::jsonb),
      'sharing', exists (select 1 from public.van_locations v where v.tour_id = t.id))
      from public.tours t where t.id = v_tour_id);
end;
$$;
revoke all on function public.driver_trip_info(text) from public;
grant execute on function public.driver_trip_info(text) to anon, authenticated;

-- ── Driver's phone: the van's location (about every 20 seconds) ──
create or replace function public.share_van_location(
  p_token text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_speed double precision default null, p_heading double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
  v_title text;
  v_stop public.tour_meetups%rowtype;
  v_next public.tour_meetups%rowtype;
  v_km double precision;
  v_speed double precision;
  v_minutes int;
  v_plate text;
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active. It works from the day before the tour until its last day.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'The phone sent an invalid location.';
  end if;

  insert into public.van_locations (tour_id, lat, lng, accuracy_m, speed_kmh, heading, updated_at)
  values (v_tour_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, now())
  on conflict (tour_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
        speed_kmh = excluded.speed_kmh, heading = excluded.heading, updated_at = now();

  v_title := (select title from public.tours where id = v_tour_id);
  v_plate := coalesce((select nullif(plate_number, '') from public.tour_vehicles where tour_id = v_tour_id limit 1), 'Van');

  -- The next pickup stop the van hasn't reached (in driving order).
  v_stop := (select m from public.tour_meetups m
              where m.tour_id = v_tour_id and coalesce(m.status, '') <> 'ARRIVED'
              order by m.route_order nulls last, m.created_at limit 1);
  -- No stop left, or the next one isn't on the map (typed by hand): nothing automatic.
  if v_stop.id is null or v_stop.lat is null or v_stop.lng is null then
    return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name);
  end if;

  v_km := public.km_between(p_lat, p_lng, v_stop.lat, v_stop.lng);
  -- Rough minutes: the phone's speed when moving, else 30 km/h.
  v_speed := case when coalesce(p_speed, 0) >= 10 then p_speed else 30 end;
  v_minutes := greatest(1, round(v_km / v_speed * 60));

  if coalesce(v_stop.status, '') <> 'CURRENTLY HERE' then
    update public.tour_meetups set status = 'CURRENTLY HERE' where id = v_stop.id;
    insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
    values (v_tour_id, v_stop.id, v_stop.location_name, 'CURRENTLY HERE',
            format('En Route: The van is heading to [%s]. About %s min away.', v_stop.location_name, v_minutes), '');
  end if;

  if v_km <= 0.25 then
    -- Arrived: mark it, tell its joiners to board, and head for the next stop.
    update public.tour_meetups set status = 'ARRIVED', arrived_at = now() where id = v_stop.id;
    insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
    values (v_tour_id, v_stop.id, v_stop.location_name, 'ARRIVED',
            format('Arrived: Vehicle (%s) arrived at [%s]. Joiners please board now.', v_plate, v_stop.location_name), '');
    insert into public.notifications (user_id, title, message, type, related_id)
    select distinct b.user_id, 'The van is here 🚐',
           format('The van for %s is at %s now. Please board.', v_title, v_stop.location_name), 'tracking', null::uuid
      from public.bookings b
     where b.tour_id = v_tour_id and b.user_id is not null
       and lower(btrim(coalesce(b.pickup_point, ''))) = lower(btrim(v_stop.location_name))
       and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected');

    v_next := (select m from public.tour_meetups m
                where m.tour_id = v_tour_id and coalesce(m.status, '') <> 'ARRIVED'
                order by m.route_order nulls last, m.created_at limit 1);
    if v_next.id is not null then
      update public.tour_meetups set status = 'CURRENTLY HERE' where id = v_next.id;
      insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
      values (v_tour_id, v_next.id, v_next.location_name, 'CURRENTLY HERE',
              format('En Route: Heading next to [%s].', v_next.location_name), '');
    end if;
    return jsonb_build_object('ok', true, 'arrived', v_stop.location_name, 'next_stop', v_next.location_name);
  end if;

  if v_km <= 2.5 and v_stop.near_notified_at is null then
    -- A few minutes away: tell that stop's joiners to get ready (once).
    update public.tour_meetups set near_notified_at = now() where id = v_stop.id;
    insert into public.notifications (user_id, title, message, type, related_id)
    select distinct b.user_id, 'The van is almost there ⏰',
           format('The van for %s is about %s minute%s from %s. Please be ready at the pickup point.',
                  v_title, v_minutes, case when v_minutes = 1 then '' else 's' end, v_stop.location_name), 'tracking', null::uuid
      from public.bookings b
     where b.tour_id = v_tour_id and b.user_id is not null
       and lower(btrim(coalesce(b.pickup_point, ''))) = lower(btrim(v_stop.location_name))
       and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected');
  end if;

  return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name, 'km', round(v_km::numeric, 1), 'minutes', v_minutes);
end;
$$;
revoke all on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) to anon, authenticated;

-- ── Driver's phone: End Trip (the van leaves the map) ──
create or replace function public.end_van_trip(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active.';
  end if;
  if exists (select 1 from public.van_locations where tour_id = v_tour_id) then
    delete from public.van_locations where tour_id = v_tour_id;
    insert into public.tour_tracking_logs (tour_id, location_name, status, display_text, note)
    values (v_tour_id, '', 'ARRIVED', 'Trip update: The driver stopped sharing the van''s location.', '');
  end if;
end;
$$;
revoke all on function public.end_van_trip(text) from public;
grant execute on function public.end_van_trip(text) to anon, authenticated;

-- Ended tours: the van leaves the map (the daily archive job also runs this).
delete from public.van_locations v
 using public.tours t
 where t.id = v.tour_id and coalesce(t.end_date, t.start_date) < (now() at time zone 'Asia/Manila')::date;


-- ════════════ 20261202000000_auto_tracking.sql ════════════

-- ─────────────────────────────────────────────
-- Tracking runs by itself
--
-- 1. Trips that leave the night before (an itinerary with "Day 0") start on
--    the day before the tour's start date, and stops after midnight are on
--    the next day. The 15-minute pickup reminder now uses that date (it was
--    a day late for overnight trips).
-- 2. "The van hasn't started the trip": 10 minutes after the first pickup
--    time, if the driver hasn't tapped Start Trip on the driver link (and
--    nobody moved the van by hand), the admins are told once, so they can
--    send the driver link or use Manual Override. Checked every 5 minutes.
--
-- Run after 20261201000000_live_van_location.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- The day the trip really starts: the day before the start date when the
-- itinerary has a "Day 0" (travel night), else the start date.
create or replace function public.trip_start_day(p_start date, p_itinerary text)
returns date
language sql
immutable
as $$
  select case when coalesce(p_itinerary, '') ~* '(^|\n)\s*day\s*0\y' then p_start - 1 else p_start end;
$$;

-- When the van reaches a stop (Manila time): its time on the trip's first
-- day, or the next day when it's earlier than the first stop (past midnight).
create or replace function public.stop_departs_at(p_start date, p_itinerary text, p_first_time text, p_time text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_day   date := public.trip_start_day(p_start, p_itinerary);
  v_first timestamptz := public.pickup_timestamp(v_day, p_first_time);
  v_at    timestamptz := public.pickup_timestamp(v_day, p_time);
begin
  if v_at is null then return null; end if;
  if v_first is not null and v_at < v_first then v_at := v_at + interval '1 day'; end if;
  return v_at;
end;
$$;

-- The first stop's time (in the order the van reaches them).
create or replace function public.first_stop_time(p_tour_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.scheduled_time from public.tour_meetups m
   where m.tour_id = p_tour_id and btrim(coalesce(m.scheduled_time, '')) <> ''
   order by m.route_order nulls last, m.created_at, m.id
   limit 1;
$$;

-- ── 1. The 15-minute reminder, on the right day ──
create or replace function public.notify_departure_soon()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select b.id, b.user_id, b.pickup_point, t.title, d.location_name, d.scheduled_time, d.departs_at
      from public.bookings b
      join public.tours t on t.id = b.tour_id
      cross join lateral (
        select m.location_name, m.scheduled_time,
               public.stop_departs_at(t.start_date, t.itinerary, public.first_stop_time(t.id), m.scheduled_time) as departs_at
          from public.tour_meetups m
         where m.tour_id = t.id
         order by (lower(btrim(m.location_name)) = lower(btrim(coalesce(b.pickup_point, '')))) desc,
                  m.route_order nulls last, m.created_at, m.id
         limit 1
      ) d
     where b.booking_status not in ('Cancelled', 'Rejected')
       and b.payment_status = 'Complete'
       and b.user_id is not null
       and t.start_date between (now() at time zone 'Asia/Manila')::date - 1 and (now() at time zone 'Asia/Manila')::date + 1
       and d.departs_at is not null
       and now() >= d.departs_at - interval '15 minutes'
       and now() < d.departs_at
       and not exists (select 1 from public.email_log l where l.kind = 'departure-15' and l.ref = b.id::text)
  loop
    insert into public.notifications (user_id, title, message, type, related_id)
    values (
      v_row.user_id,
      'Your pickup is in 15 minutes ⏰',
      format('%s: pickup at %s at %s. Please be at the pickup point now, and open Tracking to see where the van is.',
             v_row.title, v_row.location_name, v_row.scheduled_time),
      'tracking', null
    );
    insert into public.email_log (kind, ref) values ('departure-15', v_row.id::text) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_departure_soon() from public, anon;
grant execute on function public.notify_departure_soon() to authenticated, service_role;

-- ── 2. The van hasn't started the trip ──
create or replace function public.notify_trip_not_started()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  for v_row in
    select t.id, t.title, f.location_name, f.scheduled_time,
           public.stop_departs_at(t.start_date, t.itinerary, f.scheduled_time, f.scheduled_time) as departs_at
      from public.tours t
      cross join lateral (
        select m.location_name, m.scheduled_time from public.tour_meetups m
         where m.tour_id = t.id and btrim(coalesce(m.scheduled_time, '')) <> ''
         order by m.route_order nulls last, m.created_at, m.id
         limit 1
      ) f
     where not coalesce(t.is_archived, false)
       and t.start_date between v_today - 1 and v_today + 1
  loop
    continue when v_row.departs_at is null
      or now() < v_row.departs_at + interval '10 minutes'
      or now() > v_row.departs_at + interval '3 hours';
    -- Started: the driver is sharing, or the van was moved along by hand.
    continue when exists (select 1 from public.van_locations v where v.tour_id = v_row.id);
    continue when exists (select 1 from public.tour_meetups m
                           where m.tour_id = v_row.id and m.status in ('CURRENTLY HERE', 'ARRIVED'));
    -- Nobody booked: nothing to track.
    continue when not exists (select 1 from public.bookings b
                               where b.tour_id = v_row.id and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected'));
    continue when exists (select 1 from public.email_log l where l.kind = 'trip-not-started' and l.ref = v_row.id::text);

    insert into public.notifications (user_id, title, message, type, related_id)
    select a.id, 'The van hasn''t started the trip',
           format('%s: the van was due at %s at %s, but the driver hasn''t tapped Start Trip yet. Send the Driver Link from Tracking Management, or use Manual Override there.',
                  v_row.title, v_row.location_name, v_row.scheduled_time),
           'tracking', null::uuid
      from public.profiles a where a.role = 'admin';
    insert into public.email_log (kind, ref) values ('trip-not-started', v_row.id::text) on conflict do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.notify_trip_not_started() from public, anon;
grant execute on function public.notify_trip_not_started() to authenticated, service_role;

-- Every 5 minutes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'trip-not-started';
    perform cron.schedule('trip-not-started', '2-59/5 * * * *', 'select public.notify_trip_not_started()');
  end if;
end $$;


-- ════════════ 20261203000000_reliability.sql ════════════

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


-- ════════════ 20261204000000_weather_actions.sql ════════════

-- ─────────────────────────────────────────────
-- Bad weather: postpone or cancel a tour date (main admin only)
--
-- POSTPONE: the date moves to new days. Every paid joiner has 48 hours to
--   choose: keep their slot on the new date, move to another date of the
--   same tour, or a 50% refund. No choice in 48 hours = 50% refund (the same
--   rule as a cancellation).
-- CANCEL: the date is closed (archived). Every paid joiner has 48 hours to
--   choose: move to another date of the same tour (their slot and payment
--   carry over, and they join that date's group chat), or a 50% refund.
--   Anyone who doesn't choose in time gets the 50% refund automatically.
-- Both post a pinned 📢 announcement in the tour's group chat and notify the
-- joiners. A cancelled date's group chat stays open for 7 days for
-- questions, then it's archived. Refunds are sent by Bandang IBAYO (GCash)
-- and marked "Refund sent" in Booking Management.
--
-- Run after 20261203000000_reliability.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.tours add column if not exists weather_status text;      -- 'postponed' | 'cancelled'
alter table public.tours add column if not exists weather_reason text;
alter table public.tours add column if not exists weather_note text;
alter table public.tours add column if not exists weather_at timestamptz;
alter table public.tours add column if not exists weather_old_start date;    -- the date before it was postponed
alter table public.tours add column if not exists weather_old_end date;

alter table public.bookings add column if not exists weather_choice text;   -- 'pending' | 'stayed' | 'moved' | 'refund'
alter table public.bookings add column if not exists weather_deadline timestamptz;
alter table public.bookings add column if not exists weather_prev_status text;
alter table public.bookings add column if not exists weather_from_tour text;
alter table public.bookings add column if not exists weather_refund numeric(12,2);
alter table public.bookings add column if not exists weather_refund_status text; -- 'Due' | 'Sent'
alter table public.bookings add column if not exists weather_refund_ref text;
alter table public.bookings add column if not exists weather_refund_at timestamptz;

-- 'announcement' (pinned 📢 notices) and 'system' (e.g. "Ana joined from…").
alter table public.tour_chat_messages add column if not exists kind text;

-- "Nov 10 – 11, 2026" / "Nov 10, 2026"
create or replace function public.weather_dates(p_start date, p_end date)
returns text
language sql
immutable
as $$
  select case
    when p_end is null or p_end = p_start then to_char(p_start, 'Mon FMDD, YYYY')
    when to_char(p_start, 'YYYYMM') = to_char(p_end, 'YYYYMM') then to_char(p_start, 'Mon FMDD') || ' – ' || to_char(p_end, 'FMDD, YYYY')
    else to_char(p_start, 'Mon FMDD') || ' – ' || to_char(p_end, 'Mon FMDD, YYYY')
  end;
$$;

-- A notice in the tour's group chat (sent as the admin).
create or replace function public.weather_chat_post(p_tour_id public.tours.id%type, p_body text, p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tour_chat_messages (tour_id, user_id, body, kind)
  values (p_tour_id, auth.uid(), left(p_body, 1000), p_kind);
$$;
revoke all on function public.weather_chat_post(public.tours.id%type, text, text) from public, anon, authenticated;

-- ── Postpone ──
create or replace function public.weather_postpone(
  p_tour_id public.tours.id%type, p_start date, p_end date, p_reason text, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_title text;
  v_old_start date;
  v_old_end date;
  v_status text;
  v_days integer;
  v_deadline timestamptz := now() + interval '48 hours';
  v_why text := btrim(coalesce(p_reason, '')) || case when btrim(coalesce(p_note, '')) <> '' then ' (' || btrim(p_note) || ')' else '' end;
  v_count integer;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can postpone or cancel a tour.';
  end if;
  v_title := (select title from public.tours where id = p_tour_id);
  v_old_start := (select start_date from public.tours where id = p_tour_id);
  v_old_end := (select coalesce(end_date, start_date) from public.tours where id = p_tour_id);
  v_status := (select weather_status from public.tours where id = p_tour_id);
  if v_title is null then raise exception 'Tour not found.'; end if;
  if v_status = 'cancelled' then raise exception 'This date was already cancelled.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please choose a reason.'; end if;
  if p_start is null or p_start <= v_today then raise exception 'The new date must be after today.'; end if;
  if p_end is null or p_end < p_start then raise exception 'The new end date can''t be before the start date.'; end if;
  if p_end - p_start > 6 then raise exception 'A tour can be at most 7 days long.'; end if;
  if p_start = v_old_start and p_end = v_old_end then raise exception 'Pick dates different from the current ones.'; end if;
  v_days := p_end - p_start + 1;

  -- (The one-tour-per-day rule still applies: it stops overlapping dates.)
  update public.tours
     set start_date = p_start, end_date = p_end,
         duration = v_days || case when v_days = 1 then ' Day' else ' Days' end,
         weather_status = 'postponed', weather_reason = btrim(p_reason), weather_note = nullif(btrim(coalesce(p_note, '')), ''),
         weather_at = now(),
         weather_old_start = coalesce(weather_old_start, v_old_start),
         weather_old_end = coalesce(weather_old_end, v_old_end)
   where id = p_tour_id;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Bandang IBAYO (weather postponement)', true);
  update public.bookings
     set weather_choice = 'pending', weather_deadline = v_deadline
   where tour_id = p_tour_id and payment_status = 'Complete'
     and booking_status not in ('Cancelled', 'Rejected');
  get diagnostics v_count = row_count;

  perform public.weather_chat_post(p_tour_id, format(
    E'📢 POSTPONED: %s\nReason: %s\nNew date: %s (was %s).\nPlease choose in My Bookings before %s:\n• Keep your slot on the new date (your payment and pickup point carry over),\n• Move to another date of this tour, or\n• Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund.',
    v_title, v_why, public.weather_dates(p_start, p_end), public.weather_dates(v_old_start, v_old_end),
    to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')), 'announcement');

  insert into public.notifications (user_id, title, message, type, related_id)
  select b.user_id, 'Tour postponed ⛈️ Please choose',
         format('%s (%s) is moved to %s because of %s. Choose in My Bookings before %s: keep your slot on the new date, move to another date, or a 50%% refund. No choice by then = 50%% refund.',
                v_title, b.booking_number, public.weather_dates(p_start, p_end), v_why,
                to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')),
         'booking', null::uuid
    from public.bookings b
   where b.tour_id = p_tour_id and b.weather_choice = 'pending' and b.weather_deadline = v_deadline and b.user_id is not null;

  return v_count;
end;
$$;
revoke all on function public.weather_postpone(public.tours.id%type, date, date, text, text) from public, anon;
grant execute on function public.weather_postpone(public.tours.id%type, date, date, text, text) to authenticated;

-- ── Cancel ──
create or replace function public.weather_cancel(
  p_tour_id public.tours.id%type, p_reason text, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_start date;
  v_end date;
  v_status text;
  v_deadline timestamptz := now() + interval '48 hours';
  v_why text := btrim(coalesce(p_reason, '')) || case when btrim(coalesce(p_note, '')) <> '' then ' (' || btrim(p_note) || ')' else '' end;
  v_count integer;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can postpone or cancel a tour.';
  end if;
  v_title := (select title from public.tours where id = p_tour_id);
  v_start := (select start_date from public.tours where id = p_tour_id);
  v_end := (select coalesce(end_date, start_date) from public.tours where id = p_tour_id);
  v_status := (select weather_status from public.tours where id = p_tour_id);
  if v_title is null then raise exception 'Tour not found.'; end if;
  if v_status = 'cancelled' then raise exception 'This date was already cancelled.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please choose a reason.'; end if;
  if v_end < (now() at time zone 'Asia/Manila')::date then raise exception 'This tour already ended.'; end if;

  -- People waiting for a slot: the date won't happen.
  insert into public.notifications (user_id, title, message, type, related_id)
  select w.user_id, 'Tour date cancelled ⛈️',
         format('%s on %s was cancelled because of %s, so your waitlist spot was removed. Check Explore Tours for other dates.', v_title, public.weather_dates(v_start, v_end), v_why),
         'tour', null::uuid
    from public.tour_waitlist w where w.tour_id = p_tour_id and w.user_id is not null;
  delete from public.tour_waitlist where tour_id = p_tour_id;

  update public.tours
     set weather_status = 'cancelled', weather_reason = btrim(p_reason), weather_note = nullif(btrim(coalesce(p_note, '')), ''),
         weather_at = now(), is_archived = true
   where id = p_tour_id;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Bandang IBAYO (weather cancellation)', true);
  -- Paid joiners choose what happens next; unpaid holds are simply closed.
  update public.bookings
     set weather_prev_status = booking_status, booking_status = 'Cancelled',
         cancellation_reason = 'Tour cancelled: ' || v_why,
         weather_choice = 'pending', weather_deadline = v_deadline
   where tour_id = p_tour_id and payment_status = 'Complete'
     and booking_status not in ('Cancelled', 'Rejected');
  get diagnostics v_count = row_count;
  update public.bookings
     set booking_status = 'Cancelled', cancellation_reason = 'Tour cancelled: ' || v_why
   where tour_id = p_tour_id and booking_status not in ('Cancelled', 'Rejected');

  perform public.weather_chat_post(p_tour_id, format(
    E'📢 CANCELLED: %s (%s)\nReason: %s\nWe''re sorry! Please choose in My Bookings before %s:\n• Move to another date of this tour (your slot and payment carry over), or\n• Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund. This chat stays open for 7 days for your questions.',
    v_title, public.weather_dates(v_start, v_end), v_why,
    to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')), 'announcement');

  insert into public.notifications (user_id, title, message, type, related_id)
  select b.user_id, 'Tour cancelled ⛈️ Please choose',
         format('%s (%s) on %s was cancelled because of %s. Choose in My Bookings before %s: move to another date of this tour, or a 50%% refund. No choice by then = 50%% refund.',
                v_title, b.booking_number, public.weather_dates(v_start, v_end), v_why,
                to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')),
         'booking', null::uuid
    from public.bookings b
   where b.tour_id = p_tour_id and b.weather_choice = 'pending' and b.weather_deadline = v_deadline and b.user_id is not null;

  return v_count;
end;
$$;
revoke all on function public.weather_cancel(public.tours.id%type, text, text) from public, anon;
grant execute on function public.weather_cancel(public.tours.id%type, text, text) to authenticated;

-- ── 50% refund (a joiner's choice, or the deadline passed) ──
create or replace function public.weather_set_refund(p_booking_id public.bookings.id%type, p_auto boolean)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric := (select coalesce(amount_paid, 0) from public.bookings where id = p_booking_id);
  v_amount numeric := round(coalesce(v_paid, 0) * 0.5, 2);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_name text := (select full_name from public.bookings where id = p_booking_id);
  v_title text := (select t.title from public.bookings b join public.tours t on t.id = b.tour_id where b.id = p_booking_id);
begin
  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', case when p_auto then 'Bandang IBAYO (no choice in 48 hours: 50% refund)' else 'Joiner (chose the 50% refund)' end, true);
  update public.bookings
     set weather_choice = 'refund', weather_refund = v_amount, weather_refund_status = 'Due',
         booking_status = 'Cancelled',
         cancellation_reason = coalesce(nullif(cancellation_reason, ''), 'Tour postponed') || ' · 50% refund'
   where id = p_booking_id;

  if v_user is not null then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_user, '50% refund on the way',
            format('%s (%s): %s will be refunded (50%% of the %s you paid). Bandang IBAYO will send it to your GCash and let you know.',
                   v_title, v_number, '₱' || to_char(v_amount, 'FM999,999,990.00'), '₱' || to_char(v_paid, 'FM999,999,990.00')),
            'booking', null::uuid);
  end if;
  insert into public.notifications (user_id, title, message, type, related_id)
  select a.id, 'Weather refund to send',
         format('%s (%s, %s): send a 50%% refund of %s%s. Mark it as sent in Booking Management → Weather refunds.',
                coalesce(nullif(v_name, ''), 'A joiner'), v_number, v_title, '₱' || to_char(v_amount, 'FM999,999,990.00'),
                case when p_auto then ' (no choice made in 48 hours)' else '' end),
         'booking', null::uuid
    from public.profiles a where a.role = 'admin';
  return v_amount;
end;
$$;
revoke all on function public.weather_set_refund(public.bookings.id%type, boolean) from public, anon, authenticated;

-- ── The joiner's choice ──
create or replace function public.weather_choose(
  p_booking_id public.bookings.id%type, p_choice text, p_new_tour_id public.tours.id%type default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_choice text := (select weather_choice from public.bookings where id = p_booking_id);
  v_deadline timestamptz := (select weather_deadline from public.bookings where id = p_booking_id);
  v_old_tour public.tours.id%type := (select tour_id from public.bookings where id = p_booking_id);
  v_slots integer := (select coalesce(slots_booked, 1) from public.bookings where id = p_booking_id);
  v_prev text := (select weather_prev_status from public.bookings where id = p_booking_id);
  v_status text := (select booking_status from public.bookings where id = p_booking_id);
  v_title text := (select title from public.tours where id = v_old_tour);
  v_new_title text;
  v_new_start date;
  v_new_end date;
  v_new_ok boolean;
  v_left integer;
  v_name text;
  v_amount numeric;
begin
  if v_user is null or (v_user <> auth.uid() and not public.is_admin()) then
    raise exception 'Booking not found.';
  end if;
  if v_choice is distinct from 'pending' then
    raise exception 'You already chose for this booking.';
  end if;
  if now() > v_deadline then
    raise exception 'The time to choose has passed.';
  end if;

  if p_choice = 'refund' then
    v_amount := public.weather_set_refund(p_booking_id, false);
    return jsonb_build_object('choice', 'refund', 'amount', v_amount);
  end if;

  -- Postponed: keep the slot on the new date.
  if p_choice = 'stay' then
    if coalesce((select weather_status from public.tours where id = v_old_tour), '') <> 'postponed' then
      raise exception 'This date was cancelled. Please choose another date or the refund.';
    end if;
    perform set_config('app.trusted_booking_write', 'on', true);
    update public.bookings set weather_choice = 'stayed' where id = p_booking_id;
    return jsonb_build_object('choice', 'stayed');
  end if;

  if p_choice <> 'move' then raise exception 'Unknown choice.'; end if;

  -- Another date of the same tour that's still open, with room.
  v_new_title := (select title from public.tours where id = p_new_tour_id);
  v_new_start := (select start_date from public.tours where id = p_new_tour_id);
  v_new_end := (select coalesce(end_date, start_date) from public.tours where id = p_new_tour_id);
  v_new_ok := exists (select 1 from public.tours t
                       where t.id = p_new_tour_id and t.id <> v_old_tour
                         and lower(btrim(t.title)) = lower(btrim(v_title))
                         and not coalesce(t.is_archived, false)
                         and coalesce(t.weather_status, '') <> 'cancelled'
                         and t.start_date > (now() at time zone 'Asia/Manila')::date);
  if not coalesce(v_new_ok, false) then
    raise exception 'Please pick another open date of the same tour.';
  end if;
  v_left := (select coalesce(t.group_size, 15) from public.tours t where t.id = p_new_tour_id)
          - (select coalesce(sum(b.slots_booked), 0) from public.bookings b
              where b.tour_id = p_new_tour_id and b.booking_status not in ('Cancelled', 'Rejected'))::integer;
  if v_left < v_slots then
    raise exception 'That date only has % slot(s) left.', greatest(v_left, 0);
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Joiner (moved because of the weather)', true);
  update public.bookings
     set tour_id = p_new_tour_id,
         booking_status = case when v_status = 'Cancelled' then coalesce(v_prev, 'Completed') else v_status end,
         cancellation_reason = null,
         weather_choice = 'moved', weather_from_tour = v_old_tour::text
   where id = p_booking_id;

  -- Welcome in the new date's group chat.
  v_name := (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') from public.profiles p where p.id = v_user);
  insert into public.tour_chat_messages (tour_id, user_id, body, kind)
  values (p_new_tour_id, v_user,
          format('👋 %s joined from the %s date (moved because of the weather).', coalesce(v_name, 'A joiner'),
                 public.weather_dates((select coalesce(weather_old_start, start_date) from public.tours where id = v_old_tour),
                                      (select coalesce(weather_old_end, end_date) from public.tours where id = v_old_tour))),
          'system');

  insert into public.notifications (user_id, title, message, type, related_id)
  values (v_user, 'Moved to your new date ✅',
          format('%s: you''re now booked on %s. Your slot and payment carried over, and you''re in that date''s group chat.',
                 v_title, public.weather_dates(v_new_start, v_new_end)),
          'booking', null::uuid);
  return jsonb_build_object('choice', 'moved', 'tour_id', p_new_tour_id);
end;
$$;
revoke all on function public.weather_choose(public.bookings.id%type, text, public.tours.id%type) from public, anon;
grant execute on function public.weather_choose(public.bookings.id%type, text, public.tours.id%type) to authenticated;

-- ── No choice in 48 hours: 50% refund (postponed or cancelled) ──
create or replace function public.run_weather_deadlines()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id public.bookings.id%type;
  v_count integer := 0;
begin
  for v_id in
    select b.id from public.bookings b
     where b.weather_choice = 'pending' and b.weather_deadline < now()
  loop
    perform public.weather_set_refund(v_id, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.run_weather_deadlines() from public, anon;
grant execute on function public.run_weather_deadlines() to authenticated, service_role;

-- ── The refund was sent (any admin) ──
create or replace function public.mark_weather_refund_sent(p_booking_id public.bookings.id%type, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
begin
  if not public.is_admin() then raise exception 'Only admins can do this.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Due' then
    raise exception 'This refund isn''t waiting to be sent.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_status = 'Sent', weather_refund_ref = nullif(btrim(coalesce(p_reference, '')), ''), weather_refund_at = now()
   where id = p_booking_id;
  if v_user is not null then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_user, 'Refund sent 💸',
            format('Your 50%% refund of %s for %s was sent%s.', '₱' || to_char(v_amount, 'FM999,999,990.00'), v_number,
                   case when btrim(coalesce(p_reference, '')) <> '' then ' (reference ' || btrim(p_reference) || ')' else '' end),
            'booking', null::uuid);
  end if;
end;
$$;
revoke all on function public.mark_weather_refund_sent(public.bookings.id%type, text) from public, anon;
grant execute on function public.mark_weather_refund_sent(public.bookings.id%type, text) to authenticated;

-- ── Group chat: a cancelled date's chat stays open 7 days for its joiners ──
create or replace function public.is_tour_chat_member(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.bookings b
     where b.tour_id = p_tour_id
       and b.user_id = auth.uid()
       and b.payment_status = 'Complete'
       and (
         (b.booking_status not in ('Cancelled', 'Rejected') and b.cancellation_requested_at is null)
         or (b.weather_choice in ('pending', 'refund')
             and exists (select 1 from public.tours t where t.id = b.tour_id and t.weather_status = 'cancelled'))
       )
  );
$$;

create or replace function public.tour_chat_open(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tours t
     where t.id = p_tour_id
       and case when t.weather_status = 'cancelled'
                then t.weather_at > now() - interval '7 days'
                else coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date end
  );
$$;

create or replace function public.my_tour_chats()
returns table (
  tour_id public.tours.id%type,
  title text,
  start_date date,
  end_date date,
  members integer,
  last_message text,
  last_message_at timestamptz,
  unread integer,
  is_open boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with chats as (
    select t.id, t.title, t.start_date, t.end_date, t.weather_status
      from public.tours t
     where (coalesce(t.end_date, t.start_date) + 30 >= (now() at time zone 'Asia/Manila')::date
            or (t.weather_status = 'cancelled' and t.weather_at > now() - interval '30 days'))
       and exists (
         select 1 from public.bookings b
          where b.tour_id = t.id
            and b.payment_status = 'Complete'
            and (public.is_admin() or b.user_id = auth.uid())
            and ((b.booking_status not in ('Cancelled', 'Rejected')
                  and (public.is_admin() or b.cancellation_requested_at is null))
                 or (t.weather_status = 'cancelled' and b.weather_choice in ('pending', 'refund')))
       )
  )
  select c.id, c.title, c.start_date, c.end_date,
         (select count(distinct b.user_id)::int from public.bookings b
           where b.tour_id = c.id and b.payment_status = 'Complete'
             and ((b.booking_status not in ('Cancelled', 'Rejected') and b.cancellation_requested_at is null)
                  or (c.weather_status = 'cancelled' and b.weather_choice in ('pending', 'refund')))),
         last.body, last.created_at,
         (select count(*)::int from public.tour_chat_messages m
           where m.tour_id = c.id
             and m.user_id is distinct from auth.uid()
             and m.created_at > coalesce((select r.last_read_at from public.tour_chat_reads r
                                           where r.tour_id = c.id and r.user_id = auth.uid()), '-infinity')),
         public.tour_chat_open(c.id)
    from chats c
    left join lateral (
      select m.body, m.created_at from public.tour_chat_messages m
       where m.tour_id = c.id order by m.created_at desc limit 1
    ) last on true
   order by public.tour_chat_open(c.id) desc, coalesce(last.created_at, '-infinity') desc, c.start_date asc
$$;

-- Every hour: deadlines that passed become 50% refunds.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'weather-deadlines';
    perform cron.schedule('weather-deadlines', '9 * * * *', 'select public.run_weather_deadlines()');
  end if;
end $$;


-- ════════════ 20261205000000_stricter_arrival.sql ════════════
-- ─────────────────────────────────────────────
-- Stricter "Arrived" for the driver's live location
--
-- Before: a pickup stop was marked Arrived as soon as the van was within
-- 250 m of it, so stops close together (or a rough GPS reading) were marked
-- Arrived before the van got there.
-- Now: Arrived only when the van is within 100 m of the stop's pin on two
-- location updates in a row (about 20 seconds apart), and the phone's GPS
-- reading is accurate to 60 m or better. Driving past doesn't count.
--
-- Run after 20261204000000_weather_actions.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.tour_meetups add column if not exists arrive_hits int not null default 0;

create or replace function public.share_van_location(
  p_token text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_speed double precision default null, p_heading double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tour_id bigint := public.driver_link_tour(p_token);
  v_title text;
  v_stop public.tour_meetups%rowtype;
  v_next public.tour_meetups%rowtype;
  v_km double precision;
  v_speed double precision;
  v_minutes int;
  v_plate text;
  v_hits int := 0;
begin
  if v_tour_id is null then
    raise exception 'This driver link isn''t active. It works from the day before the tour until its last day.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'The phone sent an invalid location.';
  end if;

  insert into public.van_locations (tour_id, lat, lng, accuracy_m, speed_kmh, heading, updated_at)
  values (v_tour_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, now())
  on conflict (tour_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
        speed_kmh = excluded.speed_kmh, heading = excluded.heading, updated_at = now();

  v_title := (select title from public.tours where id = v_tour_id);
  v_plate := coalesce((select nullif(plate_number, '') from public.tour_vehicles where tour_id = v_tour_id limit 1), 'Van');

  -- The next pickup stop the van hasn't reached (in driving order).
  v_stop := (select m from public.tour_meetups m
              where m.tour_id = v_tour_id and coalesce(m.status, '') <> 'ARRIVED'
              order by m.route_order nulls last, m.created_at limit 1);
  -- No stop left, or the next one isn't on the map (typed by hand): nothing automatic.
  if v_stop.id is null or v_stop.lat is null or v_stop.lng is null then
    return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name);
  end if;

  v_km := public.km_between(p_lat, p_lng, v_stop.lat, v_stop.lng);
  -- Rough minutes: the phone's speed when moving, else 30 km/h.
  v_speed := case when coalesce(p_speed, 0) >= 10 then p_speed else 30 end;
  v_minutes := greatest(1, round(v_km / v_speed * 60));

  if coalesce(v_stop.status, '') <> 'CURRENTLY HERE' then
    update public.tour_meetups set status = 'CURRENTLY HERE' where id = v_stop.id;
    insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
    values (v_tour_id, v_stop.id, v_stop.location_name, 'CURRENTLY HERE',
            format('En Route: The van is heading to [%s]. About %s min away.', v_stop.location_name, v_minutes), '');
  end if;

  -- Arrived only when the van is really there: within 100 m of the pin on
  -- two location updates in a row (about 20 seconds apart), each with a GPS
  -- reading accurate to 60 m or better. A van just driving past, or a rough
  -- first GPS fix, doesn't count.
  if v_km <= 0.1 and coalesce(p_accuracy, 0) <= 60 then
    update public.tour_meetups set arrive_hits = coalesce(arrive_hits, 0) + 1 where id = v_stop.id
    returning arrive_hits into v_hits;
  else
    if coalesce(v_stop.arrive_hits, 0) <> 0 then
      update public.tour_meetups set arrive_hits = 0 where id = v_stop.id;
    end if;
    v_hits := 0;
  end if;

  if v_hits >= 2 then
    -- Arrived: mark it, tell its joiners to board, and head for the next stop.
    update public.tour_meetups set status = 'ARRIVED', arrived_at = now() where id = v_stop.id;
    insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
    values (v_tour_id, v_stop.id, v_stop.location_name, 'ARRIVED',
            format('Arrived: Vehicle (%s) arrived at [%s]. Joiners please board now.', v_plate, v_stop.location_name), '');
    insert into public.notifications (user_id, title, message, type, related_id)
    select distinct b.user_id, 'The van is here 🚐',
           format('The van for %s is at %s now. Please board.', v_title, v_stop.location_name), 'tracking', null::uuid
      from public.bookings b
     where b.tour_id = v_tour_id and b.user_id is not null
       and lower(btrim(coalesce(b.pickup_point, ''))) = lower(btrim(v_stop.location_name))
       and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected');

    v_next := (select m from public.tour_meetups m
                where m.tour_id = v_tour_id and coalesce(m.status, '') <> 'ARRIVED'
                order by m.route_order nulls last, m.created_at limit 1);
    if v_next.id is not null then
      update public.tour_meetups set status = 'CURRENTLY HERE' where id = v_next.id;
      insert into public.tour_tracking_logs (tour_id, meetup_id, location_name, status, display_text, note)
      values (v_tour_id, v_next.id, v_next.location_name, 'CURRENTLY HERE',
              format('En Route: Heading next to [%s].', v_next.location_name), '');
    end if;
    return jsonb_build_object('ok', true, 'arrived', v_stop.location_name, 'next_stop', v_next.location_name);
  end if;

  if v_km <= 2.5 and v_stop.near_notified_at is null then
    -- A few minutes away: tell that stop's joiners to get ready (once).
    update public.tour_meetups set near_notified_at = now() where id = v_stop.id;
    insert into public.notifications (user_id, title, message, type, related_id)
    select distinct b.user_id, 'The van is almost there ⏰',
           format('The van for %s is about %s minute%s from %s. Please be ready at the pickup point.',
                  v_title, v_minutes, case when v_minutes = 1 then '' else 's' end, v_stop.location_name), 'tracking', null::uuid
      from public.bookings b
     where b.tour_id = v_tour_id and b.user_id is not null
       and lower(btrim(coalesce(b.pickup_point, ''))) = lower(btrim(v_stop.location_name))
       and coalesce(b.booking_status, '') not in ('Cancelled', 'Rejected');
  end if;

  return jsonb_build_object('ok', true, 'next_stop', v_stop.location_name, 'km', round(v_km::numeric, 2), 'minutes', v_minutes);
end;
$$;
revoke all on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.share_van_location(text, double precision, double precision, double precision, double precision, double precision) to anon, authenticated;


-- ════════════ 20261206000000_remove_place_cache.sql ════════════
-- ─────────────────────────────────────────────
-- Remove the old "places along the road" list
--
-- Pickup points are now found with the place search (OpenRouteService through
-- the routes function), not the free OpenStreetMap servers, so the saved
-- list of places along a road (route_place_cache, 20261203) isn't used.
-- 1. The nightly cleanup no longer clears it (only old website errors).
-- 2. The table is removed.
--
-- Run after 20261205000000_stricter_arrival.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cleanup-client-errors';
    perform cron.schedule('cleanup-client-errors', '25 17 * * *',
      $job$delete from public.client_errors where created_at < now() - interval '30 days'$job$);
  end if;
end $$;

drop table if exists public.route_place_cache;


-- ════════════ 20261207000000_pickup_order.sql ════════════
-- ─────────────────────────────────────────────
-- Pickup points in driving order
--
-- The list joiners choose from when booking (and in My Bookings) is now in
-- the order the van reaches the stops (route_order, set when the tour is
-- saved with its route), like the driver's page and Tracking. Stops without
-- a place on the route keep the order they were added, after the others.
--
-- Run after 20261206000000_remove_place_cache.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tour_pickup_points(p_tour_id public.tours.id%type)
returns table (location_name text, scheduled_time text)
language sql
stable
security definer
set search_path = public
as $$
  select m.location_name, m.scheduled_time::text
    from public.tour_meetups m
   where m.tour_id = p_tour_id and coalesce(btrim(m.location_name), '') <> ''
   order by m.route_order nulls last, m.created_at, m.id
$$;
revoke all on function public.tour_pickup_points from public;
grant execute on function public.tour_pickup_points to anon, authenticated;


-- ════════════ 20261208000000_admin_restore_requests.sql ════════════
-- ─────────────────────────────────────────────
-- Archived admins can ask to be restored (the main admin approves)
--
-- An archived admin who logs in with the right password is asked whether to
-- send the main admin a restore request. The main admin gets a notification,
-- and the request shows in Admin Settings → Archived Admins with Approve and
-- Decline. Only an approval makes them an admin again (still within the
-- 2-other-admins limit). Asking again while a request waits sends nothing new.
--
-- Run after 20261207000000_pickup_order.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists admin_restore_requested_at timestamptz;

-- The request itself: 'sent', 'already' (one is waiting), 'pending_code'
-- (the main admin already started a restore with an emailed code) or
-- 'not_archived'. Used by the auth function (password login) and below.
create or replace function public.request_admin_restore_for(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_requested timestamptz;
  v_pending timestamptz;
  v_name text;
begin
  v_role := (select p.role from public.profiles p where p.id = p_id);
  if v_role is distinct from 'archived_admin' then
    return 'not_archived';
  end if;
  v_requested := (select p.admin_restore_requested_at from public.profiles p where p.id = p_id);
  v_pending := (select p.admin_restore_pending_at from public.profiles p where p.id = p_id);
  if v_pending is not null then
    return 'pending_code';
  end if;
  if v_requested is not null then
    return 'already';
  end if;

  update public.profiles set admin_restore_requested_at = now() where id = p_id;
  v_name := public.admin_display_name(p_id);
  insert into public.notifications (user_id, title, message, type, related_id)
  select m.id, 'An archived admin wants to come back 🔑',
         format('%s asked to be restored as an admin. Approve or decline it in Admin Settings → Archived Admins.', coalesce(v_name, 'An archived admin')),
         'account', null::uuid
    from public.profiles m
   where m.role = 'admin' and m.is_main_admin;
  return 'sent';
end;
$$;

-- The same, for an archived admin who is signed in (Sign in with Google).
create or replace function public.request_admin_restore()
returns text
language sql
security definer
set search_path = public
as $$
  select public.request_admin_restore_for(auth.uid());
$$;

-- Main admin: approve a request → an admin again (as the kind they were).
create or replace function public.approve_admin_restore(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_main boolean;
  v_others int;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can restore admins.';
  end if;
  v_was_main := (select p.archived_was_main from public.profiles p
                  where p.id = p_id and p.role = 'archived_admin' and p.admin_restore_requested_at is not null);
  if v_was_main is null then
    raise exception 'That admin has no restore request waiting.';
  end if;
  if not v_was_main then
    v_others := (select count(*) from public.profiles p where p.role = 'admin' and not coalesce(p.is_main_admin, false));
    if v_others >= 2 then
      raise exception 'You can have at most 2 other admins. Archive one first to restore another.';
    end if;
  end if;
  update public.profiles
     set role = 'admin', is_main_admin = v_was_main, archived_was_main = false, admin_archived_at = null,
         admin_restore_pending_at = null, admin_restore_requested_at = null
   where id = p_id;
  insert into public.notifications (user_id, title, message, type, related_id)
  values (p_id, 'Welcome back 🎉', 'The main admin approved your request. Your admin account is restored.', 'account', null::uuid);
end;
$$;

-- Main admin: decline a request (they stay archived and can ask again later).
create or replace function public.decline_admin_restore(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can decline restore requests.';
  end if;
  update public.profiles set admin_restore_requested_at = null
   where id = p_id and role = 'archived_admin';
end;
$$;

-- Archiving again starts with no old request.
create or replace function public.archive_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can archive admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t archive yourself.';
  end if;
  update public.profiles
     set archived_was_main = is_main_admin, role = 'archived_admin', is_main_admin = false, admin_archived_at = now(),
         admin_restore_requested_at = null
   where id = p_id and role = 'admin';
  if not found then
    raise exception 'That account isn''t an admin.';
  end if;
end;
$$;

drop function if exists public.list_archived_admins();
create function public.list_archived_admins()
returns table (id uuid, name text, email text, was_main_admin boolean, archived_at timestamptz, pending boolean, requested_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.admin_display_name(p.id), u.email::text, p.archived_was_main, p.admin_archived_at,
         p.admin_restore_pending_at is not null, p.admin_restore_requested_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'archived_admin' and public.is_main_admin()
   order by p.admin_restore_requested_at desc nulls last, p.admin_archived_at desc;
$$;

revoke all on function public.request_admin_restore_for(uuid) from public, anon, authenticated;
revoke all on function public.request_admin_restore() from public, anon;
revoke all on function public.approve_admin_restore(uuid) from public, anon;
revoke all on function public.decline_admin_restore(uuid) from public, anon;
revoke all on function public.archive_admin(uuid) from public, anon;
revoke all on function public.list_archived_admins() from public, anon;
grant execute on function public.request_admin_restore_for(uuid) to service_role;
grant execute on function public.request_admin_restore() to authenticated;
grant execute on function public.approve_admin_restore(uuid) to authenticated;
grant execute on function public.decline_admin_restore(uuid) to authenticated;
grant execute on function public.archive_admin(uuid) to authenticated;
grant execute on function public.list_archived_admins() to authenticated;


-- ════════════ 20261209000000_refund_safety.sql ════════════
-- ─────────────────────────────────────────────
-- Safer weather refunds
--
-- 1. Only the main admin sends a refund. Other admins prepare it (how it's
--    sent; for GCash, the reference and a screenshot of the GCash receipt),
--    and the main admin approves and sends it.
-- 2. A GCash refund needs a screenshot of the GCash receipt (private bucket
--    "refund-proofs"; admins and the joiner who booked can see it).
-- 3. The joiner confirms in My Bookings: "I received it" or "I didn't get it"
--    (the main admin is told right away).
-- 4. (payments function) PayMongo tells the website when a refund finishes or
--    fails; the result is kept in weather_refund_paymongo.
-- 5. A refund history (refund_log): who did what, how much, how, the
--    reference and when. Only the main admin can read it, and nobody can
--    change or delete a row.
--
-- Run after 20261208000000_admin_restore_requests.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.bookings add column if not exists weather_refund_method text;          -- 'paymongo' | 'gcash'
alter table public.bookings add column if not exists weather_refund_proof text;           -- path in refund-proofs
alter table public.bookings add column if not exists weather_refund_prepared_by uuid;
alter table public.bookings add column if not exists weather_refund_prepared_at timestamptz;
alter table public.bookings add column if not exists weather_refund_received text;        -- 'received' | 'not_received'
alter table public.bookings add column if not exists weather_refund_received_at timestamptz;
alter table public.bookings add column if not exists weather_refund_paymongo text;        -- PayMongo's last word: pending | succeeded | failed

-- ── Refund details change only through the steps below ──
-- (Before this, any admin could edit a booking's refund straight from the
-- browser, e.g. set it to "Sent" with no money sent. The functions below and
-- the payments function are the only ways now.)
create or replace function public.bookings_guard_refund_columns()
returns trigger
language plpgsql
as $$
declare
  refund_columns constant text[] := array[
    'weather_refund', 'weather_refund_status', 'weather_refund_ref', 'weather_refund_at',
    'weather_refund_method', 'weather_refund_proof', 'weather_refund_prepared_by', 'weather_refund_prepared_at',
    'weather_refund_received', 'weather_refund_received_at', 'weather_refund_paymongo'
  ];
  c text;
begin
  if not public.is_client_request() then
    return new;
  end if;
  if coalesce(current_setting('app.trusted_booking_write', true), '') = 'on' then
    return new;
  end if;
  foreach c in array refund_columns loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'Refunds are changed only through Weather refunds in Booking Management.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists bookings_guard_refund_columns on public.bookings;
create trigger bookings_guard_refund_columns before update on public.bookings
  for each row execute function public.bookings_guard_refund_columns();

-- ── 5. Refund history ──
-- (booking_id has the same type as bookings.id, whatever it is in your database.)
do $$
begin
  execute format($t$
    create table if not exists public.refund_log (
      id bigserial primary key,
      booking_id %s,
      booking_number text,
      action text not null,       -- prepared | sent | failed | received | not_received | returned | reopened | paymongo_succeeded
      amount numeric,
      method text,                -- paymongo | gcash
      reference text,
      proof text,
      by_user uuid,
      by_name text,
      note text,
      created_at timestamptz not null default now()
    )$t$,
    (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
      where a.attrelid = 'public.bookings'::regclass and a.attname = 'id'));
end;
$$;
create index if not exists refund_log_booking_idx on public.refund_log (booking_id, created_at);
alter table public.refund_log enable row level security;

drop policy if exists "refund_log_main_admin_reads" on public.refund_log;
create policy "refund_log_main_admin_reads" on public.refund_log
  for select to authenticated using (public.is_main_admin());
-- (No insert/update/delete policies: rows are only added by the functions below.)
revoke insert, update, delete, truncate on public.refund_log from anon, authenticated;

-- Nobody changes or deletes history, not even the database's own service key.
create or replace function public.refund_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The refund history can''t be changed or deleted.';
end;
$$;
drop trigger if exists refund_log_append_only on public.refund_log;
create trigger refund_log_append_only before update or delete on public.refund_log
  for each row execute function public.refund_log_is_append_only();
drop trigger if exists refund_log_no_truncate on public.refund_log;
create trigger refund_log_no_truncate before truncate on public.refund_log
  for each statement execute function public.refund_log_is_append_only();

-- Adds a history row (used by the functions here and by the payments function).
create or replace function public.log_refund(
  p_booking_id public.bookings.id%type, p_action text, p_amount numeric default null, p_method text default null,
  p_reference text default null, p_proof text default null, p_by uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := (select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Someone')
               from public.profiles p where p.id = p_by);
  insert into public.refund_log (booking_id, booking_number, action, amount, method, reference, proof, by_user, by_name, note)
  values (p_booking_id, (select b.booking_number from public.bookings b where b.id = p_booking_id),
          p_action, p_amount, p_method, nullif(btrim(coalesce(p_reference, '')), ''), p_proof, p_by,
          case when p_by is null then 'PayMongo' else coalesce(v_name, 'Someone') end, p_note);
end;
$$;
revoke all on function public.log_refund(public.bookings.id%type, text, numeric, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.log_refund(public.bookings.id%type, text, numeric, text, text, text, uuid, text) to service_role;

-- ── 2. GCash receipt screenshots (private) ──
insert into storage.buckets (id, name, public) values ('refund-proofs', 'refund-proofs', false)
on conflict (id) do nothing;

drop policy if exists "refund_proofs_admin_upload" on storage.objects;
create policy "refund_proofs_admin_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'refund-proofs' and public.is_admin());

drop policy if exists "refund_proofs_admin_or_joiner_read" on storage.objects;
create policy "refund_proofs_admin_or_joiner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'refund-proofs'
    and (public.is_admin()
         or exists (select 1 from public.bookings b
                     where b.id::text = (storage.foldername(name))[1] and b.user_id = auth.uid()))
  );

-- ── 1. Prepare (any admin) ──
-- p_method 'paymongo': the main admin sends it through PayMongo after approving.
-- p_method 'gcash': the money was sent by GCash; the reference and the
-- screenshot (uploaded to refund-proofs/<booking id>/…) are required.
create or replace function public.prepare_weather_refund(
  p_booking_id public.bookings.id%type, p_method text, p_reference text default null, p_proof text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := (select weather_refund_status from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_paymongo text := (select paymongo_payment_id from public.bookings where id = p_booking_id);
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'Only admins can do this.'; end if;
  if v_status is distinct from 'Due' then raise exception 'This refund isn''t waiting to be sent.'; end if;
  if p_method not in ('paymongo', 'gcash') then raise exception 'Choose PayMongo or GCash.'; end if;
  if p_method = 'paymongo' and v_paymongo is null then
    raise exception 'This booking wasn''t paid through PayMongo. Send it by GCash instead.';
  end if;
  if p_method = 'gcash' then
    if v_ref is null or length(v_ref) < 6 then raise exception 'Type the GCash reference number of the refund.'; end if;
    if p_proof is null or split_part(p_proof, '/', 1) <> p_booking_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'refund-proofs' and o.name = p_proof) then
      raise exception 'Upload a screenshot of the GCash receipt first.';
    end if;
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_method = p_method,
         -- (PayMongo refund ids already there, e.g. a part refund, are kept for the record.)
         weather_refund_ref = case when p_method <> 'gcash' then weather_refund_ref
                                   when weather_refund_ref ~ 'ref_[A-Za-z0-9]+' then regexp_replace(weather_refund_ref, ' \+ GCash .*$', '') || ' + GCash ' || v_ref
                                   else 'GCash ' || v_ref end,
         weather_refund_proof = case when p_method = 'gcash' then p_proof else null end,
         weather_refund_prepared_by = auth.uid(), weather_refund_prepared_at = now()
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'prepared', v_amount, p_method, v_ref, case when p_method = 'gcash' then p_proof end, auth.uid(), null);

  -- The main admin is asked to approve (unless they prepared it themselves).
  if not public.is_main_admin() then
    insert into public.notifications (user_id, title, message, type, related_id)
    select m.id, 'A refund is waiting for your approval 💸',
           format('%s prepared the %s refund for %s (%s). Approve it in Booking Management → Weather refunds.',
                  coalesce(public.admin_display_name(auth.uid()), 'An admin'), '₱' || to_char(v_amount, 'FM999,999,990.00'), v_number,
                  case when p_method = 'gcash' then 'GCash, with receipt' else 'PayMongo' end),
           'booking', null::uuid
      from public.profiles m where m.role = 'admin' and m.is_main_admin;
  end if;
end;
$$;

-- Main admin: send a prepared refund back (e.g. a wrong screenshot) to be prepared again.
create or replace function public.return_weather_refund(p_booking_id public.bookings.id%type, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prep uuid := (select weather_refund_prepared_by from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can do this.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Due' then
    raise exception 'This refund isn''t waiting to be sent.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_method = null, weather_refund_proof = null, weather_refund_prepared_by = null, weather_refund_prepared_at = null,
         weather_refund_ref = case when weather_refund_ref ilike 'GCash %' then null else regexp_replace(weather_refund_ref, ' \+ GCash .*$', '') end
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'returned', null, null, null, null, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
  if v_prep is not null and v_prep <> auth.uid() then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_prep, 'A refund was sent back to you',
            format('The main admin sent back the refund for %s%s. Please check it and prepare it again.', v_number,
                   case when btrim(coalesce(p_note, '')) <> '' then ': ' || btrim(p_note) else '' end),
            'booking', null::uuid);
  end if;
end;
$$;

-- ── 1+2. Approve a GCash refund (main admin only; needs the receipt screenshot) ──
-- (Same name as before, so older screens still reach it; now main admin only.)
create or replace function public.mark_weather_refund_sent(p_booking_id public.bookings.id%type, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_method text := (select weather_refund_method from public.bookings where id = p_booking_id);
  v_proof text := (select weather_refund_proof from public.bookings where id = p_booking_id);
  v_ref text := (select weather_refund_ref from public.bookings where id = p_booking_id);
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can send refunds.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Due' then
    raise exception 'This refund isn''t waiting to be sent.';
  end if;
  if v_method is distinct from 'gcash' or v_proof is null then
    raise exception 'Prepare it first with the GCash reference and a screenshot of the GCash receipt.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_status = 'Sent', weather_refund_at = now(),
         weather_refund_received = null, weather_refund_received_at = null
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'sent', v_amount, 'gcash', v_ref, v_proof, auth.uid(), null);
  if v_user is not null then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_user, 'Refund sent 💸',
            format('Your 50%% refund of %s for %s was sent by GCash (%s). See the receipt in My Bookings, and tap "I received it" once it''s in your GCash.',
                   '₱' || to_char(v_amount, 'FM999,999,990.00'), v_number, coalesce(v_ref, 'GCash')),
            'booking', null::uuid);
  end if;
end;
$$;

-- ── 3. The joiner confirms ──
create or replace function public.confirm_weather_refund(p_booking_id public.bookings.id%type, p_received boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := (select user_id from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_method text := (select weather_refund_method from public.bookings where id = p_booking_id);
  v_before text := (select weather_refund_received from public.bookings where id = p_booking_id);
begin
  if v_owner is distinct from auth.uid() then raise exception 'This isn''t your booking.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Sent' then
    raise exception 'This refund hasn''t been sent yet.';
  end if;
  if v_before is not distinct from (case when p_received then 'received' else 'not_received' end) then
    return; -- already said so
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_received = case when p_received then 'received' else 'not_received' end,
         weather_refund_received_at = now()
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, case when p_received then 'received' else 'not_received' end, v_amount, v_method, null, null, auth.uid(), null);

  insert into public.notifications (user_id, title, message, type, related_id)
  select m.id,
         case when p_received then 'Refund received ✅' else 'A joiner didn''t get their refund ⚠️' end,
         case when p_received
              then format('The joiner of %s confirmed they received their %s refund.', v_number, '₱' || to_char(v_amount, 'FM999,999,990.00'))
              else format('The joiner of %s says they didn''t get their %s refund. Check the receipt or PayMongo in Booking Management → Weather refunds, and send it again if needed.',
                          v_number, '₱' || to_char(v_amount, 'FM999,999,990.00')) end,
         'booking', null::uuid
    from public.profiles m where m.role = 'admin' and m.is_main_admin;
end;
$$;

-- Main admin: a refund the joiner didn't get goes back to "to send".
-- (A PayMongo refund sent again counts what PayMongo already refunded, so
-- it's never paid twice; for GCash, check the receipt first.)
create or replace function public.reopen_weather_refund(p_booking_id public.bookings.id%type, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can do this.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Sent' then
    raise exception 'This refund isn''t marked as sent.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_status = 'Due', weather_refund_method = null, weather_refund_proof = null,
         weather_refund_prepared_by = null, weather_refund_prepared_at = null,
         weather_refund_received = null, weather_refund_received_at = null,
         weather_refund_ref = case when weather_refund_ref is null then null else weather_refund_ref || ' · reopened' end
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'reopened', null, null, null, null, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

revoke all on function public.prepare_weather_refund(public.bookings.id%type, text, text, text) from public, anon;
revoke all on function public.return_weather_refund(public.bookings.id%type, text) from public, anon;
revoke all on function public.mark_weather_refund_sent(public.bookings.id%type, text) from public, anon;
revoke all on function public.confirm_weather_refund(public.bookings.id%type, boolean) from public, anon;
revoke all on function public.reopen_weather_refund(public.bookings.id%type, text) from public, anon;
grant execute on function public.prepare_weather_refund(public.bookings.id%type, text, text, text) to authenticated;
grant execute on function public.return_weather_refund(public.bookings.id%type, text) to authenticated;
grant execute on function public.mark_weather_refund_sent(public.bookings.id%type, text) to authenticated;
grant execute on function public.confirm_weather_refund(public.bookings.id%type, boolean) to authenticated;
grant execute on function public.reopen_weather_refund(public.bookings.id%type, text) to authenticated;


-- ════════════ 20261210000000_weather_later_dates.sql ════════════
-- ─────────────────────────────────────────────
-- Bad weather: only later dates
--
-- Postponing: the new date must be after the tour's current date (never
-- before it). Moving (postponed or cancelled): joiners can only move to a
-- date of the same tour after the postponed/cancelled date.
--
-- Run after 20261209000000_refund_safety.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.weather_postpone(
  p_tour_id public.tours.id%type, p_start date, p_end date, p_reason text, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_title text;
  v_old_start date;
  v_old_end date;
  v_status text;
  v_days integer;
  v_deadline timestamptz := now() + interval '48 hours';
  v_why text := btrim(coalesce(p_reason, '')) || case when btrim(coalesce(p_note, '')) <> '' then ' (' || btrim(p_note) || ')' else '' end;
  v_count integer;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can postpone or cancel a tour.';
  end if;
  v_title := (select title from public.tours where id = p_tour_id);
  v_old_start := (select start_date from public.tours where id = p_tour_id);
  v_old_end := (select coalesce(end_date, start_date) from public.tours where id = p_tour_id);
  v_status := (select weather_status from public.tours where id = p_tour_id);
  if v_title is null then raise exception 'Tour not found.'; end if;
  if v_status = 'cancelled' then raise exception 'This date was already cancelled.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please choose a reason.'; end if;
  if p_start is null or p_start <= v_today then raise exception 'The new date must be after today.'; end if;
  -- Only later days: the new date can't be on or before this tour's date.
  if p_start <= v_old_start then
    raise exception 'The new date must be after %.', to_char(v_old_start, 'Mon FMDD, YYYY');
  end if;
  if p_end is null or p_end < p_start then raise exception 'The new end date can''t be before the start date.'; end if;
  if p_end - p_start > 6 then raise exception 'A tour can be at most 7 days long.'; end if;
  if p_start = v_old_start and p_end = v_old_end then raise exception 'Pick dates different from the current ones.'; end if;
  v_days := p_end - p_start + 1;

  -- (The one-tour-per-day rule still applies: it stops overlapping dates.)
  update public.tours
     set start_date = p_start, end_date = p_end,
         duration = v_days || case when v_days = 1 then ' Day' else ' Days' end,
         weather_status = 'postponed', weather_reason = btrim(p_reason), weather_note = nullif(btrim(coalesce(p_note, '')), ''),
         weather_at = now(),
         weather_old_start = coalesce(weather_old_start, v_old_start),
         weather_old_end = coalesce(weather_old_end, v_old_end)
   where id = p_tour_id;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Bandang IBAYO (weather postponement)', true);
  update public.bookings
     set weather_choice = 'pending', weather_deadline = v_deadline
   where tour_id = p_tour_id and payment_status = 'Complete'
     and booking_status not in ('Cancelled', 'Rejected');
  get diagnostics v_count = row_count;

  perform public.weather_chat_post(p_tour_id, format(
    E'📢 POSTPONED: %s\nReason: %s\nNew date: %s (was %s).\nPlease choose in My Bookings before %s:\n• Keep your slot on the new date (your payment and pickup point carry over),\n• Move to another date of this tour, or\n• Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund.',
    v_title, v_why, public.weather_dates(p_start, p_end), public.weather_dates(v_old_start, v_old_end),
    to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')), 'announcement');

  insert into public.notifications (user_id, title, message, type, related_id)
  select b.user_id, 'Tour postponed ⛈️ Please choose',
         format('%s (%s) is moved to %s because of %s. Choose in My Bookings before %s: keep your slot on the new date, move to another date, or a 50%% refund. No choice by then = 50%% refund.',
                v_title, b.booking_number, public.weather_dates(p_start, p_end), v_why,
                to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')),
         'booking', null::uuid
    from public.bookings b
   where b.tour_id = p_tour_id and b.weather_choice = 'pending' and b.weather_deadline = v_deadline and b.user_id is not null;

  return v_count;
end;
$$;
revoke all on function public.weather_postpone(public.tours.id%type, date, date, text, text) from public, anon;
grant execute on function public.weather_postpone(public.tours.id%type, date, date, text, text) to authenticated;

create or replace function public.weather_choose(
  p_booking_id public.bookings.id%type, p_choice text, p_new_tour_id public.tours.id%type default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_choice text := (select weather_choice from public.bookings where id = p_booking_id);
  v_deadline timestamptz := (select weather_deadline from public.bookings where id = p_booking_id);
  v_old_tour public.tours.id%type := (select tour_id from public.bookings where id = p_booking_id);
  v_slots integer := (select coalesce(slots_booked, 1) from public.bookings where id = p_booking_id);
  v_prev text := (select weather_prev_status from public.bookings where id = p_booking_id);
  v_status text := (select booking_status from public.bookings where id = p_booking_id);
  v_title text := (select title from public.tours where id = v_old_tour);
  v_new_title text;
  v_new_start date;
  v_new_end date;
  v_new_ok boolean;
  v_left integer;
  v_name text;
  v_amount numeric;
begin
  if v_user is null or (v_user <> auth.uid() and not public.is_admin()) then
    raise exception 'Booking not found.';
  end if;
  if v_choice is distinct from 'pending' then
    raise exception 'You already chose for this booking.';
  end if;
  if now() > v_deadline then
    raise exception 'The time to choose has passed.';
  end if;

  if p_choice = 'refund' then
    v_amount := public.weather_set_refund(p_booking_id, false);
    return jsonb_build_object('choice', 'refund', 'amount', v_amount);
  end if;

  -- Postponed: keep the slot on the new date.
  if p_choice = 'stay' then
    if coalesce((select weather_status from public.tours where id = v_old_tour), '') <> 'postponed' then
      raise exception 'This date was cancelled. Please choose another date or the refund.';
    end if;
    perform set_config('app.trusted_booking_write', 'on', true);
    update public.bookings set weather_choice = 'stayed' where id = p_booking_id;
    return jsonb_build_object('choice', 'stayed');
  end if;

  if p_choice <> 'move' then raise exception 'Unknown choice.'; end if;

  -- Another date of the same tour that's still open, with room.
  v_new_title := (select title from public.tours where id = p_new_tour_id);
  v_new_start := (select start_date from public.tours where id = p_new_tour_id);
  v_new_end := (select coalesce(end_date, start_date) from public.tours where id = p_new_tour_id);
  v_new_ok := exists (select 1 from public.tours t
                       where t.id = p_new_tour_id and t.id <> v_old_tour
                         and lower(btrim(t.title)) = lower(btrim(v_title))
                         and not coalesce(t.is_archived, false)
                         and coalesce(t.weather_status, '') <> 'cancelled'
                         and t.start_date > (now() at time zone 'Asia/Manila')::date
                         -- Only later dates: after the postponed/cancelled tour's own (first) date.
                         and t.start_date > (select coalesce(o.weather_old_start, o.start_date) from public.tours o where o.id = v_old_tour));
  if not coalesce(v_new_ok, false) then
    raise exception 'Please pick another open date of the same tour.';
  end if;
  v_left := (select coalesce(t.group_size, 15) from public.tours t where t.id = p_new_tour_id)
          - (select coalesce(sum(b.slots_booked), 0) from public.bookings b
              where b.tour_id = p_new_tour_id and b.booking_status not in ('Cancelled', 'Rejected'))::integer;
  if v_left < v_slots then
    raise exception 'That date only has % slot(s) left.', greatest(v_left, 0);
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Joiner (moved because of the weather)', true);
  update public.bookings
     set tour_id = p_new_tour_id,
         booking_status = case when v_status = 'Cancelled' then coalesce(v_prev, 'Completed') else v_status end,
         cancellation_reason = null,
         weather_choice = 'moved', weather_from_tour = v_old_tour::text
   where id = p_booking_id;

  -- Welcome in the new date's group chat.
  v_name := (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') from public.profiles p where p.id = v_user);
  insert into public.tour_chat_messages (tour_id, user_id, body, kind)
  values (p_new_tour_id, v_user,
          format('👋 %s joined from the %s date (moved because of the weather).', coalesce(v_name, 'A joiner'),
                 public.weather_dates((select coalesce(weather_old_start, start_date) from public.tours where id = v_old_tour),
                                      (select coalesce(weather_old_end, end_date) from public.tours where id = v_old_tour))),
          'system');

  insert into public.notifications (user_id, title, message, type, related_id)
  values (v_user, 'Moved to your new date ✅',
          format('%s: you''re now booked on %s. Your slot and payment carried over, and you''re in that date''s group chat.',
                 v_title, public.weather_dates(v_new_start, v_new_end)),
          'booking', null::uuid);
  return jsonb_build_object('choice', 'moved', 'tour_id', p_new_tour_id);
end;
$$;
revoke all on function public.weather_choose(public.bookings.id%type, text, public.tours.id%type) from public, anon;
grant execute on function public.weather_choose(public.bookings.id%type, text, public.tours.id%type) to authenticated;


-- ════════════ 20261211000000_weather_after_end.sql ════════════
-- ─────────────────────────────────────────────
-- Bad weather: later dates start after the tour's LAST day
--
-- (Replaces 20261210, which allowed the day after the first day.) For a tour
-- on Dec 14–16, the earliest new start date is Dec 17, for postponing and
-- for joiners moving to another date.
--
-- Run after 20261210000000_weather_later_dates.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.weather_postpone(
  p_tour_id public.tours.id%type, p_start date, p_end date, p_reason text, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_title text;
  v_old_start date;
  v_old_end date;
  v_status text;
  v_days integer;
  v_deadline timestamptz := now() + interval '48 hours';
  v_why text := btrim(coalesce(p_reason, '')) || case when btrim(coalesce(p_note, '')) <> '' then ' (' || btrim(p_note) || ')' else '' end;
  v_count integer;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can postpone or cancel a tour.';
  end if;
  v_title := (select title from public.tours where id = p_tour_id);
  v_old_start := (select start_date from public.tours where id = p_tour_id);
  v_old_end := (select coalesce(end_date, start_date) from public.tours where id = p_tour_id);
  v_status := (select weather_status from public.tours where id = p_tour_id);
  if v_title is null then raise exception 'Tour not found.'; end if;
  if v_status = 'cancelled' then raise exception 'This date was already cancelled.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please choose a reason.'; end if;
  if p_start is null or p_start <= v_today then raise exception 'The new date must be after today.'; end if;
  -- Only later days: the new date starts after this tour's last day.
  if p_start <= v_old_end then
    raise exception 'The new date must start after %.', to_char(v_old_end, 'Mon FMDD, YYYY');
  end if;
  if p_end is null or p_end < p_start then raise exception 'The new end date can''t be before the start date.'; end if;
  if p_end - p_start > 6 then raise exception 'A tour can be at most 7 days long.'; end if;
  if p_start = v_old_start and p_end = v_old_end then raise exception 'Pick dates different from the current ones.'; end if;
  v_days := p_end - p_start + 1;

  -- (The one-tour-per-day rule still applies: it stops overlapping dates.)
  update public.tours
     set start_date = p_start, end_date = p_end,
         duration = v_days || case when v_days = 1 then ' Day' else ' Days' end,
         weather_status = 'postponed', weather_reason = btrim(p_reason), weather_note = nullif(btrim(coalesce(p_note, '')), ''),
         weather_at = now(),
         weather_old_start = coalesce(weather_old_start, v_old_start),
         weather_old_end = coalesce(weather_old_end, v_old_end)
   where id = p_tour_id;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Bandang IBAYO (weather postponement)', true);
  update public.bookings
     set weather_choice = 'pending', weather_deadline = v_deadline
   where tour_id = p_tour_id and payment_status = 'Complete'
     and booking_status not in ('Cancelled', 'Rejected');
  get diagnostics v_count = row_count;

  perform public.weather_chat_post(p_tour_id, format(
    E'📢 POSTPONED: %s\nReason: %s\nNew date: %s (was %s).\nPlease choose in My Bookings before %s:\n• Keep your slot on the new date (your payment and pickup point carry over),\n• Move to another date of this tour, or\n• Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund.',
    v_title, v_why, public.weather_dates(p_start, p_end), public.weather_dates(v_old_start, v_old_end),
    to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')), 'announcement');

  insert into public.notifications (user_id, title, message, type, related_id)
  select b.user_id, 'Tour postponed ⛈️ Please choose',
         format('%s (%s) is moved to %s because of %s. Choose in My Bookings before %s: keep your slot on the new date, move to another date, or a 50%% refund. No choice by then = 50%% refund.',
                v_title, b.booking_number, public.weather_dates(p_start, p_end), v_why,
                to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')),
         'booking', null::uuid
    from public.bookings b
   where b.tour_id = p_tour_id and b.weather_choice = 'pending' and b.weather_deadline = v_deadline and b.user_id is not null;

  return v_count;
end;
$$;
revoke all on function public.weather_postpone(public.tours.id%type, date, date, text, text) from public, anon;
grant execute on function public.weather_postpone(public.tours.id%type, date, date, text, text) to authenticated;

create or replace function public.weather_choose(
  p_booking_id public.bookings.id%type, p_choice text, p_new_tour_id public.tours.id%type default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_choice text := (select weather_choice from public.bookings where id = p_booking_id);
  v_deadline timestamptz := (select weather_deadline from public.bookings where id = p_booking_id);
  v_old_tour public.tours.id%type := (select tour_id from public.bookings where id = p_booking_id);
  v_slots integer := (select coalesce(slots_booked, 1) from public.bookings where id = p_booking_id);
  v_prev text := (select weather_prev_status from public.bookings where id = p_booking_id);
  v_status text := (select booking_status from public.bookings where id = p_booking_id);
  v_title text := (select title from public.tours where id = v_old_tour);
  v_new_title text;
  v_new_start date;
  v_new_end date;
  v_new_ok boolean;
  v_left integer;
  v_name text;
  v_amount numeric;
begin
  if v_user is null or (v_user <> auth.uid() and not public.is_admin()) then
    raise exception 'Booking not found.';
  end if;
  if v_choice is distinct from 'pending' then
    raise exception 'You already chose for this booking.';
  end if;
  if now() > v_deadline then
    raise exception 'The time to choose has passed.';
  end if;

  if p_choice = 'refund' then
    v_amount := public.weather_set_refund(p_booking_id, false);
    return jsonb_build_object('choice', 'refund', 'amount', v_amount);
  end if;

  -- Postponed: keep the slot on the new date.
  if p_choice = 'stay' then
    if coalesce((select weather_status from public.tours where id = v_old_tour), '') <> 'postponed' then
      raise exception 'This date was cancelled. Please choose another date or the refund.';
    end if;
    perform set_config('app.trusted_booking_write', 'on', true);
    update public.bookings set weather_choice = 'stayed' where id = p_booking_id;
    return jsonb_build_object('choice', 'stayed');
  end if;

  if p_choice <> 'move' then raise exception 'Unknown choice.'; end if;

  -- Another date of the same tour that's still open, with room.
  v_new_title := (select title from public.tours where id = p_new_tour_id);
  v_new_start := (select start_date from public.tours where id = p_new_tour_id);
  v_new_end := (select coalesce(end_date, start_date) from public.tours where id = p_new_tour_id);
  v_new_ok := exists (select 1 from public.tours t
                       where t.id = p_new_tour_id and t.id <> v_old_tour
                         and lower(btrim(t.title)) = lower(btrim(v_title))
                         and not coalesce(t.is_archived, false)
                         and coalesce(t.weather_status, '') <> 'cancelled'
                         and t.start_date > (now() at time zone 'Asia/Manila')::date
                         -- Only later dates: starting after the postponed/cancelled tour's last day.
                         and t.start_date > (select coalesce(o.weather_old_end, o.end_date, o.start_date) from public.tours o where o.id = v_old_tour));
  if not coalesce(v_new_ok, false) then
    raise exception 'Please pick another open date of the same tour.';
  end if;
  v_left := (select coalesce(t.group_size, 15) from public.tours t where t.id = p_new_tour_id)
          - (select coalesce(sum(b.slots_booked), 0) from public.bookings b
              where b.tour_id = p_new_tour_id and b.booking_status not in ('Cancelled', 'Rejected'))::integer;
  if v_left < v_slots then
    raise exception 'That date only has % slot(s) left.', greatest(v_left, 0);
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Joiner (moved because of the weather)', true);
  update public.bookings
     set tour_id = p_new_tour_id,
         booking_status = case when v_status = 'Cancelled' then coalesce(v_prev, 'Completed') else v_status end,
         cancellation_reason = null,
         weather_choice = 'moved', weather_from_tour = v_old_tour::text
   where id = p_booking_id;

  -- Welcome in the new date's group chat.
  v_name := (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') from public.profiles p where p.id = v_user);
  insert into public.tour_chat_messages (tour_id, user_id, body, kind)
  values (p_new_tour_id, v_user,
          format('👋 %s joined from the %s date (moved because of the weather).', coalesce(v_name, 'A joiner'),
                 public.weather_dates((select coalesce(weather_old_start, start_date) from public.tours where id = v_old_tour),
                                      (select coalesce(weather_old_end, end_date) from public.tours where id = v_old_tour))),
          'system');

  insert into public.notifications (user_id, title, message, type, related_id)
  values (v_user, 'Moved to your new date ✅',
          format('%s: you''re now booked on %s. Your slot and payment carried over, and you''re in that date''s group chat.',
                 v_title, public.weather_dates(v_new_start, v_new_end)),
          'booking', null::uuid);
  return jsonb_build_object('choice', 'moved', 'tour_id', p_new_tour_id);
end;
$$;
revoke all on function public.weather_choose(public.bookings.id%type, text, public.tours.id%type) from public, anon;
grant execute on function public.weather_choose(public.bookings.id%type, text, public.tours.id%type) to authenticated;


-- ════════════ 20261212000000_weather_moved_from.sql ════════════
-- ─────────────────────────────────────────────
-- Bad weather: postponement notices say which dates it moved FROM
--
-- "Baguio (BK-…) is moved from Dec 14 – 16, 2026 to Dec 22 – 24, 2026 because
-- of …". (Same rules as 20261211: new dates start after the tour's last day.)
--
-- Run after 20261211000000_weather_after_end.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.weather_postpone(
  p_tour_id public.tours.id%type, p_start date, p_end date, p_reason text, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_title text;
  v_old_start date;
  v_old_end date;
  v_status text;
  v_days integer;
  v_deadline timestamptz := now() + interval '48 hours';
  v_why text := btrim(coalesce(p_reason, '')) || case when btrim(coalesce(p_note, '')) <> '' then ' (' || btrim(p_note) || ')' else '' end;
  v_count integer;
begin
  if not public.is_main_admin() then
    raise exception 'Only the main admin can postpone or cancel a tour.';
  end if;
  v_title := (select title from public.tours where id = p_tour_id);
  v_old_start := (select start_date from public.tours where id = p_tour_id);
  v_old_end := (select coalesce(end_date, start_date) from public.tours where id = p_tour_id);
  v_status := (select weather_status from public.tours where id = p_tour_id);
  if v_title is null then raise exception 'Tour not found.'; end if;
  if v_status = 'cancelled' then raise exception 'This date was already cancelled.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please choose a reason.'; end if;
  if p_start is null or p_start <= v_today then raise exception 'The new date must be after today.'; end if;
  -- Only later days: the new date starts after this tour's last day.
  if p_start <= v_old_end then
    raise exception 'The new date must start after %.', to_char(v_old_end, 'Mon FMDD, YYYY');
  end if;
  if p_end is null or p_end < p_start then raise exception 'The new end date can''t be before the start date.'; end if;
  if p_end - p_start > 6 then raise exception 'A tour can be at most 7 days long.'; end if;
  if p_start = v_old_start and p_end = v_old_end then raise exception 'Pick dates different from the current ones.'; end if;
  v_days := p_end - p_start + 1;

  -- (The one-tour-per-day rule still applies: it stops overlapping dates.)
  update public.tours
     set start_date = p_start, end_date = p_end,
         duration = v_days || case when v_days = 1 then ' Day' else ' Days' end,
         weather_status = 'postponed', weather_reason = btrim(p_reason), weather_note = nullif(btrim(coalesce(p_note, '')), ''),
         weather_at = now(),
         weather_old_start = coalesce(weather_old_start, v_old_start),
         weather_old_end = coalesce(weather_old_end, v_old_end)
   where id = p_tour_id;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.actor_name', 'Bandang IBAYO (weather postponement)', true);
  update public.bookings
     set weather_choice = 'pending', weather_deadline = v_deadline
   where tour_id = p_tour_id and payment_status = 'Complete'
     and booking_status not in ('Cancelled', 'Rejected');
  get diagnostics v_count = row_count;

  perform public.weather_chat_post(p_tour_id, format(
    E'📢 POSTPONED: %s\nReason: %s\nNew date: %s (was %s).\nPlease choose in My Bookings before %s:\n• Keep your slot on the new date (your payment and pickup point carry over),\n• Move to another date of this tour, or\n• Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund.',
    v_title, v_why, public.weather_dates(p_start, p_end), public.weather_dates(v_old_start, v_old_end),
    to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')), 'announcement');

  insert into public.notifications (user_id, title, message, type, related_id)
  select b.user_id, 'Tour postponed ⛈️ Please choose',
         format('%s (%s) is moved from %s to %s because of %s. Choose in My Bookings before %s: keep your slot on the new date, move to another date, or a 50%% refund. No choice by then = 50%% refund.',
                v_title, b.booking_number, public.weather_dates(v_old_start, v_old_end), public.weather_dates(p_start, p_end), v_why,
                to_char(v_deadline at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM')),
         'booking', null::uuid
    from public.bookings b
   where b.tour_id = p_tour_id and b.weather_choice = 'pending' and b.weather_deadline = v_deadline and b.user_id is not null;

  return v_count;
end;
$$;
revoke all on function public.weather_postpone(public.tours.id%type, date, date, text, text) from public, anon;
grant execute on function public.weather_postpone(public.tours.id%type, date, date, text, text) to authenticated;



-- ════════════ 20261213000000_exclusive_flow.sql ════════════
-- ─────────────────────────────────────────────
-- Exclusive tours: new flow, and connected to the rest of the site
--
-- 1. Rules for requests (Exclusive and Request a Tour):
--    • one request every 2 weeks per joiner (both kinds together);
--    • an exclusive tour budget is ₱30,000 to ₱100,000.
-- 2. Approving an exclusive tour asks the joiner for the downpayment right
--    away: 50% of their budget, due within 24 hours
--    (exclusive_requests.downpayment_due_at). The tour package can only be
--    sent after it's paid. Not paid in time = the joiner didn't continue (the
--    admin sees these as "Unpaid"). Paid requests are never rejected
--    automatically for a late package.
-- 3. Once the package is sent (and paid), the exclusive tour gets a private
--    tour date (tours.is_exclusive) and a booking for the joiner, so it shows
--    in My Bookings and works with the group chat (joiner + admins), Tracking,
--    the Calendar, check-in and bad-weather postpone/cancel. Only admins and
--    the joiner who booked it can see that date.
--    Payments stay on the exclusive request; the booking follows them.
--
-- Run after 20261212000000_weather_moved_from.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists downpayment_due_at timestamptz;
alter table public.tours add column if not exists is_exclusive boolean not null default false;

-- tours.exclusive_request_id: the same type as exclusive_requests.id.
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.tours'::regclass and attname = 'exclusive_request_id' and not attisdropped) then
    execute format('alter table public.tours add column exclusive_request_id %s',
      (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
        where a.attrelid = 'public.exclusive_requests'::regclass and a.attname = 'id'));
  end if;
end;
$$;

-- ── 1 + 2. Request rules ──
create or replace function public.exclusive_requests_flow_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  -- One request every 2 weeks (Exclusive and Request a Tour together).
  if tg_op = 'INSERT' and new.user_id is not null and not public.is_admin() then
    v_last := (select max(r.created_at) from public.exclusive_requests r where r.user_id = new.user_id);
    if v_last is not null and v_last > now() - interval '14 days' then
      raise exception 'You can send one request every 2 weeks. You can send your next request on %.',
        to_char((v_last + interval '14 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY "at" FMHH12:MI AM');
    end if;
  end if;

  -- Exclusive tour budget: ₱30,000 to ₱100,000.
  if new.request_type = 'exclusive' and new.budget is not null
     and (tg_op = 'INSERT' or new.budget is distinct from old.budget) then
    if new.budget < 30000 then raise exception 'The budget for an exclusive tour must be at least ₱30,000.'; end if;
    if new.budget > 100000 then raise exception 'The budget for an exclusive tour can be up to ₱100,000.'; end if;
  end if;

  if tg_op = 'UPDATE' and new.request_type = 'exclusive' then
    -- Approved: the downpayment (50% of the budget) is due within 24 hours.
    if new.status = 'Approved' and old.status is distinct from 'Approved' and new.payment_status <> 'Paid' then
      new.downpayment_due_at := now() + interval '24 hours';
      if new.budget is not null then
        new.downpayment_amount := round(new.budget * 0.5, 2);
      end if;
    end if;
    -- The package waits for the downpayment.
    if new.package_sent_at is not null and old.package_sent_at is null
       and new.downpayment_due_at is not null and new.payment_status <> 'Paid' then
      raise exception 'Wait for the joiner''s downpayment before sending the tour package.';
    end if;
    -- The package price can't be less than what the joiner already paid.
    if new.package_sent_at is not null and new.payment_status = 'Paid'
       and coalesce((new.package_details ->> 'price')::numeric, 0) > 0
       and (new.package_details ->> 'price')::numeric < coalesce(new.amount_paid, 0) then
      raise exception 'The package price can''t be less than the ₱% the joiner already paid.', to_char(new.amount_paid, 'FM999,999,990.00');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_flow_rules on public.exclusive_requests;
create trigger exclusive_requests_flow_rules
  before insert or update on public.exclusive_requests
  for each row execute function public.exclusive_requests_flow_rules();

-- Paid requests are never rejected for a late package (the admin sends it).
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
       and coalesce(r.payment_status, 'Unpaid') <> 'Paid'
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

-- ── 3. Private exclusive tour dates ──
-- Only admins and the joiner who booked it can see an exclusive tour date.
create or replace function public.booked_this_tour(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings b where b.tour_id = p_tour_id and b.user_id = auth.uid());
$$;
revoke all on function public.booked_this_tour(public.tours.id%type) from public;
grant execute on function public.booked_this_tour(public.tours.id%type) to anon, authenticated;

drop policy if exists "tours_hide_exclusive" on public.tours;
create policy "tours_hide_exclusive" on public.tours as restrictive
  for select
  using (not coalesce(is_exclusive, false) or public.is_admin() or public.booked_this_tour(id));

-- The joiner's booking for their exclusive tour (made or updated when the
-- package is sent). Payments stay on the request; the booking follows them.
create or replace function public.exclusive_make_booking(
  p_request_id public.exclusive_requests.id%type, p_tour_id public.tours.id%type)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.exclusive_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_name text;
  v_email text;
  v_phone text;
  v_slots integer;
  v_companions jsonb;
  v_price numeric;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.'; end if;
  r := (select x from public.exclusive_requests x where x.id = p_request_id);
  if r.id is null or r.request_type <> 'exclusive' then raise exception 'Exclusive request not found.'; end if;
  if r.payment_status <> 'Paid' then raise exception 'The joiner hasn''t paid the downpayment yet.'; end if;
  if not exists (select 1 from public.tours t where t.id = p_tour_id and t.is_exclusive) then
    raise exception 'That isn''t this exclusive tour''s date.';
  end if;
  update public.tours set exclusive_request_id = p_request_id where id = p_tour_id;

  v_price := coalesce((r.package_details ->> 'price')::numeric, 0);
  v_slots := greatest(coalesce(r.group_size, 1), 1);
  v_name := (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') from public.profiles p where p.id = r.user_id);
  v_phone := (select nullif(btrim(p.phone_number), '') from public.profiles p where p.id = r.user_id);
  v_email := (select u.email::text from auth.users u where u.id = r.user_id);
  v_companions := (select coalesce(jsonb_agg(jsonb_build_object(
                      'full_name', left(btrim(p ->> 'full_name'), 120),
                      'contact_number', left(btrim(coalesce(p ->> 'contact_number', '')), 40)) order by n), '[]'::jsonb)
                     from jsonb_array_elements(coalesce(r.participants, '[]'::jsonb)) with ordinality as x(p, n)
                    where n > 1 and nullif(btrim(p ->> 'full_name'), '') is not null);

  perform set_config('app.trusted_booking_write', 'on', true);
  v_booking := (select b from public.bookings b where b.request_id = p_request_id order by b.created_at desc limit 1);
  if v_booking.id is null then
    insert into public.bookings (
      tour_id, user_id, request_id, booking_number, full_name, email, contact_number,
      slots_booked, total_price, amount_paid, payment_method, companions,
      payment_status, booking_status, accommodation, balance_settled
    ) values (
      p_tour_id, r.user_id, p_request_id,
      'BK-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0'),
      coalesce(v_name, nullif(btrim(r.full_name), ''), 'N/A'),
      coalesce(v_email, nullif(btrim(r.email), ''), 'N/A'),
      coalesce(v_phone, nullif(btrim(r.contact_number), ''), 'N/A'),
      v_slots, v_price, coalesce(r.amount_paid, 0), 'Downpayment', v_companions,
      'Complete', 'Completed', r.accommodation, coalesce(r.balance_settled, false)
    ) returning * into v_booking;
  else
    update public.bookings
       set tour_id = p_tour_id, total_price = v_price, amount_paid = coalesce(r.amount_paid, 0),
           slots_booked = v_slots, accommodation = r.accommodation, balance_settled = coalesce(r.balance_settled, false)
     where id = v_booking.id
    returning * into v_booking;
  end if;
  perform set_config('app.trusted_booking_write', 'off', true);
  return v_booking;
end;
$$;
revoke all on function public.exclusive_make_booking(public.exclusive_requests.id%type, public.tours.id%type) from public, anon;
grant execute on function public.exclusive_make_booking(public.exclusive_requests.id%type, public.tours.id%type) to authenticated;

-- Payments on the request (balance paid online or recorded by an admin, the
-- accommodation chosen) carry over to its booking.
create or replace function public.exclusive_requests_sync_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_type <> 'exclusive' then return new; end if;
  if new.amount_paid is distinct from old.amount_paid or new.balance_settled is distinct from old.balance_settled
     or new.accommodation is distinct from old.accommodation then
    perform set_config('app.trusted_booking_write', 'on', true);
    update public.bookings b
       set amount_paid = coalesce(new.amount_paid, b.amount_paid),
           balance_settled = coalesce(new.balance_settled, false),
           accommodation = coalesce(new.accommodation, b.accommodation)
     where b.request_id = new.id
       and exists (select 1 from public.tours t where t.id = b.tour_id and t.is_exclusive);
    perform set_config('app.trusted_booking_write', 'off', true);
  end if;
  return new;
end;
$$;
drop trigger if exists exclusive_requests_sync_booking on public.exclusive_requests;
create trigger exclusive_requests_sync_booking
  after update on public.exclusive_requests
  for each row execute function public.exclusive_requests_sync_booking();

-- A postponed exclusive tour: its package shows the new dates too.
create or replace function public.tours_sync_exclusive_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_exclusive and new.exclusive_request_id is not null
     and (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date) then
    perform set_config('app.joiner_request_edit', 'on', true);
    update public.exclusive_requests
       set package_details = coalesce(package_details, '{}'::jsonb)
             || jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date)
     where id = new.exclusive_request_id;
    perform set_config('app.joiner_request_edit', 'off', true);
  end if;
  return new;
end;
$$;
drop trigger if exists tours_sync_exclusive_dates on public.tours;
create trigger tours_sync_exclusive_dates
  after update of start_date, end_date on public.tours
  for each row execute function public.tours_sync_exclusive_dates();


commit;
