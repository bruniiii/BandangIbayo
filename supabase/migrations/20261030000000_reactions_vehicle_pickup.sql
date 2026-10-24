-- ─────────────────────────────────────────────
-- Helpful reactions on reviews, more vehicle details, custom pickup requests
--
-- 1. review_reactions: a logged-in joiner taps "Helpful" on someone else's
--    review (once each, can take it back). review_helpful_counts() gives the
--    counts without showing who reacted.
-- 2. tour_vehicles: vehicle_color and vehicle_notes ("how to spot it").
-- 3. pickup_requests: a joiner with a paid booking asks to be picked up
--    somewhere else. The agency approves (with any extra fee, e.g. tolls) or
--    declines it; both sides get a notification.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  review_id_type  text := (select format_type(atttypid, atttypmod) from pg_attribute
                           where attrelid = 'public.reviews'::regclass and attname = 'id');
  booking_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                           where attrelid = 'public.bookings'::regclass and attname = 'id');
  tour_id_type    text := (select format_type(atttypid, atttypmod) from pg_attribute
                           where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.review_reactions (
      review_id %s not null references public.reviews(id) on delete cascade,
      user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (review_id, user_id)
    )$f$, review_id_type);

  execute format($f$
    create table if not exists public.pickup_requests (
      booking_id %s primary key references public.bookings(id) on delete cascade,
      tour_id %s references public.tours(id) on delete cascade,
      user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      location text not null,
      note text,
      status text not null default 'Requested' check (status in ('Requested', 'Approved', 'Declined')),
      extra_fee numeric(12,2) check (extra_fee is null or extra_fee >= 0),
      admin_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )$f$, booking_id_type, tour_id_type);
end;
$$;

-- ── 1. Helpful reactions ──────────────────────
alter table public.review_reactions enable row level security;
grant select, insert, delete on public.review_reactions to authenticated;

drop policy if exists "review_reactions_select_own" on public.review_reactions;
create policy "review_reactions_select_own" on public.review_reactions
  for select to authenticated using (user_id = auth.uid());

-- Not on your own review.
drop policy if exists "review_reactions_insert_own" on public.review_reactions;
create policy "review_reactions_insert_own" on public.review_reactions
  for insert to authenticated
  with check (user_id = auth.uid()
              and not exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));

drop policy if exists "review_reactions_delete_own" on public.review_reactions;
create policy "review_reactions_delete_own" on public.review_reactions
  for delete to authenticated using (user_id = auth.uid());

-- Counts for a list of reviews, and whether the caller marked each one.
create or replace function public.review_helpful_counts(p_review_ids text[])
returns table (review_id text, helpful integer, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.review_id::text,
         count(*)::int,
         coalesce(bool_or(r.user_id = auth.uid()), false)
    from public.review_reactions r
   where r.review_id::text = any(p_review_ids)
   group by r.review_id
$$;

revoke all on function public.review_helpful_counts(text[]) from public;
grant execute on function public.review_helpful_counts(text[]) to anon, authenticated;

-- ── 2. Vehicle details ────────────────────────
alter table public.tour_vehicles add column if not exists vehicle_color text;
alter table public.tour_vehicles add column if not exists vehicle_notes text;

-- ── 3. Custom pickup requests ─────────────────
alter table public.pickup_requests enable row level security;
grant select, insert, update, delete on public.pickup_requests to authenticated;

drop policy if exists "pickup_requests_select" on public.pickup_requests;
create policy "pickup_requests_select" on public.pickup_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "pickup_requests_insert_own" on public.pickup_requests;
create policy "pickup_requests_insert_own" on public.pickup_requests
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "pickup_requests_update" on public.pickup_requests;
create policy "pickup_requests_update" on public.pickup_requests
  for update to authenticated using (user_id = auth.uid() or public.is_admin());

-- Joiners can withdraw a request the agency hasn't answered yet.
drop policy if exists "pickup_requests_delete" on public.pickup_requests;
create policy "pickup_requests_delete" on public.pickup_requests
  for delete to authenticated using ((user_id = auth.uid() and status = 'Requested') or public.is_admin());

-- Checks a joiner's request and fills in the tour; joiners can't approve
-- their own request or set the fee.
create or replace function public.pickup_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_admin boolean := public.is_admin();
begin
  select b.user_id, b.tour_id, b.payment_status, b.booking_status, t.start_date
    into v_booking
    from public.bookings b join public.tours t on t.id = b.tour_id
   where b.id = new.booking_id;
  if not found then raise exception 'Booking not found.'; end if;

  new.tour_id := v_booking.tour_id;
  new.location := btrim(coalesce(new.location, ''));
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  new.updated_at := now();
  if length(new.location) < 5 then raise exception 'Please enter the full pickup address or place.'; end if;
  if length(new.location) > 200 or length(coalesce(new.note, '')) > 300 then
    raise exception 'Please keep the pickup details shorter.';
  end if;

  if v_admin or not public.is_client_request() then
    return new;
  end if;

  if v_booking.user_id is distinct from auth.uid() then raise exception 'This is not your booking.'; end if;
  if v_booking.payment_status <> 'Complete' or v_booking.booking_status in ('Cancelled', 'Rejected') then
    raise exception 'Custom pickups are for confirmed bookings only.';
  end if;
  if v_booking.start_date <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'Custom pickups must be requested before the day of the tour.';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.status := 'Requested';
    new.extra_fee := null;
    new.admin_note := null;
  else
    if old.status <> 'Requested' then
      raise exception 'The agency already answered this request. Please message us to change it.';
    end if;
    new.user_id := old.user_id;
    new.booking_id := old.booking_id;
    new.status := 'Requested';
    new.extra_fee := old.extra_fee;
    new.admin_note := old.admin_note;
  end if;
  return new;
end;
$$;

drop trigger if exists pickup_requests_guard on public.pickup_requests;
create trigger pickup_requests_guard
  before insert or update on public.pickup_requests
  for each row execute function public.pickup_requests_guard();

-- Admins hear about new requests; the joiner hears the answer.
create or replace function public.pickup_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_title text;
begin
  select b.booking_number, t.title into v_ref, v_title
    from public.bookings b join public.tours t on t.id = b.tour_id
   where b.id = new.booking_id;

  if tg_op = 'INSERT' or (old.status = 'Requested' and new.status = 'Requested'
                          and (old.location, old.note) is distinct from (new.location, new.note)) then
    insert into public.notifications (user_id, title, message, type)
    select a.id, 'Custom Pickup Requested',
           format('%s asks to be picked up at "%s" for %s.', v_ref, new.location, v_title),
           'booking'
      from public.profiles a where a.role = 'admin';
  elsif new.status is distinct from old.status and new.status in ('Approved', 'Declined') then
    insert into public.notifications (user_id, title, message, type)
    values (new.user_id,
            case new.status when 'Approved' then 'Custom Pickup Approved' else 'Custom Pickup Declined' end,
            case new.status
              when 'Approved' then format('We''ll pick you up at "%s" for %s (%s).%s%s', new.location, v_title, v_ref,
                case when coalesce(new.extra_fee, 0) > 0 then format(' Additional fee: ₱%s.', to_char(new.extra_fee, 'FM999,999,990.00')) else '' end,
                case when new.admin_note is not null then ' ' || new.admin_note else '' end)
              else format('We can''t pick you up at "%s" for %s (%s), so please use one of the regular pickup points.%s', new.location, v_title, v_ref,
                case when new.admin_note is not null then ' ' || new.admin_note else '' end)
            end,
            'booking');
  end if;
  return new;
end;
$$;

drop trigger if exists pickup_requests_notify on public.pickup_requests;
create trigger pickup_requests_notify
  after insert or update on public.pickup_requests
  for each row execute function public.pickup_requests_notify();
