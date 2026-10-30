-- ─────────────────────────────────────────────
-- Joiners: deactivate your account (instead of deleting it), reactivate later
--
-- profiles.deactivated_at is set while the account is deactivated. The joiner
-- can't use the site until they log in again and choose to reactivate it.
-- Nothing is deleted: bookings, reviews and profile details stay.
--
-- Run after 20261121000000_archive_admins.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists deactivated_at timestamptz;

create or replace function public.deactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'archived_admin')) then
    raise exception 'Admin accounts can''t be deactivated here.';
  end if;
  if exists (
    select 1
      from public.bookings b join public.tours t on t.id = b.tour_id
     where b.user_id = auth.uid()
       and b.booking_status not in ('Cancelled', 'Rejected')
       and coalesce(t.end_date, t.start_date) >= (now() at time zone 'Asia/Manila')::date
  ) then
    raise exception 'You have an upcoming booking. You can deactivate your account after your trip, or once the booking is cancelled.';
  end if;
  update public.profiles set deactivated_at = now() where id = auth.uid();
end;
$$;

create or replace function public.reactivate_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  update public.profiles set deactivated_at = null where id = auth.uid();
end;
$$;

revoke all on function public.deactivate_my_account() from public, anon;
revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.reactivate_my_account() to authenticated;
