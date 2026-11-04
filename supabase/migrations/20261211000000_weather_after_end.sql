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
