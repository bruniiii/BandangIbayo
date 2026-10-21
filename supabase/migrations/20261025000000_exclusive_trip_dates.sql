-- ─────────────────────────────────────────────
-- Exclusive tours: a date range instead of one preferred date
--
-- The exclusive tour form now lets the joiner pick the first and last day
-- of the trip on a calendar; the number of days is worked out from them
-- (Oct 10 – 12 = 3 days). preferred_date stays the first day.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists preferred_end_date date;
alter table public.exclusive_requests add column if not exists trip_days integer;

do $$
begin
  alter table public.exclusive_requests
    add constraint exclusive_requests_trip_dates_check
    check (preferred_end_date is null or (preferred_date is not null and preferred_end_date >= preferred_date));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.exclusive_requests
    add constraint exclusive_requests_trip_days_check check (trip_days is null or trip_days between 1 and 366);
exception when duplicate_object then null;
end;
$$;
