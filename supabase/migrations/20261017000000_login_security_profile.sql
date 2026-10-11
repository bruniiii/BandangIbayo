-- ─────────────────────────────────────────────
-- Login security, address fields, no deleting reviews/comments, prices
--
--  1. Login lockout (3 wrong passwords → 15 minutes) and emailed login codes.
--     Both tables are used only by the `auth` Edge Function (service role);
--     RLS is on with no policies, so the website can't read or change them.
--  2. Address split into province, city/municipality and street.
--  3. Nobody (joiner or admin) can delete a review or a feed comment. Deleting
--     an account keeps them, without the author.
--  4. Prices: never negative, centavos allowed.
-- ─────────────────────────────────────────────

-- 1. Login lockout and codes ───────────────────
create table if not exists public.login_lockouts (
  email        text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists public.login_challenges (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  resends      integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists login_challenges_user_id_idx on public.login_challenges (user_id);

alter table public.login_lockouts enable row level security;
alter table public.login_challenges enable row level security;
revoke all on public.login_lockouts from anon, authenticated;
revoke all on public.login_challenges from anon, authenticated;

-- 2. Address fields ────────────────────────────
alter table public.profiles add column if not exists province text;
alter table public.profiles add column if not exists city_municipality text;
alter table public.profiles add column if not exists street text;

-- The sign-up form sends these in the account's metadata. Whatever trigger
-- creates the profile row, this fills them in as the row is inserted (plus
-- the combined address, if that trigger didn't copy it).
create or replace function public.profiles_fill_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
begin
  select raw_user_meta_data into v_meta from auth.users where id = new.id;
  if v_meta is null then
    return new;
  end if;
  new.province          := coalesce(new.province, nullif(trim(v_meta ->> 'province'), ''));
  new.city_municipality := coalesce(new.city_municipality, nullif(trim(v_meta ->> 'city_municipality'), ''));
  new.street            := coalesce(new.street, nullif(trim(v_meta ->> 'street'), ''));
  if coalesce(trim(new.address), '') = '' then
    new.address := nullif(concat_ws(', ', new.street, new.city_municipality, new.province), '');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_fill_address on public.profiles;
create trigger profiles_fill_address
  before insert on public.profiles
  for each row execute function public.profiles_fill_address();

-- 3. No deleting reviews or comments ───────────
drop policy if exists "reviews_delete_own_or_admin" on public.reviews;
drop policy if exists "comments_delete_own_or_admin" on public.feed_comments;
revoke delete on public.reviews from anon, authenticated;
revoke delete on public.feed_comments from anon, authenticated;

-- Reviews and comments outlive a deleted account (author removed).
alter table public.reviews alter column user_id drop not null;
alter table public.feed_comments alter column user_id drop not null;

do $$
declare
  t text;
  c record;
begin
  foreach t in array array['reviews', 'feed_comments'] loop
    for c in
      select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      where con.conrelid = format('public.%I', t)::regclass
        and con.contype = 'f'
        and a.attname = 'user_id'
        and pg_get_constraintdef(con.oid) not ilike '%on delete set null%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
      execute format('alter table public.%I add constraint %I %s on delete set null',
                     t, c.conname, regexp_replace(c.def, '\s+on delete (no action|restrict|cascade|set null|set default)', '', 'i'));
    end loop;
  end loop;
end;
$$;

-- Same as before, except reviews and comments are kept without the author.
create or replace function public.purge_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'Asia/Manila')::date;
  v_receipts  text[];
  v_bookings  bigint;
  personal    constant text[] := array[
    'full_name', 'email', 'contact_number', 'gcash_number', 'gcash_reference_no',
    'receipt_url', 'companions', 'cancellation_reason'
  ];
begin
  if p_user_id is null then
    raise exception 'Missing user.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
    raise exception 'Admin accounts can''t be deleted here.';
  end if;

  if exists (
    select 1 from public.bookings b join public.tours t on t.id = b.tour_id
    where b.user_id = p_user_id
      and b.booking_status not in ('Cancelled', 'Rejected')
      and coalesce(t.end_date, t.start_date) >= v_today
  ) then
    raise exception 'You still have an upcoming booking. Cancel it first (or contact us), then delete your account.';
  end if;

  select array_agg(receipt_url) filter (where receipt_url is not null), count(*)
    into v_receipts, v_bookings
  from public.bookings where user_id = p_user_id;

  -- Activity history: drop personal values and the user's name.
  update public.booking_activity
  set changes = changes - personal
  where booking_id in (select id from public.bookings where user_id = p_user_id);
  update public.booking_activity
  set actor_id = null, actor_name = 'Deleted account'
  where actor_id = p_user_id;

  -- Keep the booking (amounts, dates) for the agency's records, without personal details.
  perform set_config('app.skip_activity_log', 'on', true);
  update public.bookings
  set full_name = 'Deleted account', email = 'N/A', contact_number = 'N/A',
      gcash_number = null, gcash_reference_no = null, receipt_url = null,
      companions = '[]'::jsonb, cancellation_reason = null, user_id = null
  where user_id = p_user_id;
  perform set_config('app.skip_activity_log', 'off', true);

  delete from public.tour_waitlist where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.feed_reactions where user_id = p_user_id;
  -- Reviews and comments can't be deleted; they stay, shown as "Deleted account".
  update public.feed_comments set user_id = null where user_id = p_user_id;
  update public.reviews set user_id = null where user_id = p_user_id;
  delete from public.exclusive_requests where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;

  return jsonb_build_object('receipts', coalesce(to_jsonb(v_receipts), '[]'::jsonb), 'bookings_kept', v_bookings);
end;
$$;

revoke all on function public.purge_user_data from public, anon, authenticated;
grant execute on function public.purge_user_data to service_role;

-- 4. Prices ────────────────────────────────────
-- Whole-number money columns become numeric(12,2) so centavos are kept.
do $$
declare
  c record;
begin
  for c in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (('tours', 'price'), ('bookings', 'total_price'), ('bookings', 'amount_paid'))
      and data_type in ('smallint', 'integer', 'bigint', 'real', 'double precision')
  loop
    begin
      execute format('alter table public.%I alter column %I type numeric(12,2)', c.table_name, c.column_name);
    exception when others then
      raise notice 'Could not change %.% to numeric(12,2): %', c.table_name, c.column_name, sqlerrm;
    end;
  end loop;
end;
$$;

-- No negative prices. Checked for new and changed tours; an old negative
-- price (if any) is reported instead of failing the migration.
alter table public.tours drop constraint if exists tours_price_not_negative;
alter table public.tours add constraint tours_price_not_negative check (price >= 0) not valid;
do $$
begin
  alter table public.tours validate constraint tours_price_not_negative;
exception when check_violation then
  raise notice 'Some existing tours have a negative price; fix them in Tour Management.';
end;
$$;
