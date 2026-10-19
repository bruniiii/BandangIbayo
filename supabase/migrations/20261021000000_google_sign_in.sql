-- ─────────────────────────────────────────────
-- Sign in with Google
--
-- A Google account arrives with only a name, email and photo. Before using
-- the dashboard, the joiner fills in the rest of the registration form
-- (username, phone, birthday, address, emergency contact) on
-- /complete-profile, which saves it through complete_my_profile().
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────

-- Columns the registration form fills in (most already exist).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists middle_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists suffix text;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists emergency_contact_number text;
alter table public.profiles add column if not exists avatar_url text;

-- Saves the signed-in user's own profile (creating the row if the sign-up
-- trigger didn't). Only these fields can be set; the role is never touched
-- (new rows start as 'joiner', see profiles_guard_role). Usernames stay unique.
create or replace function public.complete_my_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
  v_email text;
  v_username text := nullif(trim(p->>'username'), '');
begin
  if v_id is null then
    raise exception 'Please log in first.';
  end if;
  if v_username is null or nullif(trim(p->>'first_name'), '') is null or nullif(trim(p->>'last_name'), '') is null
     or nullif(trim(p->>'phone_number'), '') is null then
    raise exception 'Please fill in your username, name and phone number.';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username) and id <> v_id) then
    raise exception 'That username is already taken. Please choose another one.';
  end if;

  select email into v_email from auth.users where id = v_id;

  insert into public.profiles as pr (
    id, email, username, first_name, middle_name, last_name, suffix, phone_number, date_of_birth,
    address, province, city_municipality, barangay, street,
    emergency_contact_name, emergency_contact_number, avatar_url
  ) values (
    v_id, lower(v_email), v_username,
    trim(p->>'first_name'), nullif(trim(p->>'middle_name'), ''), trim(p->>'last_name'), nullif(trim(p->>'suffix'), ''),
    trim(p->>'phone_number'), nullif(p->>'date_of_birth', '')::date,
    nullif(trim(p->>'address'), ''), nullif(trim(p->>'province'), ''), nullif(trim(p->>'city_municipality'), ''),
    nullif(trim(p->>'barangay'), ''), nullif(trim(p->>'street'), ''),
    nullif(trim(p->>'emergency_contact_name'), ''), nullif(trim(p->>'emergency_contact_number'), ''),
    nullif(p->>'avatar_url', '')
  )
  on conflict (id) do update set
    email = coalesce(pr.email, excluded.email),
    username = excluded.username,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    suffix = excluded.suffix,
    phone_number = excluded.phone_number,
    date_of_birth = excluded.date_of_birth,
    address = excluded.address,
    province = excluded.province,
    city_municipality = excluded.city_municipality,
    barangay = excluded.barangay,
    street = excluded.street,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_number = excluded.emergency_contact_number,
    avatar_url = coalesce(excluded.avatar_url, pr.avatar_url);
end;
$$;

revoke all on function public.complete_my_profile(jsonb) from public, anon;
grant execute on function public.complete_my_profile(jsonb) to authenticated;
