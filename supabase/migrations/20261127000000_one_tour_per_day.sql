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
