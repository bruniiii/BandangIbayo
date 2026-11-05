-- ─────────────────────────────────────────────
-- One tour per day also counts approved exclusive tours
--
-- An approved exclusive request reserves its days (the van and the team):
--   • approving an exclusive request is refused if a tour (or another approved
--     exclusive request) is already on those days;
--   • a tour can't be put on days an approved exclusive request reserved.
-- An exclusive request stops reserving days when it's rejected, or when the
-- 24 hours to pay its downpayment passed without payment. Once its package is
-- sent, its private tour date takes over (the normal one-tour-per-day check).
--
-- Run after 20261213000000_exclusive_flow.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- The days an exclusive request holds: its package dates once sent, else its preferred dates.
create or replace function public.exclusive_request_days(r public.exclusive_requests)
returns daterange
language sql
immutable
as $$
  select case
    when coalesce(nullif(r.package_details ->> 'start_date', ''), r.preferred_date::text) is null then null
    else daterange(
      coalesce(nullif(r.package_details ->> 'start_date', '')::date, r.preferred_date),
      coalesce(nullif(r.package_details ->> 'end_date', '')::date, r.preferred_end_date,
               nullif(r.package_details ->> 'start_date', '')::date, r.preferred_date),
      '[]') end;
$$;

-- Still holding its days: approved, not unpaid past its 24 hours, and its trip not over.
create or replace function public.exclusive_request_holds_days(r public.exclusive_requests)
returns boolean
language sql
stable
as $$
  select r.request_type = 'exclusive' and r.status = 'Approved'
     and (r.payment_status = 'Paid' or r.downpayment_due_at is null or r.downpayment_due_at > now())
     and upper(public.exclusive_request_days(r)) > (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function public.tours_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other text;
  v_range daterange;
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
  v_range := daterange(new.start_date, coalesce(new.end_date, new.start_date), '[]');

  v_other := (
    select format('%s (%s)', t.title,
             case when coalesce(t.end_date, t.start_date) = t.start_date
                  then to_char(t.start_date, 'Mon DD, YYYY')
                  else to_char(t.start_date, 'Mon DD') || ' – ' || to_char(t.end_date, 'Mon DD, YYYY') end)
      from public.tours t
     where t.id is distinct from new.id
       and not coalesce(t.is_archived, false)
       and t.start_date is not null
       and daterange(t.start_date, coalesce(t.end_date, t.start_date), '[]') && v_range
     order by t.start_date
     limit 1);

  -- Approved exclusive tours reserve their days too (until their own date exists).
  if v_other is null then
    v_other := (
      select format('the exclusive tour to %s (%s)', r.destination,
               to_char(lower(public.exclusive_request_days(r)), 'Mon DD') || ' – ' || to_char(upper(public.exclusive_request_days(r)) - 1, 'Mon DD, YYYY'))
        from public.exclusive_requests r
       where public.exclusive_request_holds_days(r)
         and public.exclusive_request_days(r) && v_range
         and r.id is distinct from new.exclusive_request_id
         and not exists (select 1 from public.tours t where t.exclusive_request_id = r.id and not coalesce(t.is_archived, false))
       limit 1);
  end if;

  if v_other is not null then
    raise exception 'Only one tour per day: % is already on those days. Pick other dates.', v_other;
  end if;
  return new;
end;
$$;

-- Approving an exclusive request: its days must be free.
create or replace function public.exclusive_requests_one_per_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_range daterange;
  v_other text;
begin
  if new.request_type <> 'exclusive' or new.status <> 'Approved' or old.status = 'Approved' then
    return new;
  end if;
  v_range := public.exclusive_request_days(new);
  if v_range is null then return new; end if;

  v_other := (
    select format('%s (%s)', t.title,
             case when coalesce(t.end_date, t.start_date) = t.start_date
                  then to_char(t.start_date, 'Mon DD, YYYY')
                  else to_char(t.start_date, 'Mon DD') || ' – ' || to_char(t.end_date, 'Mon DD, YYYY') end)
      from public.tours t
     where not coalesce(t.is_archived, false)
       and t.start_date is not null
       and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
       and t.exclusive_request_id is distinct from new.id
       and daterange(t.start_date, coalesce(t.end_date, t.start_date), '[]') && v_range
     order by t.start_date
     limit 1);
  if v_other is null then
    v_other := (
      select format('the exclusive tour to %s', r.destination)
        from public.exclusive_requests r
       where r.id <> new.id
         and public.exclusive_request_holds_days(r)
         and public.exclusive_request_days(r) && v_range
       limit 1);
  end if;
  if v_other is not null then
    raise exception 'Can''t approve: only one tour per day, and % is already on those days. Reject it with a reason (e.g. the dates are not available).', v_other;
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_one_per_day on public.exclusive_requests;
create trigger exclusive_requests_one_per_day
  before update of status on public.exclusive_requests
  for each row execute function public.exclusive_requests_one_per_day();
