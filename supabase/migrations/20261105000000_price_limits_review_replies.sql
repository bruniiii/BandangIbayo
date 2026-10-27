-- ─────────────────────────────────────────────
-- Price limits, unique pickup points and admin replies to reviews
--
-- 1. Price limits: Joiner Rate (tours.price) at most ₱8,000, Regular Rate at
--    most ₱7,500, Van Rent at most ₱30,000, Tour Guide at most ₱2,000.
--    Checked only when a price is set or changed, so older tours that cost
--    more can still be archived or edited in other ways.
-- 2. A tour can't have two pickup points with the same name.
-- 3. reviews.admin_reply: one reply per review, written by an admin only.
--    The joiner gets a notification when the agency replies.
--
-- Run after 20261104000000_pickup_points_expenses.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Price limits ───────────────────────────
create or replace function public.tours_check_price_limit()
returns trigger
language plpgsql
as $$
begin
  if new.price is not null and new.price > 8000
     and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    raise exception 'The Joiner Rate can be at most ₱8,000.';
  end if;
  return new;
end;
$$;

drop trigger if exists tours_check_price_limit on public.tours;
create trigger tours_check_price_limit
  before insert or update of price on public.tours
  for each row execute function public.tours_check_price_limit();

create or replace function public.tour_rates_check_limit()
returns trigger
language plpgsql
as $$
begin
  if new.regular_rate > 7500 and (tg_op = 'INSERT' or new.regular_rate is distinct from old.regular_rate) then
    raise exception 'The Regular Rate can be at most ₱7,500.';
  end if;
  return new;
end;
$$;

drop trigger if exists tour_rates_check_limit on public.tour_rates;
create trigger tour_rates_check_limit
  before insert or update on public.tour_rates
  for each row execute function public.tour_rates_check_limit();

create or replace function public.tour_expenses_check_limit()
returns trigger
language plpgsql
as $$
begin
  if new.van_rent > 30000 and (tg_op = 'INSERT' or new.van_rent is distinct from old.van_rent) then
    raise exception 'Van Rent can be at most ₱30,000.';
  end if;
  if new.tour_guide > 2000 and (tg_op = 'INSERT' or new.tour_guide is distinct from old.tour_guide) then
    raise exception 'Tour Guide can be at most ₱2,000.';
  end if;
  return new;
end;
$$;

drop trigger if exists tour_expenses_check_limit on public.tour_expenses;
create trigger tour_expenses_check_limit
  before insert or update on public.tour_expenses
  for each row execute function public.tour_expenses_check_limit();

-- ── 2. No two pickup points with the same name on one tour ──
create or replace function public.tour_meetups_check_unique_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.tour_meetups m
     where m.tour_id = new.tour_id
       and m.id is distinct from new.id
       and lower(btrim(m.location_name)) = lower(btrim(new.location_name))
  ) then
    raise exception 'This tour already has a pickup point called "%". Please use a different one.', btrim(new.location_name);
  end if;
  return new;
end;
$$;

drop trigger if exists tour_meetups_check_unique_name on public.tour_meetups;
create trigger tour_meetups_check_unique_name
  before insert or update of location_name, tour_id on public.tour_meetups
  for each row execute function public.tour_meetups_check_unique_name();

-- ── 3. Admin replies to reviews ───────────────
alter table public.reviews add column if not exists admin_reply text;
alter table public.reviews add column if not exists admin_reply_at timestamptz;

create or replace function public.reviews_guard_admin_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.admin_reply end;
begin
  new.admin_reply := nullif(btrim(coalesce(new.admin_reply, '')), '');
  if new.admin_reply is distinct from v_old then
    if public.is_client_request() and not public.is_admin() then
      raise exception 'Only Bandang IBAYO can reply to reviews.';
    end if;
    if length(new.admin_reply) > 500 then
      raise exception 'A reply can be at most 500 characters.';
    end if;
    new.admin_reply_at := case when new.admin_reply is null then null else now() end;
  elsif tg_op = 'UPDATE' then
    new.admin_reply_at := old.admin_reply_at; -- only changes with the reply
  else
    new.admin_reply_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard_admin_reply on public.reviews;
create trigger reviews_guard_admin_reply
  before insert or update on public.reviews
  for each row execute function public.reviews_guard_admin_reply();

-- Let the joiner know when the agency replies (or edits its reply).
create or replace function public.reviews_notify_admin_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.admin_reply is not null and new.admin_reply is distinct from old.admin_reply and new.user_id is not null then
    select t.title into v_title from public.tours t where t.id = new.tour_id;
    insert into public.notifications (user_id, title, message, type)
    values (new.user_id, 'Bandang IBAYO replied to your review',
            format('We replied to your review of %s. Open Reviews to read it.', coalesce(v_title, 'your tour')),
            'review');
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_notify_admin_reply on public.reviews;
create trigger reviews_notify_admin_reply
  after update of admin_reply on public.reviews
  for each row execute function public.reviews_notify_admin_reply();
