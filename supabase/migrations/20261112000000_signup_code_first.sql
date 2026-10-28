-- ─────────────────────────────────────────────
-- Registration: the account is created only after the emailed code
--
-- signup_challenges holds a registration waiting for its 6-digit code (the
-- email, the profile details and the code's hash; never the password). The
-- auth function creates the account only when the right code is entered.
-- auth_account_for_email() lets the auth function see whether an email
-- already has an account without creating one.
-- Only the auth function (service role) can use either.
--
-- Run after 20261111000000_checkin_tour_day.sql. Safe to run more than once.
-- Then redeploy:  supabase functions deploy auth --no-verify-jwt
-- ─────────────────────────────────────────────

create table if not exists public.signup_challenges (
  id           uuid primary key,
  email        text not null,
  profile      jsonb not null default '{}'::jsonb,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  resends      integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists signup_challenges_email_idx on public.signup_challenges (email);

alter table public.signup_challenges enable row level security;
revoke all on public.signup_challenges from anon, authenticated;
grant all on public.signup_challenges to service_role;

create or replace function public.auth_account_for_email(p_email text)
returns table (id uuid, confirmed boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email_confirmed_at is not null
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1;
$$;

revoke all on function public.auth_account_for_email(text) from public, anon, authenticated;
grant execute on function public.auth_account_for_email(text) to service_role;
