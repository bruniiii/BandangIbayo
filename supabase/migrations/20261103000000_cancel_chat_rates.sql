-- ─────────────────────────────────────────────
-- Cancellations, group chat rules and the Regular Rate
--
-- 1. A cancellation request notifies the admins right away (from the
--    database, so it never gets lost). Requests nobody answers within 12 hours
--    are still approved automatically; run_overdue_cancellations() also lets
--    the app trigger that check whenever it loads, besides the 15-minute job.
-- 2. A joiner who asks to cancel leaves the tour's group chat at once (and
--    is back if the agency declines the request).
-- 3. A group chat is archived when its tour ends: nobody can send messages
--    or react any more, admins included. It stays readable.
-- 4. tour_rates: the Regular Rate of each tour date (admins only). At least
--    ₱1,000, and the Joiner Rate (tours.price) must be at least ₱500 more.
--
-- Run after 20261102000000_chat_replies.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Cancellation requests ──────────────────
create or replace function public.bookings_notify_cancellation_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_name text;
begin
  if new.cancellation_requested_at is not null and old.cancellation_requested_at is null
     and new.booking_status not in ('Cancelled', 'Rejected') then
    select t.title into v_title from public.tours t where t.id = new.tour_id;
    select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_name
      from public.profiles p where p.id = new.user_id;
    insert into public.notifications (user_id, title, message, type)
    select a.id, 'Cancellation Request',
           format('%s asked to cancel %s (%s). Reason: %s. Approve or decline it in Booking Management within %s hours, or it''s approved automatically.',
                  coalesce(v_name, nullif(new.full_name, 'N/A'), 'A joiner'), coalesce(v_title, 'a tour'), new.booking_number,
                  coalesce(new.cancellation_reason, '—'), public.cancellation_approval_hours()),
           'cancellation'
      from public.profiles a where a.role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_notify_cancellation_request on public.bookings;
create trigger bookings_notify_cancellation_request
  after update of cancellation_requested_at on public.bookings
  for each row execute function public.bookings_notify_cancellation_request();

-- Anyone logged in may run the overdue check; it only approves requests
-- older than 12 hours, so running it often is harmless.
create or replace function public.run_overdue_cancellations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
-- A server-side write: lets the booking guard accept the status change.
declare
  v_count integer;
begin
  perform set_config('app.trusted_booking_write', 'on', true);
  v_count := public.approve_overdue_cancellations();
  perform set_config('app.trusted_booking_write', 'off', true);
  return v_count;
end;
$$;

revoke all on function public.run_overdue_cancellations() from public;
grant execute on function public.run_overdue_cancellations() to authenticated;

-- ── 2 & 3. Group chat membership and archiving ──
create or replace function public.is_tour_chat_member(p_tour_id public.tours.id%type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.bookings
     where tour_id = p_tour_id
       and user_id = auth.uid()
       and payment_status = 'Complete'
       and booking_status not in ('Cancelled', 'Rejected')
       and cancellation_requested_at is null
  );
$$;

-- Open until the tour's last day ends (Philippine time); archived after that.
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
       and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
  );
$$;

drop policy if exists "tour_chat_insert_members" on public.tour_chat_messages;
create policy "tour_chat_insert_members" on public.tour_chat_messages
  for insert to authenticated
  with check (user_id = auth.uid()
              and public.is_tour_chat_member(tour_id)
              and public.tour_chat_open(tour_id));

drop policy if exists "tour_chat_reactions_insert" on public.tour_chat_reactions;
create policy "tour_chat_reactions_insert" on public.tour_chat_reactions
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.tour_chat_messages m
                           where m.id = message_id
                             and public.is_tour_chat_member(m.tour_id)
                             and public.tour_chat_open(m.tour_id)));

drop policy if exists "tour_chat_reactions_update" on public.tour_chat_reactions;
create policy "tour_chat_reactions_update" on public.tour_chat_reactions
  for update to authenticated
  using (user_id = auth.uid() and public.tour_chat_open(tour_id))
  with check (user_id = auth.uid() and public.tour_chat_open(tour_id));

drop policy if exists "tour_chat_reactions_delete" on public.tour_chat_reactions;
create policy "tour_chat_reactions_delete" on public.tour_chat_reactions
  for delete to authenticated using (user_id = auth.uid() and public.tour_chat_open(tour_id));

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
    select t.id, t.title, t.start_date, t.end_date
      from public.tours t
     where coalesce(t.end_date, t.start_date) + 30 >= (now() at time zone 'Asia/Manila')::date
       and exists (
         select 1 from public.bookings b
          where b.tour_id = t.id
            and b.payment_status = 'Complete'
            and b.booking_status not in ('Cancelled', 'Rejected')
            and (public.is_admin() or (b.user_id = auth.uid() and b.cancellation_requested_at is null))
       )
  )
  select c.id, c.title, c.start_date, c.end_date,
         (select count(distinct b.user_id)::int from public.bookings b
           where b.tour_id = c.id and b.payment_status = 'Complete'
             and b.booking_status not in ('Cancelled', 'Rejected')
             and b.cancellation_requested_at is null),
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

-- ── 4. Regular Rate ───────────────────────────
do $$
declare
  tour_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                        where attrelid = 'public.tours'::regclass and attname = 'id');
begin
  execute format($f$
    create table if not exists public.tour_rates (
      tour_id %s primary key references public.tours(id) on delete cascade,
      regular_rate numeric(12,2) not null check (regular_rate >= 1000),
      updated_at timestamptz not null default now()
    )$f$, tour_id_type);
end;
$$;

alter table public.tour_rates enable row level security;
grant select, insert, update, delete on public.tour_rates to authenticated;

drop policy if exists "tour_rates_admin" on public.tour_rates;
create policy "tour_rates_admin" on public.tour_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The Joiner Rate must be at least ₱500 above the Regular Rate.
create or replace function public.tour_rates_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric;
begin
  select t.price into v_price from public.tours t where t.id = new.tour_id;
  if v_price is not null and v_price < new.regular_rate + 500 then
    raise exception 'The Joiner Rate (₱%) must be at least ₱500 more than the Regular Rate (₱%).', v_price, new.regular_rate;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tour_rates_check on public.tour_rates;
create trigger tour_rates_check
  before insert or update on public.tour_rates
  for each row execute function public.tour_rates_check();
