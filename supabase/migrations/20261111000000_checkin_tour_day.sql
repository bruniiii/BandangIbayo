-- ─────────────────────────────────────────────
-- Check-in opens on the day of the tour
--
-- check_in_booking() used to open check-in the day before the tour. Now it
-- opens on the tour's first day and closes after its last day.
--
-- Run after 20261110000000_sale_full_payment.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

create or replace function public.check_in_booking(
  p_code    text,
  p_tour_id public.tours.id%type,
  p_mark    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := btrim(coalesce(p_code, ''));
  v_uuid   uuid;
  b        public.bookings%rowtype;
  t        public.tours%rowtype;
  v_info   jsonb;
  v_balance numeric;
  v_account text;
  v_today  date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can check joiners in.';
  end if;

  -- The QR holds "BANDANGIBAYO-CHECKIN:<code>"; a bare code or a booking
  -- number (e.g. BK-2026-00094) typed by hand works too.
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

  v_balance := case
    when b.payment_method = 'Downpayment' and not coalesce((to_jsonb(b) ->> 'balance_settled')::boolean, false)
      then greatest(0, coalesce(b.total_price, 0) - coalesce(b.amount_paid, 0))
    else 0
  end;

  v_info := jsonb_build_object(
    'booking_id', b.id,
    'booking_number', b.booking_number,
    'full_name', b.full_name,
    'account_name', v_account,
    'contact_number', b.contact_number,
    'slots_booked', b.slots_booked,
    'companions', coalesce(b.companions, '[]'::jsonb),
    'tour_id', b.tour_id,
    'tour_title', t.title,
    'tour_start', t.start_date,
    'tour_end', t.end_date,
    'payment_status', b.payment_status,
    'booking_status', b.booking_status,
    'balance_due', v_balance,
    'checked_in_at', b.checked_in_at
  );

  if p_tour_id is not null and b.tour_id is distinct from p_tour_id then
    return v_info || jsonb_build_object('result', 'wrong_tour');
  end if;
  if b.booking_status in ('Cancelled', 'Rejected') then
    return v_info || jsonb_build_object('result', 'cancelled');
  end if;
  if b.payment_status is distinct from 'Complete' then
    return v_info || jsonb_build_object('result', 'unpaid');
  end if;
  if b.checked_in_at is not null then
    return v_info || jsonb_build_object('result', 'already');
  end if;
  -- Open from the tour's first day until its last day.
  if p_mark and t.start_date is not null
     and (v_today < t.start_date or v_today > coalesce(t.end_date, t.start_date)) then
    return v_info || jsonb_build_object('result', 'not_open');
  end if;

  if p_mark then
    update public.bookings
       set checked_in_at = now(), checked_in_by = auth.uid()
     where id = b.id
     returning checked_in_at into b.checked_in_at;
  end if;

  return v_info || jsonb_build_object('result', 'ok', 'checked_in_at', b.checked_in_at);
end;
$$;

revoke all on function public.check_in_booking(text, public.tours.id%type, boolean) from public;
grant execute on function public.check_in_booking(text, public.tours.id%type, boolean) to authenticated;
