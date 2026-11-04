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

