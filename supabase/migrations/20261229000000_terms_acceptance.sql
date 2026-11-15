-- ─────────────────────────────────────────────
-- Which Terms & Conditions each joiner agreed to
--
-- profiles.terms_version / terms_accepted_at: the version of the Terms
-- (System Maintenance → Policies & Content) a joiner agreed to, and when.
--   • Registration records the current version (the auth function calls
--     record_terms_acceptance).
--   • When a newer version is published, joiners are asked to agree to it
--     the next time they open the website (accept_current_terms).
--   • Only these functions set the two fields (not the profile form).
--   • Joiners who registered before this update agreed to version 1 (the
--     text the website showed until now), on the day they registered.
--
-- Run after 20261228000000_maintenance_tabs.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

alter table public.profiles add column if not exists terms_version integer;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.current_terms_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$ select (select version from public.site_policies where slug = 'terms' and is_current) $$;
revoke all on function public.current_terms_version() from public;
grant execute on function public.current_terms_version() to anon, authenticated, service_role;

-- The two fields change only through the functions below.
create or replace function public.profiles_guard_terms()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_request()
     and coalesce(current_setting('app.terms_accept', true), '') <> 'on'
     and (new.terms_version is distinct from old.terms_version or new.terms_accepted_at is distinct from old.terms_accepted_at) then
    raise exception 'The Terms you agreed to can only be recorded by agreeing to them.';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_terms on public.profiles;
create trigger profiles_guard_terms before update on public.profiles
  for each row execute function public.profiles_guard_terms();

-- A joiner agrees to the current version.
create or replace function public.accept_current_terms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer := public.current_terms_version();
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if v is null then return null; end if;
  perform set_config('app.terms_accept', 'on', true);
  update public.profiles set terms_version = v, terms_accepted_at = now() where id = auth.uid();
  perform set_config('app.terms_accept', 'off', true);
  return v;
end;
$$;
revoke all on function public.accept_current_terms() from public;
grant execute on function public.accept_current_terms() to authenticated;

-- Registration (the auth function, with the service role key).
create or replace function public.record_terms_acceptance(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer := coalesce(public.current_terms_version(), 1);
begin
  update public.profiles set terms_version = v, terms_accepted_at = now() where id = p_user_id;
  return v;
end;
$$;
revoke all on function public.record_terms_acceptance(uuid) from public, anon, authenticated;
grant execute on function public.record_terms_acceptance(uuid) to service_role;

-- Joiners from before this update: version 1, when they registered.
do $$
begin
  perform set_config('app.terms_accept', 'on', true);
  update public.profiles
     set terms_version = 1, terms_accepted_at = coalesce(created_at, now())
   where terms_version is null
     and coalesce(role, 'joiner') = 'joiner'
     and created_at < now();
  perform set_config('app.terms_accept', 'off', true);
end;
$$;
