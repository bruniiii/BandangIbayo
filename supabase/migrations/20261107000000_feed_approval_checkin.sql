-- ─────────────────────────────────────────────
-- Community Feed: joiners can post (after an admin approves), and Check-in fixes
--
-- 1. feed_posts.status: 'Approved', 'Pending' or 'Rejected'. Admins' posts
--    (and the automatic "new tour" posts) are approved at once; a joiner's
--    post starts 'Pending' and only its author and admins see it until an
--    admin approves it. Admins are notified of new posts, and the joiner is
--    notified when their post is approved or rejected. Existing posts stay
--    approved.
--    Joiners upload feed photos into their own feed-media/<user id>/ folder.
-- 2. check_in_booking(): check-in opens the day before the tour (early
--    departures) and closes after its last day, and it also returns the
--    account holder's name for bookings saved without one.
--
-- Run after 20261106000000_exclusive_approval_expenses.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

-- ── 1. Feed approval ──────────────────────────
alter table public.feed_posts add column if not exists status text not null default 'Approved';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feed_posts_status_check') then
    alter table public.feed_posts
      add constraint feed_posts_status_check check (status in ('Pending', 'Approved', 'Rejected'));
  end if;
end;
$$;

-- What a joiner sends is always a plain post of their own, waiting for approval.
create or replace function public.feed_posts_guard()
returns trigger
language plpgsql
as $$
begin
  if not public.is_client_request() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.status := 'Pending';
    new.post_type := 'post';
    new.tour_id := null;
    return new;
  end if;
  raise exception 'Only Bandang IBAYO can change posts.';
end;
$$;

drop trigger if exists feed_posts_guard on public.feed_posts;
create trigger feed_posts_guard
  before insert or update on public.feed_posts
  for each row execute function public.feed_posts_guard();

-- Replace the old policies (they let only admins post).
do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'feed_posts' loop
    execute format('drop policy %I on public.feed_posts', p.policyname);
  end loop;
end;
$$;

alter table public.feed_posts enable row level security;
grant select on public.feed_posts to anon, authenticated;
grant insert, update, delete on public.feed_posts to authenticated;

create policy "feed_posts_read" on public.feed_posts
  for select to anon, authenticated
  using (status = 'Approved' or author_id = auth.uid() or public.is_admin());

create policy "feed_posts_insert_own" on public.feed_posts
  for insert to authenticated
  with check (author_id = auth.uid() or public.is_admin());

create policy "feed_posts_update_admin" on public.feed_posts
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "feed_posts_delete_own_or_admin" on public.feed_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Notifications: admins hear about new posts to review; joiners about the decision.
create or replace function public.feed_posts_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' and new.status = 'Pending' then
    select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') into v_name
      from public.profiles p where p.id = new.author_id;
    insert into public.notifications (user_id, title, message, type)
    select a.id, 'New post to review',
           format('%s shared a post on the Community Feed. Approve or reject it in Feed.', coalesce(v_name, 'A joiner')),
           'feed'
      from public.profiles a where a.role = 'admin';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and old.status = 'Pending'
        and new.author_id is not null then
    insert into public.notifications (user_id, title, message, type)
    values (new.author_id,
            case when new.status = 'Approved' then 'Your post is on the feed 🎉' else 'Your post was not approved' end,
            case when new.status = 'Approved'
                 then 'Bandang IBAYO approved your post. Everyone can see it on the Community Feed now.'
                 else 'Bandang IBAYO did not approve your post for the Community Feed.' end,
            'feed');
  end if;
  return new;
end;
$$;

drop trigger if exists feed_posts_notify on public.feed_posts;
create trigger feed_posts_notify
  after insert or update of status on public.feed_posts
  for each row execute function public.feed_posts_notify();

-- Feed photos: everyone uploads into their own feed-media/<user id>/ folder.
drop policy if exists "tours_bucket_insert" on storage.objects;
create policy "tours_bucket_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tours'
    and (
      public.is_admin()
      or ((storage.foldername(name))[1] in ('avatars', 'review-media', 'feed-media')
          and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

-- ── 2. Check-in ───────────────────────────────
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
  -- Open from the day before the tour until its last day.
  if p_mark and t.start_date is not null
     and (v_today < t.start_date - 1 or v_today > coalesce(t.end_date, t.start_date)) then
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
