-- ─────────────────────────────────────────────
-- 1. Tours archive themselves once they're over.
-- 2. QR check-in: every booking gets its own check-in code (shown to the
--    joiner as a QR), and admins scan it on the day to confirm the joiner
--    is on that tour's list.
-- Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Auto-archive ───────────────────────────
-- A tour is over the day after its end date (Philippine time). Archiving
-- only hides it from the open-tour lists; bookings, reviews and reports
-- keep working. Anyone signed in may call this: it can only archive tours
-- that have already ended.
create or replace function public.archive_past_tours()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.tours
     set is_archived = true
   where coalesce(is_archived, false) = false
     and coalesce(end_date, start_date) < (now() at time zone 'Asia/Manila')::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.archive_past_tours() from public;
grant execute on function public.archive_past_tours() to authenticated, service_role;

-- Archive the ones that are already over.
select public.archive_past_tours();

-- Run it every night at 12:05 AM Philippine time (16:05 UTC) when pg_cron
-- is available. The app also runs it when tour lists load, so tours get
-- archived even without pg_cron.
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'archive-past-tours') then
    perform cron.unschedule('archive-past-tours');
  end if;
  perform cron.schedule('archive-past-tours', '5 16 * * *', 'select public.archive_past_tours()');
exception when others then
  raise notice 'pg_cron not available (%); tours will be archived when the app loads them.', sqlerrm;
end;
$$;

-- ── 2. QR check-in ────────────────────────────
-- One random code per booking (covers everyone in that booking). The QR
-- holds only this code, so it can't be guessed from a booking number.
alter table public.bookings add column if not exists checkin_code uuid not null default gen_random_uuid();
alter table public.bookings add column if not exists checked_in_at timestamptz;
alter table public.bookings add column if not exists checked_in_by uuid references auth.users(id) on delete set null;
create unique index if not exists bookings_checkin_code_key on public.bookings (checkin_code);

-- Admin scans a code (or types a booking number) for a chosen tour.
-- Returns what to show:
--   result = ok | already | wrong_tour | cancelled | unpaid | not_found
-- When the booking is valid for this tour and not yet checked in, it is
-- marked checked in (unless p_mark is false).
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
begin
  if not public.is_admin() then
    raise exception 'Only admins can check joiners in.';
  end if;

  -- The QR holds "BANDANGIBAYO-CHECKIN:<code>"; a bare code or a booking
  -- number (e.g. BK-2610-01001) typed by hand works too.
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

  v_balance := case
    when b.payment_method = 'Downpayment' and not coalesce((to_jsonb(b) ->> 'balance_settled')::boolean, false)
      then greatest(0, coalesce(b.total_price, 0) - coalesce(b.amount_paid, 0))
    else 0
  end;

  v_info := jsonb_build_object(
    'booking_id', b.id,
    'booking_number', b.booking_number,
    'full_name', b.full_name,
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

-- Undo a check-in (wrong person scanned, etc.).
create or replace function public.undo_check_in(p_booking_id public.bookings.id%type)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change check-ins.';
  end if;
  update public.bookings set checked_in_at = null, checked_in_by = null where id = p_booking_id;
end;
$$;

revoke all on function public.undo_check_in(public.bookings.id%type) from public;
grant execute on function public.undo_check_in(public.bookings.id%type) to authenticated;
