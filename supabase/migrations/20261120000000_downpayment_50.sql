-- ─────────────────────────────────────────────
-- Tour downpayment is now 50% (it was 40%)
--
-- bookings.downpayment_amount remembers what a joiner actually paid as their
-- downpayment, so older 40% bookings keep showing the right amounts on their
-- receipts after the switch. It's filled in automatically when a downpayment
-- is paid; existing bookings are filled in below.
--
-- Run after 20261119000000_remove_main_admin.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.bookings add column if not exists downpayment_amount numeric(12,2);

create or replace function public.bookings_remember_downpayment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_method = 'Downpayment'
     and new.payment_status = 'Complete'
     and new.downpayment_amount is null
     and not coalesce(new.balance_settled, false)
     and new.amount_paid is not null then
    new.downpayment_amount := new.amount_paid;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_bookings_remember_downpayment on public.bookings;
create trigger zz_bookings_remember_downpayment
  before insert or update on public.bookings
  for each row execute function public.bookings_remember_downpayment();

-- Bookings from before this update: still owing → what they paid; balance
-- already paid → the 40% they were charged then.
update public.bookings
set downpayment_amount = case
      when coalesce(balance_settled, false) then round(coalesce(total_price, 0) * 0.4, 2)
      else amount_paid
    end
where payment_method = 'Downpayment'
  and payment_status = 'Complete'
  and downpayment_amount is null
  and (coalesce(balance_settled, false) or amount_paid is not null);
