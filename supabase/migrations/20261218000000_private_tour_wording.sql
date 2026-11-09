-- ─────────────────────────────────────────────
-- "Exclusive Tour" is now called "Private Tour" everywhere people can see it
--
-- Rewrites the wording of the messages and notifications made by the
-- database (e.g. "Exclusive Tour Update" → "Private Tour Update",
-- "the exclusive tour to Bolinao" → "the private tour to Bolinao"). Only
-- words with a space are changed; table, column and value names (like
-- request_type = 'exclusive') stay the same, so nothing else changes.
-- Notifications already sent keep their old wording.
--
-- Run after 20261217000000_drivers_vans.sql. Safe to run more than once.
-- ─────────────────────────────────────────────

do $$
declare
  f   record;
  def text;
  fixed text;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prosrc ~ '([Ee]xclusive (tour|Tour|request|Request)|EXCLUSIVE TOUR)'
  loop
    def := pg_get_functiondef(f.oid);
    fixed := def;
    fixed := replace(fixed, 'an exclusive tour', 'a private tour');
    fixed := replace(fixed, 'An exclusive tour', 'A private tour');
    fixed := replace(fixed, 'Exclusive Tours', 'Private Tours');
    fixed := replace(fixed, 'Exclusive Tour', 'Private Tour');
    fixed := replace(fixed, 'Exclusive tours', 'Private tours');
    fixed := replace(fixed, 'Exclusive tour', 'Private tour');
    fixed := replace(fixed, 'exclusive tours', 'private tours');
    fixed := replace(fixed, 'exclusive tour', 'private tour');
    fixed := replace(fixed, 'Exclusive request', 'Private tour request');
    fixed := replace(fixed, 'exclusive request', 'private tour request');
    fixed := replace(fixed, 'EXCLUSIVE TOUR', 'PRIVATE TOUR');
    if fixed is distinct from def then
      execute fixed;
    end if;
  end loop;
end;
$$;
