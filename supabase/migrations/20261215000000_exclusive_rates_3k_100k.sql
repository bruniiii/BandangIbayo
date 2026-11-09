-- ─────────────────────────────────────────────
-- Exclusive tours: budget and rates ₱3,000 – ₱100,000
--
-- The normal limits (Joiner Rate ₱1,800–₱7,500, Regular Rate ₱1,300–₱7,500)
-- are for Tour Management and requested tours. An exclusive tour is priced for
-- the whole group, so its private tour row (tours.is_exclusive) failed with
-- "The Joiner Rate can be at most ₱7,500." Exclusive tours now have their own
-- range for all three amounts:
--   • the joiner's budget:            ₱3,000 – ₱100,000 (was ₱30,000 – ₱100,000);
--   • the Package Price (Joiner Rate): ₱3,000 – ₱100,000;
--   • the Regular Rate:               ₱3,000 – ₱100,000.
--
-- Run after 20261214000000_exclusive_one_per_day.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tours_check_price_limit()
returns trigger
language plpgsql
as $$
begin
  if new.price is not null and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    if coalesce(new.is_exclusive, false) then
      if new.price > 100000 then
        raise exception 'The Package Price of an exclusive tour can be at most ₱100,000.';
      end if;
      if new.price < 3000 then
        raise exception 'The Package Price of an exclusive tour must be at least ₱3,000.';
      end if;
      return new;
    end if;
    if new.price > 7500 then
      raise exception 'The Joiner Rate can be at most ₱7,500.';
    end if;
    if new.price < 1800 then
      raise exception 'The Joiner Rate must be at least ₱1,800.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tour_rates_check_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exclusive boolean := coalesce((select t.is_exclusive from public.tours t where t.id = new.tour_id), false);
begin
  if tg_op = 'INSERT' or new.regular_rate is distinct from old.regular_rate then
    if v_exclusive then
      if new.regular_rate > 100000 then
        raise exception 'The Regular Rate of an exclusive tour can be at most ₱100,000.';
      end if;
      if new.regular_rate < 3000 then
        raise exception 'The Regular Rate of an exclusive tour must be at least ₱3,000.';
      end if;
      return new;
    end if;
    if new.regular_rate > 7500 then
      raise exception 'The Regular Rate can be at most ₱7,500.';
    end if;
    if new.regular_rate < 1300 then
      raise exception 'The Regular Rate must be at least ₱1,300.';
    end if;
  end if;
  return new;
end;
$$;

-- The request rules from 20261213000000_exclusive_flow.sql, with the budget minimum now ₱3,000.
create or replace function public.exclusive_requests_flow_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  -- One request every 2 weeks (Exclusive and Request a Tour together).
  if tg_op = 'INSERT' and new.user_id is not null and not public.is_admin() then
    v_last := (select max(r.created_at) from public.exclusive_requests r where r.user_id = new.user_id);
    if v_last is not null and v_last > now() - interval '14 days' then
      raise exception 'You can send one request every 2 weeks. You can send your next request on %.',
        to_char((v_last + interval '14 days') at time zone 'Asia/Manila', 'Mon FMDD, YYYY "at" FMHH12:MI AM');
    end if;
  end if;

  -- Exclusive tour budget: ₱3,000 to ₱100,000.
  if new.request_type = 'exclusive' and new.budget is not null
     and (tg_op = 'INSERT' or new.budget is distinct from old.budget) then
    if new.budget < 3000 then raise exception 'The budget for an exclusive tour must be at least ₱3,000.'; end if;
    if new.budget > 100000 then raise exception 'The budget for an exclusive tour can be up to ₱100,000.'; end if;
  end if;

  if tg_op = 'UPDATE' and new.request_type = 'exclusive' then
    -- Approved: the downpayment (50% of the budget) is due within 24 hours.
    if new.status = 'Approved' and old.status is distinct from 'Approved' and new.payment_status <> 'Paid' then
      new.downpayment_due_at := now() + interval '24 hours';
      if new.budget is not null then
        new.downpayment_amount := round(new.budget * 0.5, 2);
      end if;
    end if;
    -- The package waits for the downpayment.
    if new.package_sent_at is not null and old.package_sent_at is null
       and new.downpayment_due_at is not null and new.payment_status <> 'Paid' then
      raise exception 'Wait for the joiner''s downpayment before sending the tour package.';
    end if;
    -- The package price can't be less than what the joiner already paid.
    if new.package_sent_at is not null and new.payment_status = 'Paid'
       and coalesce((new.package_details ->> 'price')::numeric, 0) > 0
       and (new.package_details ->> 'price')::numeric < coalesce(new.amount_paid, 0) then
      raise exception 'The package price can''t be less than the ₱% the joiner already paid.', to_char(new.amount_paid, 'FM999,999,990.00');
    end if;
  end if;
  return new;
end;
$$;
