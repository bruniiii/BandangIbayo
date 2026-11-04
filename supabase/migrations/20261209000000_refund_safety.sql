-- ─────────────────────────────────────────────
-- Safer weather refunds
--
-- 1. Only the main admin sends a refund. Other admins prepare it (how it's
--    sent; for GCash, the reference and a screenshot of the GCash receipt),
--    and the main admin approves and sends it.
-- 2. A GCash refund needs a screenshot of the GCash receipt (private bucket
--    "refund-proofs"; admins and the joiner who booked can see it).
-- 3. The joiner confirms in My Bookings: "I received it" or "I didn't get it"
--    (the main admin is told right away).
-- 4. (payments function) PayMongo tells the website when a refund finishes or
--    fails; the result is kept in weather_refund_paymongo.
-- 5. A refund history (refund_log): who did what, how much, how, the
--    reference and when. Only the main admin can read it, and nobody can
--    change or delete a row.
--
-- Run after 20261208000000_admin_restore_requests.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.bookings add column if not exists weather_refund_method text;          -- 'paymongo' | 'gcash'
alter table public.bookings add column if not exists weather_refund_proof text;           -- path in refund-proofs
alter table public.bookings add column if not exists weather_refund_prepared_by uuid;
alter table public.bookings add column if not exists weather_refund_prepared_at timestamptz;
alter table public.bookings add column if not exists weather_refund_received text;        -- 'received' | 'not_received'
alter table public.bookings add column if not exists weather_refund_received_at timestamptz;
alter table public.bookings add column if not exists weather_refund_paymongo text;        -- PayMongo's last word: pending | succeeded | failed

-- ── Refund details change only through the steps below ──
-- (Before this, any admin could edit a booking's refund straight from the
-- browser, e.g. set it to "Sent" with no money sent. The functions below and
-- the payments function are the only ways now.)
create or replace function public.bookings_guard_refund_columns()
returns trigger
language plpgsql
as $$
declare
  refund_columns constant text[] := array[
    'weather_refund', 'weather_refund_status', 'weather_refund_ref', 'weather_refund_at',
    'weather_refund_method', 'weather_refund_proof', 'weather_refund_prepared_by', 'weather_refund_prepared_at',
    'weather_refund_received', 'weather_refund_received_at', 'weather_refund_paymongo'
  ];
  c text;
begin
  if not public.is_client_request() then
    return new;
  end if;
  if coalesce(current_setting('app.trusted_booking_write', true), '') = 'on' then
    return new;
  end if;
  foreach c in array refund_columns loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'Refunds are changed only through Weather refunds in Booking Management.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists bookings_guard_refund_columns on public.bookings;
create trigger bookings_guard_refund_columns before update on public.bookings
  for each row execute function public.bookings_guard_refund_columns();

-- ── 5. Refund history ──
-- (booking_id has the same type as bookings.id, whatever it is in your database.)
do $$
begin
  execute format($t$
    create table if not exists public.refund_log (
      id bigserial primary key,
      booking_id %s,
      booking_number text,
      action text not null,       -- prepared | sent | failed | received | not_received | returned | reopened | paymongo_succeeded
      amount numeric,
      method text,                -- paymongo | gcash
      reference text,
      proof text,
      by_user uuid,
      by_name text,
      note text,
      created_at timestamptz not null default now()
    )$t$,
    (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
      where a.attrelid = 'public.bookings'::regclass and a.attname = 'id'));
end;
$$;
create index if not exists refund_log_booking_idx on public.refund_log (booking_id, created_at);
alter table public.refund_log enable row level security;

drop policy if exists "refund_log_main_admin_reads" on public.refund_log;
create policy "refund_log_main_admin_reads" on public.refund_log
  for select to authenticated using (public.is_main_admin());
-- (No insert/update/delete policies: rows are only added by the functions below.)
revoke insert, update, delete, truncate on public.refund_log from anon, authenticated;

-- Nobody changes or deletes history, not even the database's own service key.
create or replace function public.refund_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The refund history can''t be changed or deleted.';
end;
$$;
drop trigger if exists refund_log_append_only on public.refund_log;
create trigger refund_log_append_only before update or delete on public.refund_log
  for each row execute function public.refund_log_is_append_only();
drop trigger if exists refund_log_no_truncate on public.refund_log;
create trigger refund_log_no_truncate before truncate on public.refund_log
  for each statement execute function public.refund_log_is_append_only();

-- Adds a history row (used by the functions here and by the payments function).
create or replace function public.log_refund(
  p_booking_id public.bookings.id%type, p_action text, p_amount numeric default null, p_method text default null,
  p_reference text default null, p_proof text default null, p_by uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := (select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Someone')
               from public.profiles p where p.id = p_by);
  insert into public.refund_log (booking_id, booking_number, action, amount, method, reference, proof, by_user, by_name, note)
  values (p_booking_id, (select b.booking_number from public.bookings b where b.id = p_booking_id),
          p_action, p_amount, p_method, nullif(btrim(coalesce(p_reference, '')), ''), p_proof, p_by,
          case when p_by is null then 'PayMongo' else coalesce(v_name, 'Someone') end, p_note);
end;
$$;
revoke all on function public.log_refund(public.bookings.id%type, text, numeric, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.log_refund(public.bookings.id%type, text, numeric, text, text, text, uuid, text) to service_role;

-- ── 2. GCash receipt screenshots (private) ──
insert into storage.buckets (id, name, public) values ('refund-proofs', 'refund-proofs', false)
on conflict (id) do nothing;

drop policy if exists "refund_proofs_admin_upload" on storage.objects;
create policy "refund_proofs_admin_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'refund-proofs' and public.is_admin());

drop policy if exists "refund_proofs_admin_or_joiner_read" on storage.objects;
create policy "refund_proofs_admin_or_joiner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'refund-proofs'
    and (public.is_admin()
         or exists (select 1 from public.bookings b
                     where b.id::text = (storage.foldername(name))[1] and b.user_id = auth.uid()))
  );

-- ── 1. Prepare (any admin) ──
-- p_method 'paymongo': the main admin sends it through PayMongo after approving.
-- p_method 'gcash': the money was sent by GCash; the reference and the
-- screenshot (uploaded to refund-proofs/<booking id>/…) are required.
create or replace function public.prepare_weather_refund(
  p_booking_id public.bookings.id%type, p_method text, p_reference text default null, p_proof text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := (select weather_refund_status from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_paymongo text := (select paymongo_payment_id from public.bookings where id = p_booking_id);
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'Only admins can do this.'; end if;
  if v_status is distinct from 'Due' then raise exception 'This refund isn''t waiting to be sent.'; end if;
  if p_method not in ('paymongo', 'gcash') then raise exception 'Choose PayMongo or GCash.'; end if;
  if p_method = 'paymongo' and v_paymongo is null then
    raise exception 'This booking wasn''t paid through PayMongo. Send it by GCash instead.';
  end if;
  if p_method = 'gcash' then
    if v_ref is null or length(v_ref) < 6 then raise exception 'Type the GCash reference number of the refund.'; end if;
    if p_proof is null or split_part(p_proof, '/', 1) <> p_booking_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'refund-proofs' and o.name = p_proof) then
      raise exception 'Upload a screenshot of the GCash receipt first.';
    end if;
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_method = p_method,
         -- (PayMongo refund ids already there, e.g. a part refund, are kept for the record.)
         weather_refund_ref = case when p_method <> 'gcash' then weather_refund_ref
                                   when weather_refund_ref ~ 'ref_[A-Za-z0-9]+' then regexp_replace(weather_refund_ref, ' \+ GCash .*$', '') || ' + GCash ' || v_ref
                                   else 'GCash ' || v_ref end,
         weather_refund_proof = case when p_method = 'gcash' then p_proof else null end,
         weather_refund_prepared_by = auth.uid(), weather_refund_prepared_at = now()
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'prepared', v_amount, p_method, v_ref, case when p_method = 'gcash' then p_proof end, auth.uid(), null);

  -- The main admin is asked to approve (unless they prepared it themselves).
  if not public.is_main_admin() then
    insert into public.notifications (user_id, title, message, type, related_id)
    select m.id, 'A refund is waiting for your approval 💸',
           format('%s prepared the %s refund for %s (%s). Approve it in Booking Management → Weather refunds.',
                  coalesce(public.admin_display_name(auth.uid()), 'An admin'), '₱' || to_char(v_amount, 'FM999,999,990.00'), v_number,
                  case when p_method = 'gcash' then 'GCash, with receipt' else 'PayMongo' end),
           'booking', null::uuid
      from public.profiles m where m.role = 'admin' and m.is_main_admin;
  end if;
end;
$$;

-- Main admin: send a prepared refund back (e.g. a wrong screenshot) to be prepared again.
create or replace function public.return_weather_refund(p_booking_id public.bookings.id%type, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prep uuid := (select weather_refund_prepared_by from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can do this.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Due' then
    raise exception 'This refund isn''t waiting to be sent.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_method = null, weather_refund_proof = null, weather_refund_prepared_by = null, weather_refund_prepared_at = null,
         weather_refund_ref = case when weather_refund_ref ilike 'GCash %' then null else regexp_replace(weather_refund_ref, ' \+ GCash .*$', '') end
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'returned', null, null, null, null, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
  if v_prep is not null and v_prep <> auth.uid() then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_prep, 'A refund was sent back to you',
            format('The main admin sent back the refund for %s%s. Please check it and prepare it again.', v_number,
                   case when btrim(coalesce(p_note, '')) <> '' then ': ' || btrim(p_note) else '' end),
            'booking', null::uuid);
  end if;
end;
$$;

-- ── 1+2. Approve a GCash refund (main admin only; needs the receipt screenshot) ──
-- (Same name as before, so older screens still reach it; now main admin only.)
create or replace function public.mark_weather_refund_sent(p_booking_id public.bookings.id%type, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_method text := (select weather_refund_method from public.bookings where id = p_booking_id);
  v_proof text := (select weather_refund_proof from public.bookings where id = p_booking_id);
  v_ref text := (select weather_refund_ref from public.bookings where id = p_booking_id);
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can send refunds.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Due' then
    raise exception 'This refund isn''t waiting to be sent.';
  end if;
  if v_method is distinct from 'gcash' or v_proof is null then
    raise exception 'Prepare it first with the GCash reference and a screenshot of the GCash receipt.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_status = 'Sent', weather_refund_at = now(),
         weather_refund_received = null, weather_refund_received_at = null
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'sent', v_amount, 'gcash', v_ref, v_proof, auth.uid(), null);
  if v_user is not null then
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_user, 'Refund sent 💸',
            format('Your 50%% refund of %s for %s was sent by GCash (%s). See the receipt in My Bookings, and tap "I received it" once it''s in your GCash.',
                   '₱' || to_char(v_amount, 'FM999,999,990.00'), v_number, coalesce(v_ref, 'GCash')),
            'booking', null::uuid);
  end if;
end;
$$;

-- ── 3. The joiner confirms ──
create or replace function public.confirm_weather_refund(p_booking_id public.bookings.id%type, p_received boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := (select user_id from public.bookings where id = p_booking_id);
  v_amount numeric := (select weather_refund from public.bookings where id = p_booking_id);
  v_number text := (select booking_number from public.bookings where id = p_booking_id);
  v_method text := (select weather_refund_method from public.bookings where id = p_booking_id);
  v_before text := (select weather_refund_received from public.bookings where id = p_booking_id);
begin
  if v_owner is distinct from auth.uid() then raise exception 'This isn''t your booking.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Sent' then
    raise exception 'This refund hasn''t been sent yet.';
  end if;
  if v_before is not distinct from (case when p_received then 'received' else 'not_received' end) then
    return; -- already said so
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_received = case when p_received then 'received' else 'not_received' end,
         weather_refund_received_at = now()
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, case when p_received then 'received' else 'not_received' end, v_amount, v_method, null, null, auth.uid(), null);

  insert into public.notifications (user_id, title, message, type, related_id)
  select m.id,
         case when p_received then 'Refund received ✅' else 'A joiner didn''t get their refund ⚠️' end,
         case when p_received
              then format('The joiner of %s confirmed they received their %s refund.', v_number, '₱' || to_char(v_amount, 'FM999,999,990.00'))
              else format('The joiner of %s says they didn''t get their %s refund. Check the receipt or PayMongo in Booking Management → Weather refunds, and send it again if needed.',
                          v_number, '₱' || to_char(v_amount, 'FM999,999,990.00')) end,
         'booking', null::uuid
    from public.profiles m where m.role = 'admin' and m.is_main_admin;
end;
$$;

-- Main admin: a refund the joiner didn't get goes back to "to send".
-- (A PayMongo refund sent again counts what PayMongo already refunded, so
-- it's never paid twice; for GCash, check the receipt first.)
create or replace function public.reopen_weather_refund(p_booking_id public.bookings.id%type, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_main_admin() then raise exception 'Only the main admin can do this.'; end if;
  if (select weather_refund_status from public.bookings where id = p_booking_id) is distinct from 'Sent' then
    raise exception 'This refund isn''t marked as sent.';
  end if;
  perform set_config('app.trusted_booking_write', 'on', true);
  update public.bookings
     set weather_refund_status = 'Due', weather_refund_method = null, weather_refund_proof = null,
         weather_refund_prepared_by = null, weather_refund_prepared_at = null,
         weather_refund_received = null, weather_refund_received_at = null,
         weather_refund_ref = case when weather_refund_ref is null then null else weather_refund_ref || ' · reopened' end
   where id = p_booking_id;
  perform public.log_refund(p_booking_id, 'reopened', null, null, null, null, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

revoke all on function public.prepare_weather_refund(public.bookings.id%type, text, text, text) from public, anon;
revoke all on function public.return_weather_refund(public.bookings.id%type, text) from public, anon;
revoke all on function public.mark_weather_refund_sent(public.bookings.id%type, text) from public, anon;
revoke all on function public.confirm_weather_refund(public.bookings.id%type, boolean) from public, anon;
revoke all on function public.reopen_weather_refund(public.bookings.id%type, text) from public, anon;
grant execute on function public.prepare_weather_refund(public.bookings.id%type, text, text, text) to authenticated;
grant execute on function public.return_weather_refund(public.bookings.id%type, text) to authenticated;
grant execute on function public.mark_weather_refund_sent(public.bookings.id%type, text) to authenticated;
grant execute on function public.confirm_weather_refund(public.bookings.id%type, boolean) to authenticated;
grant execute on function public.reopen_weather_refund(public.bookings.id%type, text) to authenticated;
