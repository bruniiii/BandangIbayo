-- ─────────────────────────────────────────────
-- Promo codes removed (the admin asked to take them out). Takes away what
-- 20270104000000_admin_extras.sql added for them: the list, the checks the
-- booking window and payments function used, and the two booking columns
-- (kept if any booking already used a code, so no discount record is lost).
-- Safe to run more than once.
-- ─────────────────────────────────────────────

drop function if exists public.check_promo_code(text, bigint, int);
drop function if exists public.apply_promo_code(bigint, uuid, text);
drop function if exists public.promo_check(text, bigint, int, uuid, bigint);
drop table if exists public.promo_codes;
drop function if exists public.promo_codes_touch();
drop function if exists public.promo_codes_upper();

do $$
declare
  v_used boolean;
begin
  -- Separate steps: the column may already be gone (run before).
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'promo_code') then
    execute 'select exists (select 1 from public.bookings where promo_code is not null)' into v_used;
    if not v_used then
      alter table public.bookings drop column promo_code;
      alter table public.bookings drop column if exists promo_discount;
    end if;
  end if;
end $$;
