-- ─────────────────────────────────────────────
-- System Maintenance → Booking Rules
--
-- One settings table (public.booking_rules, a single row) now holds the
-- business rules that used to be typed into the code: cancellation cutoff,
-- downpayment, payment hold, weather refund, private tour limits, rate
-- limits and so on. The website, the database functions and the Edge
-- Functions all read from it.
--
--   • Seeded with the values the code used, so nothing changes on install.
--   • All admins can see the rules; only the main admin can change them
--     (enforced here with public.is_main_admin(), not only in the page).
--   • Joiners never read the table itself: they get the rules they need
--     through public.get_booking_rules().
--   • A changed rule applies to NEW bookings only: each booking remembers
--     the cancellation cutoff, downpayment and weather refund it was made
--     under. Existing bookings keep the old values.
--   • Every change is written to the activity log by a trigger.
--
-- Run after 20261221000000_system_maintenance.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. The settings table (always exactly one row) ──
create table if not exists public.booking_rules (
  id smallint primary key default 1 check (id = 1),

  -- Bookings
  cancellation_cutoff_days       integer not null default 14  check (cancellation_cutoff_days between 0 and 365),
  cancellation_approval_hours    integer not null default 12  check (cancellation_approval_hours between 1 and 720),
  downpayment_percent            numeric not null default 50  check (downpayment_percent between 1 and 100),
  payment_hold_minutes           integer not null default 30  check (payment_hold_minutes between 5 and 1440),
  requested_hold_hours           integer not null default 48  check (requested_hold_hours between 1 and 720),
  sale_discount_percent          numeric not null default 5   check (sale_discount_percent between 0 and 100),

  -- Weather
  weather_refund_percent         numeric not null default 50  check (weather_refund_percent between 0 and 100),
  weather_choice_hours           integer not null default 48  check (weather_choice_hours between 1 and 720),

  -- Reminders
  reminder_lead_days             integer not null default 1   check (reminder_lead_days between 1 and 30),
  balance_reminder_days          integer not null default 3   check (balance_reminder_days between 1 and 60),

  -- Private tours and tour requests
  private_downpayment_percent    numeric not null default 50  check (private_downpayment_percent between 1 and 100),
  private_downpayment_due_hours  integer not null default 24  check (private_downpayment_due_hours between 1 and 720),
  private_budget_min             numeric not null default 3000   check (private_budget_min >= 0),
  private_budget_max             numeric not null default 100000 check (private_budget_max >= 0),
  request_lead_days              integer not null default 21  check (request_lead_days between 0 and 365),
  request_approval_cutoff_days   integer not null default 14  check (request_approval_cutoff_days between 0 and 365),
  request_review_days            integer not null default 30  check (request_review_days between 1 and 365),
  request_gap_days               integer not null default 14  check (request_gap_days between 0 and 365),

  -- Tour rates
  regular_rate_min               numeric not null default 1300 check (regular_rate_min >= 0),
  regular_rate_max               numeric not null default 7500 check (regular_rate_max >= 0),
  joiner_rate_min                numeric not null default 1800 check (joiner_rate_min >= 0),
  joiner_rate_max                numeric not null default 7500 check (joiner_rate_max >= 0),
  joiner_rate_margin             numeric not null default 500  check (joiner_rate_margin >= 0),

  -- Tours
  tour_lead_days                 integer not null default 21  check (tour_lead_days between 0 and 365),
  max_tour_days                  integer not null default 7   check (max_tour_days between 1 and 60),
  max_tour_slots                 integer not null default 14  check (max_tour_slots between 1 and 500),
  van_seats                      integer not null default 14  check (van_seats between 1 and 100),
  max_vans                       integer not null default 5   check (max_vans between 1 and 50),

  -- Tour expenses
  van_rent_min                   numeric not null default 15000 check (van_rent_min >= 0),
  van_rent_max                   numeric not null default 30000 check (van_rent_max >= 0),
  tour_guide_min                 numeric not null default 1300  check (tour_guide_min >= 0),
  tour_guide_max                 numeric not null default 2000  check (tour_guide_max >= 0),
  bag_tag_fee                    numeric not null default 260   check (bag_tag_fee >= 0),

  updated_at timestamptz not null default now(),

  constraint booking_rules_private_budget_range check (private_budget_min <= private_budget_max),
  constraint booking_rules_regular_rate_range   check (regular_rate_min <= regular_rate_max),
  constraint booking_rules_joiner_rate_range    check (joiner_rate_min <= joiner_rate_max),
  constraint booking_rules_van_rent_range       check (van_rent_min <= van_rent_max),
  constraint booking_rules_tour_guide_range     check (tour_guide_min <= tour_guide_max),
  constraint booking_rules_request_days         check (request_approval_cutoff_days <= request_lead_days)
);

alter table public.booking_rules add column if not exists tour_lead_days integer not null default 21 check (tour_lead_days between 0 and 365);

-- The current hard-coded values (the column defaults).
insert into public.booking_rules (id) values (1) on conflict (id) do nothing;

-- ── 2. Who can do what ──
alter table public.booking_rules enable row level security;
revoke all on public.booking_rules from anon, authenticated;
grant select, update on public.booking_rules to authenticated;

drop policy if exists "booking_rules_admin_read" on public.booking_rules;
create policy "booking_rules_admin_read" on public.booking_rules
  for select to authenticated using (public.is_admin());

drop policy if exists "booking_rules_main_admin_update" on public.booking_rules;
create policy "booking_rules_main_admin_update" on public.booking_rules
  for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
-- No insert or delete policy: the one row can never be added to or removed.

create or replace function public.booking_rules_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'The booking rules can''t be deleted.';
  end if;
  if public.is_client_request() and not public.is_main_admin() then
    raise exception 'Only the main admin can change the booking rules.';
  end if;
  new.id := 1;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists booking_rules_touch on public.booking_rules;
create trigger booking_rules_touch before update or delete on public.booking_rules
  for each row execute function public.booking_rules_touch();

-- Every change goes to the activity log (who, when, old and new values).
do $$
begin
  if to_regprocedure('public.log_admin_activity()') is not null then
    drop trigger if exists booking_rules_admin_activity on public.booking_rules;
    create trigger booking_rules_admin_activity after insert or update or delete on public.booking_rules
      for each row execute function public.log_admin_activity();
  end if;
end;
$$;

-- ── 3. Reading a rule ──
-- Used inside the database functions. An unknown name is an error, so a typo
-- can never quietly switch a rule off.
create or replace function public.rule_num(p_key text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  select (to_jsonb(r) ->> p_key)::numeric into v from public.booking_rules r where r.id = 1;
  if v is null or p_key in ('id', 'updated_at') then
    raise exception 'Unknown booking rule: %', p_key;
  end if;
  return v;
end;
$$;

create or replace function public.rule_int(p_key text)
returns integer
language sql
stable
set search_path = public
as $$ select public.rule_num(p_key)::integer $$;

-- For messages: 3000 → '3,000', 12.5 → '12.5', 50 → '50'.
create or replace function public.rule_money(p_key text)
returns text
language sql
stable
set search_path = public
as $$ select rtrim(rtrim(to_char(public.rule_num(p_key), 'FM999,999,990.99'), '0'), '.') $$;

create or replace function public.rule_text(p_value numeric)
returns text
language sql
immutable
as $$ select rtrim(rtrim(to_char(p_value, 'FM999990.99'), '0'), '.') $$;

-- What the website and the Edge Functions read (joiners included): the
-- rules as one object. The table itself stays admin-only.
create or replace function public.get_booking_rules()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select to_jsonb(r) - 'id' from public.booking_rules r where r.id = 1 $$;

revoke all on function public.rule_num(text) from public;
revoke all on function public.rule_int(text) from public;
revoke all on function public.rule_money(text) from public;
revoke all on function public.get_booking_rules() from public;
grant execute on function public.rule_num(text) to anon, authenticated, service_role;
grant execute on function public.rule_int(text) to anon, authenticated, service_role;
grant execute on function public.rule_money(text) to anon, authenticated, service_role;
grant execute on function public.get_booking_rules() to anon, authenticated, service_role;

-- The four rule functions that already existed now read the table.
create or replace function public.cancellation_cutoff_days()
returns integer language sql stable set search_path = public
as $$ select public.rule_int('cancellation_cutoff_days') $$;

create or replace function public.cancellation_approval_hours()
returns integer language sql stable set search_path = public
as $$ select public.rule_int('cancellation_approval_hours') $$;

create or replace function public.requested_tour_hold_hours()
returns integer language sql stable set search_path = public
as $$ select public.rule_int('requested_hold_hours') $$;

create or replace function public.tour_sale_discount()
returns numeric language sql stable set search_path = public
as $$ select public.rule_num('sale_discount_percent') / 100.0 $$;

-- ── 4. Each booking remembers the rules it was made under ──
-- Bookings made before this update keep the old rules: the three columns are
-- added already filled with the values the code used until now. New bookings
-- get today's rules from the trigger below.
alter table public.bookings add column if not exists rule_cancel_days integer default 14;
alter table public.bookings add column if not exists rule_downpayment_percent numeric default 50;
alter table public.bookings add column if not exists rule_weather_refund_percent numeric default 50;
alter table public.bookings alter column rule_cancel_days drop default;
alter table public.bookings alter column rule_downpayment_percent drop default;
alter table public.bookings alter column rule_weather_refund_percent drop default;

create or replace function public.bookings_remember_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.rule_cancel_days := public.rule_int('cancellation_cutoff_days');
    new.rule_downpayment_percent := public.rule_num('downpayment_percent');
    new.rule_weather_refund_percent := public.rule_num('weather_refund_percent');
  else
    -- Once set, they never change (not by a joiner, an admin or a rule change).
    new.rule_cancel_days := coalesce(old.rule_cancel_days, new.rule_cancel_days);
    new.rule_downpayment_percent := coalesce(old.rule_downpayment_percent, new.rule_downpayment_percent);
    new.rule_weather_refund_percent := coalesce(old.rule_weather_refund_percent, new.rule_weather_refund_percent);
  end if;
  return new;
end;
$$;
drop trigger if exists a_bookings_remember_rules on public.bookings;
create trigger a_bookings_remember_rules before insert or update on public.bookings
  for each row execute function public.bookings_remember_rules();

-- The rules of one booking (falls back to today's rules).
create or replace function public.booking_cancel_days(p_booking_id public.bookings.id%type)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select b.rule_cancel_days from public.bookings b where b.id = p_booking_id),
                  public.rule_int('cancellation_cutoff_days'))
$$;

create or replace function public.booking_downpayment_percent(p_booking_id public.bookings.id%type)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select b.rule_downpayment_percent from public.bookings b where b.id = p_booking_id),
                  public.rule_num('downpayment_percent'))
$$;

create or replace function public.booking_weather_rate(p_booking_id public.bookings.id%type)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select b.rule_weather_refund_percent from public.bookings b where b.id = p_booking_id),
                  public.rule_num('weather_refund_percent')) / 100.0
$$;

-- For messages: '50'.
create or replace function public.booking_weather_pct(p_booking_id public.bookings.id%type)
returns text
language sql
stable
security definer
set search_path = public
as $$ select public.rule_text(public.booking_weather_rate(p_booking_id) * 100) $$;

-- For the announcement in a tour's group chat: the refund of the bookings
-- still waiting to choose ('50', or '40–50' when they were booked under
-- different rules).
create or replace function public.tour_weather_pct(p_tour_id public.tours.id%type)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when min(p) is null then public.rule_text(public.rule_num('weather_refund_percent'))
           when min(p) = max(p) then public.rule_text(min(p))
           else public.rule_text(min(p)) || '–' || public.rule_text(max(p))
         end
    from (select coalesce(b.rule_weather_refund_percent, public.rule_num('weather_refund_percent')) as p
            from public.bookings b
           where b.tour_id = p_tour_id and b.weather_choice = 'pending') x
$$;

revoke all on function public.booking_cancel_days from public;
revoke all on function public.booking_downpayment_percent from public;
revoke all on function public.booking_weather_rate from public;
revoke all on function public.booking_weather_pct from public;
revoke all on function public.tour_weather_pct from public;
grant execute on function public.booking_cancel_days to authenticated, service_role;
grant execute on function public.booking_downpayment_percent to authenticated, service_role;
grant execute on function public.booking_weather_rate to authenticated, service_role;
grant execute on function public.booking_weather_pct to authenticated, service_role;
grant execute on function public.tour_weather_pct to authenticated, service_role;

-- ── 5. Swap the hard-coded values inside the existing functions ──
-- Each line below is: function, the hard-coded text, what replaces it.
-- Nothing else in those functions is touched (payments, seat checks and
-- check-in work exactly as before). Lines already swapped are skipped.
do $do$
declare
  s    record;
  f    record;
  def  text;
  fixed text;
begin
  for s in
    select * from (values
      -- Cancellation cutoff: the booking's own remembered value
      (10, 'cancel_my_booking', false, $q$public.cancellation_cutoff_days()$q$, $q$public.booking_cancel_days(p_booking_id)$q$),
      (11, 'reschedule_booking', false, $q$public.cancellation_cutoff_days()$q$, $q$public.booking_cancel_days(p_booking_id)$q$),
      (12, 'bookings_guard_joiner_update', false, $q$public.cancellation_cutoff_days()$q$, $q$public.booking_cancel_days(old.id)$q$),

      -- Payment hold and the smallest downpayment accepted
      (20, 'start_online_booking', false, $q$now() + interval '30 minutes'$q$, $q$now() + make_interval(mins => public.rule_int('payment_hold_minutes'))$q$),
      (21, 'record_online_payment', false, $q$coalesce(v_b.total_price, 0) * 0.4, 2)$q$, $q$coalesce(v_b.total_price, 0) * least(0.4, public.booking_downpayment_percent(v_b.id) / 100.0), 2)$q$),

      -- Private tours and tour requests
      (30, 'exclusive_requests_flow_rules', false, $q$interval '14 days'$q$, $q$make_interval(days => public.rule_int('request_gap_days'))$q$),
      (31, 'exclusive_requests_flow_rules', false, $q$'You can send one request every 2 weeks. You can send your next request on %.',$q$, $q$'You can send one request every % days. You can send your next request on %.', public.rule_int('request_gap_days'),$q$),
      (32, 'exclusive_requests_flow_rules', true, $q$new\.budget < 3000 then raise exception '([^']*)₱3,000\.';$q$, $q$new.budget < public.rule_num('private_budget_min') then raise exception '\1₱%.', public.rule_money('private_budget_min');$q$),
      (33, 'exclusive_requests_flow_rules', true, $q$new\.budget > 100000 then raise exception '([^']*)₱100,000\.';$q$, $q$new.budget > public.rule_num('private_budget_max') then raise exception '\1₱%.', public.rule_money('private_budget_max');$q$),
      (34, 'exclusive_requests_flow_rules', false, $q$interval '24 hours'$q$, $q$make_interval(hours => public.rule_int('private_downpayment_due_hours'))$q$),
      (35, 'exclusive_requests_flow_rules', false, $q$new.budget * 0.5$q$, $q$new.budget * public.rule_num('private_downpayment_percent') / 100.0$q$),
      (36, 'exclusive_requests_guard_approval', false, $q$::date + 14 then$q$, $q$::date + public.rule_int('request_approval_cutoff_days') then$q$),
      (37, 'exclusive_requests_guard_approval', false, $q$at least 2 weeks before the preferred date.';$q$, $q$at least % days before the preferred date.', public.rule_int('request_approval_cutoff_days');$q$),
      (38, 'reject_overdue_requests', false, $q$::date + 14$q$, $q$::date + public.rule_int('request_approval_cutoff_days')$q$),
      (39, 'reject_overdue_requests', false, $q$ready at least 2 weeks before the trip date.'$q$, $q$ready at least ' || public.rule_int('request_approval_cutoff_days') || ' days before the trip date.'$q$),
      (40, 'reject_overdue_requests', false, $q$ready within 1 month of the request.'$q$, $q$ready within ' || public.rule_int('request_review_days') || ' days of the request.'$q$),
      (41, 'reject_overdue_requests', false, $q$interval '30 days'$q$, $q$make_interval(days => public.rule_int('request_review_days'))$q$),
      (42, 'update_my_request', false, $q$::date + 21 then$q$, $q$::date + public.rule_int('request_lead_days') then$q$),
      (43, 'update_my_request', false, $q$'Trips can be booked from 3 weeks ahead. Please pick a later date.';$q$, $q$'Trips can be booked from % days ahead. Please pick a later date.', public.rule_int('request_lead_days');$q$),
      (44, 'exclusive_requests_check_request', false, $q$+ 1 > 7 then$q$, $q$+ 1 > public.rule_int('max_tour_days') then$q$),
      (45, 'exclusive_requests_check_request', false, $q$'A trip can be at most 1 week (7 days) long.';$q$, $q$'A trip can be at most % days long.', public.rule_int('max_tour_days');$q$),

      -- Rate limits
      (50, 'tour_rates_check_limit', false, $q$new.regular_rate > 100000 then$q$, $q$new.regular_rate > public.rule_num('private_budget_max') then$q$),
      (51, 'tour_rates_check_limit', false, $q$new.regular_rate < 3000 then$q$, $q$new.regular_rate < public.rule_num('private_budget_min') then$q$),
      (52, 'tour_rates_check_limit', false, $q$new.regular_rate > 7500 then$q$, $q$new.regular_rate > public.rule_num('regular_rate_max') then$q$),
      (53, 'tour_rates_check_limit', false, $q$new.regular_rate < 1300 then$q$, $q$new.regular_rate < public.rule_num('regular_rate_min') then$q$),
      (54, 'tour_rates_check_limit', false, $q$₱100,000.';$q$, $q$₱%.', public.rule_money('private_budget_max');$q$),
      (55, 'tour_rates_check_limit', false, $q$₱3,000.';$q$, $q$₱%.', public.rule_money('private_budget_min');$q$),
      (56, 'tour_rates_check_limit', false, $q$₱7,500.';$q$, $q$₱%.', public.rule_money('regular_rate_max');$q$),
      (57, 'tour_rates_check_limit', false, $q$₱1,300.';$q$, $q$₱%.', public.rule_money('regular_rate_min');$q$),
      (60, 'tours_check_price_limit', false, $q$new.price > 100000 then$q$, $q$new.price > public.rule_num('private_budget_max') then$q$),
      (61, 'tours_check_price_limit', false, $q$new.price < 3000 then$q$, $q$new.price < public.rule_num('private_budget_min') then$q$),
      (62, 'tours_check_price_limit', false, $q$new.price > 7500 then$q$, $q$new.price > public.rule_num('joiner_rate_max') then$q$),
      (63, 'tours_check_price_limit', false, $q$new.price < 1800 then$q$, $q$new.price < public.rule_num('joiner_rate_min') then$q$),
      (64, 'tours_check_price_limit', false, $q$₱100,000.';$q$, $q$₱%.', public.rule_money('private_budget_max');$q$),
      (65, 'tours_check_price_limit', false, $q$₱3,000.';$q$, $q$₱%.', public.rule_money('private_budget_min');$q$),
      (66, 'tours_check_price_limit', false, $q$₱7,500.';$q$, $q$₱%.', public.rule_money('joiner_rate_max');$q$),
      (67, 'tours_check_price_limit', false, $q$₱1,800.';$q$, $q$₱%.', public.rule_money('joiner_rate_min');$q$),
      (68, 'tour_rates_check', false, $q$new.regular_rate + 500 then$q$, $q$new.regular_rate + public.rule_num('joiner_rate_margin') then$q$),
      (69, 'tour_rates_check', false, $q$must be at least ₱500 more than the Regular Rate (₱%).', v_price, new.regular_rate;$q$, $q$must be at least ₱% more than the Regular Rate (₱%).', v_price, public.rule_money('joiner_rate_margin'), new.regular_rate;$q$),

      -- Tour size
      (70, 'tours_slot_limit', false, $q$new.group_size > 14$q$, $q$new.group_size > public.rule_int('max_tour_slots')$q$),
      (71, 'tours_slot_limit', false, $q$'A tour can have at most 14 slots per date.';$q$, $q$'A tour can have at most % slots per date.', public.rule_int('max_tour_slots');$q$),
      (72, 'exclusive_requests_group_limit', false, $q$new.group_size > 14 then$q$, $q$new.group_size > public.rule_int('van_seats') then$q$),
      (73, 'exclusive_requests_group_limit', false, $q$takes at most 14 people (one van).';$q$, $q$takes at most % people (one van).', public.rule_int('van_seats');$q$),
      (74, 'exclusive_requests_group_limit', false, $q$new.group_size > 70 then$q$, $q$new.group_size > public.rule_int('max_vans') * public.rule_int('van_seats') then$q$),
      (75, 'exclusive_requests_group_limit', false, $q$fit up to 5 vans of 14 (70 people). For a bigger group, please message us.';$q$, $q$fit up to % vans of % (% people). For a bigger group, please message us.', public.rule_int('max_vans'), public.rule_int('van_seats'), public.rule_int('max_vans') * public.rule_int('van_seats');$q$),

      -- Tour expenses
      (80, 'tour_expenses_check_limit', false, $q$new.van_rent > 30000$q$, $q$new.van_rent > public.rule_num('van_rent_max')$q$),
      (81, 'tour_expenses_check_limit', false, $q$₱30,000.';$q$, $q$₱%.', public.rule_money('van_rent_max');$q$),
      (82, 'tour_expenses_check_limit', false, $q$new.tour_guide > 2000$q$, $q$new.tour_guide > public.rule_num('tour_guide_max')$q$),
      (83, 'tour_expenses_check_limit', false, $q$₱2,000.';$q$, $q$₱%.', public.rule_money('tour_guide_max');$q$),
      (84, 'exclusive_requests_check_expenses', false, $q$not between 15000 and 30000 then$q$, $q$not between public.rule_num('van_rent_min') and public.rule_num('van_rent_max') then$q$),
      (85, 'exclusive_requests_check_expenses', false, $q$'Van Rent must be from ₱15,000 to ₱30,000.';$q$, $q$'Van Rent must be from ₱% to ₱%.', public.rule_money('van_rent_min'), public.rule_money('van_rent_max');$q$),
      (86, 'exclusive_requests_check_expenses', false, $q$not between 1300 and 2000 then$q$, $q$not between public.rule_num('tour_guide_min') and public.rule_num('tour_guide_max') then$q$),
      (87, 'exclusive_requests_check_expenses', false, $q$'Tour Guide must be from ₱1,300 to ₱2,000.';$q$, $q$'Tour Guide must be from ₱% to ₱%.', public.rule_money('tour_guide_min'), public.rule_money('tour_guide_max');$q$),
      (88, 'exclusive_requests_check_expenses', false, $q$::numeric <> 260 then$q$, $q$::numeric <> public.rule_num('bag_tag_fee') then$q$),
      (89, 'exclusive_requests_check_expenses', false, $q$'The Bag Tag is fixed at ₱260.';$q$, $q$'The Bag Tag is fixed at ₱%.', public.rule_money('bag_tag_fee');$q$),

      -- Weather: time to choose, and the refund (the booking's own remembered value)
      (90, 'weather_cancel', false, $q$interval '48 hours'$q$, $q$make_interval(hours => public.rule_int('weather_choice_hours'))$q$),
      (91, 'weather_cancel', false, $q$Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund.$q$, $q$Get a ' || public.tour_weather_pct(p_tour_id) || E'%% refund.\nIf you don''t choose by then, you''ll get the ' || public.tour_weather_pct(p_tour_id) || E'%% refund.$q$),
      (92, 'weather_cancel', false, $q$50%%$q$, $q$' || public.booking_weather_pct(b.id) || '%%$q$),
      (93, 'weather_postpone', false, $q$interval '48 hours'$q$, $q$make_interval(hours => public.rule_int('weather_choice_hours'))$q$),
      (94, 'weather_postpone', false, $q$Get a 50%% refund.\nIf you don''t choose by then, you''ll get the 50%% refund.$q$, $q$Get a ' || public.tour_weather_pct(p_tour_id) || E'%% refund.\nIf you don''t choose by then, you''ll get the ' || public.tour_weather_pct(p_tour_id) || E'%% refund.$q$),
      (95, 'weather_postpone', false, $q$50%%$q$, $q$' || public.booking_weather_pct(b.id) || '%%$q$),
      (96, 'weather_set_refund', false, $q$coalesce(v_paid, 0) * 0.5, 2)$q$, $q$coalesce(v_paid, 0) * public.booking_weather_rate(p_booking_id), 2)$q$),
      (97, 'weather_set_refund', false, $q$50%$q$, $q$' || public.booking_weather_pct(p_booking_id) || '%$q$),
      (98, 'weather_set_refund', false, $q$48 hours$q$, $q$' || public.rule_int('weather_choice_hours') || ' hours$q$),
      (99, 'mark_weather_refund_sent', false, $q$50%%$q$, $q$' || public.booking_weather_pct(p_booking_id) || '%%$q$)
    ) as v(n, fn, is_regex, pat, rep)
    order by n
  loop
    for f in
      select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = s.fn and p.prokind = 'f'
    loop
      def := pg_get_functiondef(f.oid);
      if s.is_regex then
        fixed := regexp_replace(def, s.pat, s.rep, 'g');
      else
        fixed := replace(def, s.pat, s.rep);
      end if;
      if fixed is distinct from def then
        execute fixed;
      end if;
    end loop;
  end loop;
end;
$do$;

-- ── 6. Tell the page if any hard-coded value is still left ──
-- (Shown under Booking Rules. An empty list means every function reads the table.)
create or replace function public.booking_rules_check()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.proname::text order by p.proname), '{}')
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and (
       (p.proname in ('cancel_my_booking', 'reschedule_booking', 'bookings_guard_joiner_update') and p.prosrc like '%cancellation_cutoff_days()%')
       or (p.proname = 'start_online_booking' and p.prosrc like '%interval ''30 minutes''%')
       or (p.proname = 'record_online_payment' and p.prosrc not like '%booking_downpayment_percent%')
       or (p.proname = 'exclusive_requests_flow_rules' and (p.prosrc ~ 'interval ''(14 days|24 hours)''' or p.prosrc ~ 'budget (<|>|\*) [0-9]'))
       or (p.proname in ('exclusive_requests_guard_approval', 'reject_overdue_requests', 'update_my_request') and p.prosrc ~ '::date \+ [0-9]')
       or (p.proname = 'exclusive_requests_check_request' and p.prosrc like '%+ 1 > 7 then%')
       or (p.proname in ('tour_rates_check_limit', 'tours_check_price_limit', 'tour_rates_check', 'tour_expenses_check_limit', 'exclusive_requests_check_expenses') and p.prosrc ~ '₱[1-9]')
       or (p.proname in ('tours_slot_limit', 'exclusive_requests_group_limit') and p.prosrc ~ 'group_size > [0-9]')
       or (p.proname in ('weather_cancel', 'weather_postpone', 'weather_set_refund', 'mark_weather_refund_sent') and (p.prosrc like '%50%' or p.prosrc like '%48 hours%'))
     )
$$;
revoke all on function public.booking_rules_check() from public;
grant execute on function public.booking_rules_check() to authenticated;
