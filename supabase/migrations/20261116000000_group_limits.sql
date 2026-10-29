-- ─────────────────────────────────────────────
-- Group size limits
--
-- 1. A tour takes at most 14 joiners per date (one van). Checked when a tour
--    is posted or its slots are changed, so older tours keep their number.
-- 2. Request a Tour: at most 14 people. Exclusive Tours: at most 5 vans of 14
--    (70 people).
--
-- Run after 20261115000000_admin_messages.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tours_slot_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.group_size is not null and new.group_size > 14
     and (tg_op = 'INSERT' or new.group_size is distinct from old.group_size) then
    raise exception 'A tour can have at most 14 slots per date.';
  end if;
  return new;
end;
$$;

drop trigger if exists tours_slot_limit on public.tours;
create trigger tours_slot_limit
  before insert or update of group_size on public.tours
  for each row execute function public.tours_slot_limit();

create or replace function public.exclusive_requests_group_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.group_size is null
     or (tg_op = 'UPDATE' and new.group_size is not distinct from old.group_size
         and new.request_type is not distinct from old.request_type) then
    return new;
  end if;
  if new.request_type = 'request' and new.group_size > 14 then
    raise exception 'A requested tour takes at most 14 people (one van).';
  end if;
  if new.group_size > 70 then
    raise exception 'Exclusive tours fit up to 5 vans of 14 (70 people). For a bigger group, please message us.';
  end if;
  return new;
end;
$$;

drop trigger if exists exclusive_requests_group_limit on public.exclusive_requests;
create trigger exclusive_requests_group_limit
  before insert or update of group_size, request_type on public.exclusive_requests
  for each row execute function public.exclusive_requests_group_limit();
