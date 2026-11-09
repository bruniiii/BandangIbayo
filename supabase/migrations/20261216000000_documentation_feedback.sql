-- ─────────────────────────────────────────────
-- Panel feedback (Documentation.docx)
--
--   1. Review replies: editable (shows "Edited"), no longer removable.
--
-- Run after 20261215000000_exclusive_rates_3k_100k.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Review replies: edit, don't remove ──
alter table public.reviews add column if not exists admin_reply_edited_at timestamptz;

create or replace function public.reviews_guard_admin_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.admin_reply end;
begin
  new.admin_reply := nullif(btrim(coalesce(new.admin_reply, '')), '');
  if new.admin_reply is distinct from v_old then
    if public.is_client_request() and not public.is_admin() then
      raise exception 'Only Bandang IBAYO can reply to reviews.';
    end if;
    if new.admin_reply is null and v_old is not null and public.is_client_request() then
      raise exception 'A reply can be edited but not removed.';
    end if;
    if length(new.admin_reply) > 500 then
      raise exception 'A reply can be at most 500 characters.';
    end if;
    if v_old is null then
      new.admin_reply_at := now();
      new.admin_reply_edited_at := null;
    else
      new.admin_reply_at := old.admin_reply_at;   -- first posted
      new.admin_reply_edited_at := now();         -- shows "Edited"
    end if;
  elsif tg_op = 'UPDATE' then
    new.admin_reply_at := old.admin_reply_at; -- only changes with the reply
    new.admin_reply_edited_at := old.admin_reply_edited_at;
  else
    new.admin_reply_at := null;
    new.admin_reply_edited_at := null;
  end if;
  return new;
end;
$$;

-- ── 2. Driver's license / ID and photo (Tracking → Fleet & Driver) ──
-- Kept apart from tour_vehicles (which joiners on the tour can read): only
-- admins can read or change these, and the pictures are in a private bucket.
create table if not exists public.driver_documents (
  tour_id      bigint primary key,
  license_path text,
  photo_path   text,
  updated_at   timestamptz not null default now()
);
do $$
begin
  -- tour_id: the same type as tours.id.
  if (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.driver_documents'::regclass and attname = 'tour_id')
     is distinct from (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.tours'::regclass and attname = 'id') then
    execute format('alter table public.driver_documents alter column tour_id type %s using tour_id::text::%s',
      (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.tours'::regclass and attname = 'id'),
      (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.tours'::regclass and attname = 'id'));
  end if;
end;
$$;
alter table public.driver_documents enable row level security;
drop policy if exists "driver_documents_admin" on public.driver_documents;
create policy "driver_documents_admin" on public.driver_documents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('driver-docs', 'driver-docs', false)
on conflict (id) do update set public = false;

drop policy if exists "driver_docs_admin_select" on storage.objects;
create policy "driver_docs_admin_select" on storage.objects
  for select to authenticated using (bucket_id = 'driver-docs' and public.is_admin());
drop policy if exists "driver_docs_admin_insert" on storage.objects;
create policy "driver_docs_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'driver-docs' and public.is_admin());
drop policy if exists "driver_docs_admin_update" on storage.objects;
create policy "driver_docs_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'driver-docs' and public.is_admin());

-- ── 3. Admins remove a joiner account (with a reason), and remove photos ──
-- A removed account is archived with archive_reason = 'removed': it can't log
-- in, and the joiner can't restore it themselves; an admin can restore it.
-- Bookings and payments stay on record.
alter table public.profiles add column if not exists removed_reason text;
alter table public.profiles add column if not exists removed_by uuid;

create or replace function public.admin_remove_joiner(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove accounts.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please write the reason (at least 5 characters).';
  end if;
  update public.profiles
     set archived_at = now(), archive_reason = 'removed',
         removed_reason = btrim(p_reason), removed_by = auth.uid()
   where id = p_id and coalesce(role, 'joiner') = 'joiner';
  if not found then
    raise exception 'That joiner account wasn''t found.';
  end if;
end;
$$;

create or replace function public.admin_restore_removed_joiner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore accounts.';
  end if;
  update public.profiles
     set archived_at = null, archive_reason = null, deactivated_at = null, removed_reason = null, removed_by = null
   where id = p_id and archive_reason = 'removed';
  if not found then
    raise exception 'That account isn''t removed.';
  end if;
  insert into public.notifications (user_id, title, message, type)
  values (p_id, 'Your account was restored', 'Welcome back! Your Bandang IBAYO account is active again.', 'account');
end;
$$;

-- A joiner can't bring back an account an admin removed.
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
  if exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'archived_admin')) then
    raise exception 'Admin accounts are restored by the main admin.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and archive_reason = 'removed') then
    raise exception 'This account was removed by Bandang IBAYO. Please message us if you think this is a mistake.';
  end if;
  update public.profiles
     set archived_at = null, archive_reason = null, deactivated_at = null
   where id = auth.uid() and archived_at is not null;
end;
$$;

-- Remove a joiner's profile photo that breaks the rules; they're told why.
create or replace function public.admin_remove_avatar(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove photos.';
  end if;
  update public.profiles set avatar_url = null where id = p_id and coalesce(role, 'joiner') = 'joiner';
  if not found then
    raise exception 'That joiner account wasn''t found.';
  end if;
  insert into public.notifications (user_id, title, message, type)
  values (p_id, 'Your profile photo was removed',
          'Bandang IBAYO removed your profile photo because it doesn''t follow the photo rules: '
          || coalesce(nullif(btrim(p_reason), ''), 'not appropriate') || '. You can upload another one in Profile Settings.', 'account');
end;
$$;

revoke all on function public.admin_remove_joiner(uuid, text) from public, anon;
grant execute on function public.admin_remove_joiner(uuid, text) to authenticated;
revoke all on function public.admin_restore_removed_joiner(uuid) from public, anon;
grant execute on function public.admin_restore_removed_joiner(uuid) to authenticated;
revoke all on function public.reactivate_my_account() from public, anon;
grant execute on function public.reactivate_my_account() to authenticated;
revoke all on function public.admin_remove_avatar(uuid, text) from public, anon;
grant execute on function public.admin_remove_avatar(uuid, text) to authenticated;

-- ── 4. Confirming a payment by hand needs the admin's password ──
-- The auth function checks the admin's password and hands back a one-time
-- pass (valid 3 minutes). admin_record_payment() uses it up and records the
-- payment. Marking a payment received any other way from the website is
-- refused. The main admin is told about every payment confirmed by hand.
create table if not exists public.admin_password_checks (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  used_at    timestamptz
);
alter table public.admin_password_checks enable row level security;
-- (No policies: only the auth function and admin_record_payment() use it.)

create or replace function public.payment_needs_password()
returns trigger
language plpgsql
as $$
declare
  v_paid boolean;
begin
  if not public.is_client_request() or coalesce(current_setting('app.payment_password_ok', true), '') = 'on' then
    return new;
  end if;
  if tg_table_name = 'bookings' then
    v_paid := (new.payment_status = 'Complete' and old.payment_status is distinct from 'Complete')
           or (coalesce(new.balance_settled, false) and not coalesce(old.balance_settled, false));
  else
    v_paid := (new.payment_status = 'Paid' and old.payment_status is distinct from 'Paid')
           or (coalesce(new.balance_settled, false) and not coalesce(old.balance_settled, false));
  end if;
  if v_paid then
    raise exception 'For security, confirm the payment with your password (refresh the page and try again).';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_payment_needs_password on public.bookings;
create trigger bookings_payment_needs_password
  before update on public.bookings
  for each row execute function public.payment_needs_password();
drop trigger if exists exclusive_payment_needs_password on public.exclusive_requests;
create trigger exclusive_payment_needs_password
  before update on public.exclusive_requests
  for each row execute function public.payment_needs_password();

create or replace function public.admin_record_payment(p_table text, p_id text, p_changes jsonb, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[];
  v_key     text;
  v_sets    text[] := '{}';
  v_name    text;
  v_label   text;
  v_mains   uuid[];
begin
  if not public.is_admin() then
    raise exception 'Only admins can confirm payments.';
  end if;
  v_allowed := case p_table
    when 'bookings' then array['booking_status', 'payment_status', 'balance_settled', 'balance_settled_at', 'amount_paid']
    when 'exclusive_requests' then array['payment_status', 'downpayment_amount', 'amount_paid', 'paid_at', 'balance_settled', 'balance_amount', 'balance_paid_at', 'updated_at']
  end;
  if v_allowed is null then
    raise exception 'Unknown payment.';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not v_key = any (v_allowed) then
      raise exception 'That change isn''t allowed here.';
    end if;
    v_sets := v_sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', v_key, p_table, v_key);
  end loop;
  if array_length(v_sets, 1) is null then
    raise exception 'Nothing to change.';
  end if;

  -- The one-time pass from the password check: this admin's, unused, not expired.
  update public.admin_password_checks
     set used_at = now()
   where id = p_token and admin_id = auth.uid() and used_at is null and expires_at > now();
  if not found then
    raise exception 'Your password check expired. Please confirm with your password again.';
  end if;

  perform set_config('app.trusted_booking_write', 'on', true);
  perform set_config('app.payment_password_ok', 'on', true);
  execute format('update public.%I set %s where id::text = $2', p_table, array_to_string(v_sets, ', ')) using p_changes, p_id;
  if not found then
    raise exception 'That payment wasn''t found.';
  end if;
  perform set_config('app.payment_password_ok', 'off', true);

  -- Tell the main admin(s) (in the app; the website also emails them).
  v_name := (select nullif(btrim(concat_ws(' ', first_name, last_name)), '') from public.profiles where id = auth.uid());
  v_label := case when p_table = 'bookings'
    then coalesce((select booking_number from public.bookings where id::text = p_id), 'a booking')
    else 'an exclusive tour request' end;
  v_mains := array(select id from public.profiles where is_main_admin and id <> auth.uid());
  insert into public.notifications (user_id, title, message, type)
  select m, 'Payment confirmed by hand',
         format('%s confirmed a payment for %s with their password (%s).', coalesce(v_name, 'An admin'), v_label,
                to_char(now() at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')),
         'payment_log'
    from unnest(v_mains) m;
  return jsonb_build_object('main_admin_ids', to_jsonb(v_mains), 'label', v_label);
end;
$$;

revoke all on function public.admin_record_payment(text, text, jsonb, uuid) from public, anon;
grant execute on function public.admin_record_payment(text, text, jsonb, uuid) to authenticated;

-- ── 5. Feed comments: the writer can edit their own (shows "Edited") ──
-- Still no deleting. Only the text can change.
alter table public.feed_comments add column if not exists edited_at timestamptz;

create or replace function public.feed_comments_guard_edit()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_request() then
    if old.user_id is distinct from auth.uid() then
      raise exception 'You can only edit your own comment.';
    end if;
    if new.user_id is distinct from old.user_id or new.post_id is distinct from old.post_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Only the comment''s text can be changed.';
    end if;
    if length(btrim(coalesce(new.content, ''))) = 0 then
      raise exception 'A comment can''t be empty.';
    end if;
    if length(new.content) > 500 then
      raise exception 'A comment can be at most 500 characters.';
    end if;
  end if;
  if new.content is distinct from old.content then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists feed_comments_guard_edit on public.feed_comments;
create trigger feed_comments_guard_edit
  before update on public.feed_comments
  for each row execute function public.feed_comments_guard_edit();

drop policy if exists "comments_update_own" on public.feed_comments;
create policy "comments_update_own" on public.feed_comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant update (content) on public.feed_comments to authenticated;

-- ── 6. Feedback survey: joiners rate the website, admins see the results ──
create table if not exists public.system_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  ease       smallint not null check (ease between 1 and 5),       -- easy to use
  booking    smallint not null check (booking between 1 and 5),    -- booking a tour
  payment    smallint not null check (payment between 1 and 5),    -- paying online
  tracking   smallint not null check (tracking between 1 and 5),   -- tracking and chat on tour day
  overall    smallint not null check (overall between 1 and 5),    -- overall satisfaction
  comment    text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.system_feedback enable row level security;
drop policy if exists "feedback_insert_own" on public.system_feedback;
create policy "feedback_insert_own" on public.system_feedback
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "feedback_read_own_or_admin" on public.system_feedback;
create policy "feedback_read_own_or_admin" on public.system_feedback
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
grant select, insert on public.system_feedback to authenticated;
