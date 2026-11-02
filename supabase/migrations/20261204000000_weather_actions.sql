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
