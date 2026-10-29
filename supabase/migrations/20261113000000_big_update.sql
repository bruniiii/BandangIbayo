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
