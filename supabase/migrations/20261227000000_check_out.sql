-- ─────────────────────────────────────────────
-- Check-out at drop-off
--
-- After the trip, when joiners are dropped off, the coordinator checks them
-- out the same way they checked in: by scanning their QR (or typing the
-- booking number, or from the joiner list). Check-in itself is unchanged.
--   • Only joiners who checked in can be checked out, once.
--   • Open from the tour's first day until the day after its last day
--     (drop-offs can be after midnight).
--   • Admins only; an admin can undo a check-out.
--
-- Run after 20261226000000_inclusion_ratings.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.bookings add column if not exists checked_out_at timestamptz;
alter table public.bookings add column if not exists checked_out_by uuid;

create or replace function public.check_out_booking(
  p_code    text,
  p_tour_id public.tours.id%type
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := btrim(coalesce(p_code, ''));
  v_uuid  uuid;
  b       public.bookings%rowtype;
  t       public.tours%rowtype;
  v_info  jsonb;
  v_account text;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can check joiners out.';
  end if;

  -- The same QR as check-in ("BANDANGIBAYO-CHECKIN:<code>"), a bare code, or a booking number.
  v_code := regexp_replace(v_code, '^BANDANGIBAYO-CHECKIN:', '', 'i');
  begin
    v_uuid := v_code::uuid;
  exception when others then
    v_uuid := null;
  end;
  if v_uuid is not null then
    select * into b from public.bookings where checkin_code = v_uuid;
  else
    select * into b from public.bookings where upper(booking_number) = upper(v_code);
  end if;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into t from public.tours where id = b.tour_id;
  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_account
    from public.profiles p where p.id = b.user_id;
  v_info := jsonb_build_object(
    'booking_id', b.id, 'booking_number', b.booking_number, 'full_name', b.full_name, 'account_name', v_account,
    'slots_booked', b.slots_booked, 'companions', coalesce(b.companions, '[]'::jsonb),
    'tour_id', b.tour_id, 'tour_title', t.title, 'tour_start', t.start_date, 'tour_end', t.end_date,
    'booking_status', b.booking_status, 'checked_in_at', b.checked_in_at, 'checked_out_at', b.checked_out_at
  );

  if p_tour_id is not null and b.tour_id is distinct from p_tour_id then
    return v_info || jsonb_build_object('result', 'wrong_tour');
  end if;
  if b.booking_status in ('Cancelled', 'Rejected') then
    return v_info || jsonb_build_object('result', 'cancelled');
  end if;
  if b.checked_in_at is null then
    return v_info || jsonb_build_object('result', 'not_checked_in');
  end if;
  if b.checked_out_at is not null then
    return v_info || jsonb_build_object('result', 'already_out');
  end if;
  if t.start_date is not null
     and (v_today < t.start_date or v_today > coalesce(t.end_date, t.start_date) + 1) then
    return v_info || jsonb_build_object('result', 'not_open');
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set checked_out_at = now(), checked_out_by = auth.uid()
   where id = b.id
   returning checked_out_at into b.checked_out_at;

  return v_info || jsonb_build_object('result', 'ok', 'checked_out_at', b.checked_out_at);
end;
$$;
revoke all on function public.check_out_booking(text, public.tours.id%type) from public;
grant execute on function public.check_out_booking(text, public.tours.id%type) to authenticated;

create or replace function public.undo_check_out(p_booking_id public.bookings.id%type)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change check-outs.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings set checked_out_at = null, checked_out_by = null where id = p_booking_id;
end;
$$;
revoke all on function public.undo_check_out(public.bookings.id%type) from public;
grant execute on function public.undo_check_out(public.bookings.id%type) to authenticated;

-- Undoing a check-in also clears its check-out (it can't be out without being in).
create or replace function public.bookings_checkout_follows_checkin()
returns trigger
language plpgsql
as $$
begin
  if new.checked_in_at is null and old.checked_in_at is not null then
    new.checked_out_at := null;
    new.checked_out_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_checkout_follows_checkin on public.bookings;
create trigger bookings_checkout_follows_checkin before update on public.bookings
  for each row execute function public.bookings_checkout_follows_checkin();
