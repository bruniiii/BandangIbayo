-- ─────────────────────────────────────────────
-- Exclusive tours: pay the remaining balance online
--
-- After the 50% downpayment (20261023000000_exclusive_downpayment.sql), the
-- joiner can pay the rest of the package price through PayMongo too. The
-- `payments` Edge Function ("pay-exclusive" with part "balance") works out
-- the amount (package price minus what was paid) and records it here.
-- Admins can also mark the balance as paid by hand.
--
-- Run 20261023000000_exclusive_downpayment.sql first. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.exclusive_requests add column if not exists balance_settled              boolean not null default false;
alter table public.exclusive_requests add column if not exists balance_amount               numeric(12,2);
alter table public.exclusive_requests add column if not exists balance_paid_at              timestamptz;
alter table public.exclusive_requests add column if not exists balance_paymongo_checkout_id  text;
alter table public.exclusive_requests add column if not exists balance_paymongo_checkout_url text;
alter table public.exclusive_requests add column if not exists balance_paymongo_payment_id   text;

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
      new.balance_settled := false;
      new.balance_amount := null;
      new.balance_paid_at := null;
      new.balance_paymongo_checkout_id := null;
      new.balance_paymongo_checkout_url := null;
      new.balance_paymongo_payment_id := null;
    end if;
  end if;
  return new;
end;
$$;
