-- ─────────────────────────────────────────────
-- Cancellations need the agency's approval
--
-- A joiner no longer cancels a booking outright: they send a cancellation
-- request (with a reason, after agreeing that payments are non-refundable).
-- Their slots stay held until an admin approves it, which sets the booking to
-- Cancelled and frees the slots, or declines it, which keeps the booking.
-- A request nobody answers within 12 hours is approved automatically.
--
-- Also: notifications send their full row on delete, so the bell and the
-- Notification page notice deletions from realtime too.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.bookings add column if not exists cancellation_requested_at timestamptz;

create or replace function public.cancellation_approval_hours()
returns integer
language sql
immutable
as $$ select 12 $$;

-- Joiners may: update payment details, or ask to cancel (once). Admins and the
-- server may do anything (approve, decline, cancel).
create or replace function public.bookings_guard_joiner_update()
returns trigger
language plpgsql
as $$
declare
  joiner_editable constant text[] := array[
    'gcash_number', 'gcash_reference_no', 'receipt_url', 'payment_method',
    'amount_paid', 'payment_status', 'cancellation_reason', 'cancellation_requested_at', 'updated_at'
  ];
  v_start_date date;
begin
  -- Separate IFs: Postgres doesn't promise to skip the second half of an OR.
  if not public.is_client_request() then
    return new;
  end if;
  if coalesce(current_setting('app.trusted_booking_write', true), '') = 'on' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - joiner_editable) is distinct from (to_jsonb(old) - joiner_editable) then
    if new.booking_status = 'Cancelled' and old.booking_status is distinct from 'Cancelled' then
      raise exception 'Cancellations are approved by Bandang IBAYO. Please send a cancellation request instead.';
    end if;
    raise exception 'You can only update payment details or ask to cancel this booking.';
  end if;

  if new.payment_status is distinct from old.payment_status and new.payment_status <> 'Pending' then
    raise exception 'Payment status can only be changed by an admin.';
  end if;

  if old.booking_status in ('Cancelled', 'Rejected') and new is distinct from old then
    raise exception 'This booking is closed.';
  end if;

  if new.cancellation_requested_at is distinct from old.cancellation_requested_at then
    if old.cancellation_requested_at is not null or new.cancellation_requested_at is null then
      raise exception 'A cancellation request was already sent for this booking.';
    end if;
    select start_date into v_start_date from public.tours where id = old.tour_id;
    if v_start_date - (now() at time zone 'Asia/Manila')::date < public.cancellation_cutoff_days() then
      raise exception 'Cancellations are not accepted within % days of the tour date.', public.cancellation_cutoff_days();
    end if;
    if length(btrim(coalesce(new.cancellation_reason, ''))) < 5 then
      raise exception 'Please give a short reason for cancelling.';
    end if;
    new.cancellation_requested_at := now(); -- the server's clock, not the browser's
  end if;

  if new.payment_method is not null and new.payment_method not in ('Full Payment', 'Downpayment') then
    raise exception 'Invalid payment method.';
  end if;

  if new.amount_paid is not null and (new.amount_paid < 0 or new.amount_paid > coalesce(old.total_price, 0)) then
    raise exception 'Invalid payment amount.';
  end if;

  return new;
end;
$$;

-- Approves cancellation requests older than 12 hours: the booking is
-- cancelled (its slots free up) and the joiner and admins are told.
create or replace function public.approve_overdue_cancellations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b record;
  v_count integer := 0;
begin
  for v_b in
    update public.bookings b
       set booking_status = 'Cancelled'
     where b.cancellation_requested_at is not null
       and b.cancellation_requested_at < now() - make_interval(hours => public.cancellation_approval_hours())
       and b.booking_status not in ('Cancelled', 'Rejected')
    returning b.id, b.user_id, b.booking_number, b.tour_id
  loop
    v_count := v_count + 1;
    insert into public.notifications (user_id, title, message, type, related_id)
    values (v_b.user_id, 'Cancellation Approved',
            format('Your cancellation for booking %s has been approved, and your slot has been released.', v_b.booking_number),
            'cancellation', null);
    insert into public.notifications (user_id, title, message, type, related_id)
    select a.id, 'Cancellation Auto-Approved',
           format('No one answered the cancellation request for %s within %s hours, so it was approved and the slots were released.',
                  v_b.booking_number, public.cancellation_approval_hours()),
           'cancellation', null
    from public.profiles a where a.role = 'admin';
  end loop;
  return v_count;
end;
$$;

revoke all on function public.approve_overdue_cancellations() from public, anon, authenticated;

-- Check every 15 minutes when pg_cron is available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'approve-overdue-cancellations';
    perform cron.schedule('approve-overdue-cancellations', '*/15 * * * *', 'select public.approve_overdue_cancellations()');
  end if;
end;
$$;

-- Deleted notifications reach realtime listeners with their user_id.
alter table public.notifications replica identity full;
