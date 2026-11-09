-- ─────────────────────────────────────────────
-- Exclusive tours have no rate limits
--
-- The Joiner Rate (₱1,800–₱7,500) and Regular Rate (₱1,300–₱7,500) limits are
-- for Tour Management and requested tours. An exclusive tour's private tour
-- row (tours.is_exclusive) holds the whole group's package price, so sending
-- an exclusive package (e.g. ₱50,000) failed with "The Joiner Rate can be at
-- most ₱7,500." Both checks now skip exclusive tours.
--
-- Run after 20261214000000_exclusive_one_per_day.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tours_check_price_limit()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.is_exclusive, false) then
    return new;
  end if;
  if new.price is not null and (tg_op = 'INSERT' or new.price is distinct from old.price) then
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
begin
  if exists (select 1 from public.tours t where t.id = new.tour_id and coalesce(t.is_exclusive, false)) then
    return new;
  end if;
  if tg_op = 'INSERT' or new.regular_rate is distinct from old.regular_rate then
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
