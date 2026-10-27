-- ─────────────────────────────────────────────
-- Exclusive tours and tour requests: approval window and package expenses
--
-- 1. A request can only be approved at least 2 weeks (14 days) before its
--    preferred date. Pending requests whose date has passed or is less than
--    2 weeks away show as "Not Approved" on the website.
-- 2. package_details.expenses: the package's expenses, with the same rules as
--    a tour's: Van Rent ₱15,000–₱30,000, Tour Guide ₱1,300–₱2,000, Bag Tag
--    ₱260 and any others (name + amount ₱0 or more). Joiners see the names only.
--
-- Run after 20261105000000_price_limits_review_replies.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Approval window ────────────────────────
create or replace function public.exclusive_requests_guard_approval()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Approved' and old.status is distinct from 'Approved' and new.preferred_date is not null then
    if new.preferred_date < (now() at time zone 'Asia/Manila')::date then
      raise exception 'This request can''t be approved: its preferred date has already passed.';
    end if;
    if new.preferred_date < (now() at time zone 'Asia/Manila')::date + 14 then
      raise exception 'This request can''t be approved: requests must be approved at least 2 weeks before the preferred date.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_guard_approval on public.exclusive_requests;
create trigger exclusive_requests_guard_approval
  before update of status on public.exclusive_requests
  for each row execute function public.exclusive_requests_guard_approval();

-- ── 2. Package expenses ───────────────────────
create or replace function public.exclusive_requests_check_expenses()
returns trigger
language plpgsql
as $$
declare
  v_exp jsonb := new.package_details -> 'expenses';
  v_item jsonb;
begin
  if v_exp is null or jsonb_typeof(v_exp) = 'null' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.package_details -> 'expenses') is not distinct from v_exp then
    return new; -- unchanged
  end if;
  if jsonb_typeof(v_exp) <> 'object' then
    raise exception 'Package expenses are not valid.';
  end if;
  if jsonb_typeof(v_exp -> 'van_rent') <> 'number' or (v_exp ->> 'van_rent')::numeric not between 15000 and 30000 then
    raise exception 'Van Rent must be from ₱15,000 to ₱30,000.';
  end if;
  if jsonb_typeof(v_exp -> 'tour_guide') <> 'number' or (v_exp ->> 'tour_guide')::numeric not between 1300 and 2000 then
    raise exception 'Tour Guide must be from ₱1,300 to ₱2,000.';
  end if;
  if coalesce(v_exp ->> 'bag_tag', '') <> '' and (v_exp ->> 'bag_tag')::numeric <> 260 then
    raise exception 'The Bag Tag is fixed at ₱260.';
  end if;
  if v_exp ? 'others' then
    if jsonb_typeof(v_exp -> 'others') <> 'array' then
      raise exception 'Other expenses must be a list.';
    end if;
    for v_item in select * from jsonb_array_elements(v_exp -> 'others') loop
      if coalesce(btrim(v_item ->> 'name'), '') = '' or jsonb_typeof(v_item -> 'amount') <> 'number'
         or (v_item ->> 'amount')::numeric < 0 then
        raise exception 'Each other expense needs a name and an amount of ₱0 or more.';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_check_expenses on public.exclusive_requests;
create trigger exclusive_requests_check_expenses
  before insert or update of package_details on public.exclusive_requests
  for each row execute function public.exclusive_requests_check_expenses();
