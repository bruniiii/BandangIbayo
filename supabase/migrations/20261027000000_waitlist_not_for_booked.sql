-- ─────────────────────────────────────────────
-- A joiner who is already booked on a tour can't join its waitlist
--
-- "Booked" means any booking on that tour date that isn't Cancelled or
-- Rejected (a booking with a pending cancellation request still counts).
-- Also removes waitlist entries of joiners who are already booked.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.tour_waitlist_block_booked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_number text;
begin
  select b.booking_number into v_booking_number
    from public.bookings b
   where b.tour_id = new.tour_id
     and b.user_id = new.user_id
     and b.booking_status not in ('Cancelled', 'Rejected')
   limit 1;
  if found then
    raise exception 'You are already booked on this tour (%), so you can''t join its waitlist.', v_booking_number;
  end if;
  return new;
end;
$$;

drop trigger if exists tour_waitlist_block_booked on public.tour_waitlist;
create trigger tour_waitlist_block_booked
  before insert on public.tour_waitlist
  for each row execute function public.tour_waitlist_block_booked();

delete from public.tour_waitlist w
 using public.bookings b
 where b.tour_id = w.tour_id
   and b.user_id = w.user_id
   and b.booking_status not in ('Cancelled', 'Rejected');
