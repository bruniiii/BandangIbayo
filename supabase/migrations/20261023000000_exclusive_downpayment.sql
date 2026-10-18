-- ─────────────────────────────────────────────
-- Exclusive tours: 50% downpayment online
--
-- After the agency approves an exclusive tour request and sends the package
-- (with its price), the joiner pays a 50% downpayment through PayMongo. The
-- `payments` Edge Function (action "pay-exclusive") works out the amount from
-- the package price and records the payment here when PayMongo confirms it.
--
-- Joiners can create and read their requests but never change one afterwards,
-- so they can't edit the package price or mark a request as paid. Admins can
-- still update requests (approve, send the package, or mark a downpayment paid
-- by hand when it was paid another way).
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists downpayment_amount   numeric(12,2);
alter table public.exclusive_requests add column if not exists amount_paid          numeric(12,2) not null default 0;
alter table public.exclusive_requests add column if not exists payment_status       text not null default 'Unpaid';
alter table public.exclusive_requests add column if not exists paid_at              timestamptz;
alter table public.exclusive_requests add column if not exists paymongo_checkout_id  text;
alter table public.exclusive_requests add column if not exists paymongo_checkout_url text;
alter table public.exclusive_requests add column if not exists paymongo_payment_id   text;

do $$
begin
  alter table public.exclusive_requests
    add constraint exclusive_requests_payment_status_check check (payment_status in ('Unpaid', 'Paid'));
exception when duplicate_object then null;
end;
$$;

-- New requests from the website start unpaid, whatever the form sends.
create or replace function public.exclusive_requests_guard_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_request() then
    if not public.is_admin() then
      new.status := 'Pending';
      new.admin_response := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.package_details := null;
      new.package_sent_at := null;
      new.downpayment_amount := null;
      new.amount_paid := 0;
      new.payment_status := 'Unpaid';
      new.paid_at := null;
      new.paymongo_checkout_id := null;
      new.paymongo_checkout_url := null;
      new.paymongo_payment_id := null;
    end if;
  end if;
  return new;
end;
$$;

-- After it's sent, only the agency (admins) and the server can change a request.
create or replace function public.exclusive_requests_guard_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_request() and not public.is_admin() then
    raise exception 'Only Bandang IBAYO can change a request after it is sent.';
  end if;
  return new;
end;
$$;

drop trigger if exists a_exclusive_requests_guard_update on public.exclusive_requests;
create trigger a_exclusive_requests_guard_update
  before update on public.exclusive_requests
  for each row execute function public.exclusive_requests_guard_update();
