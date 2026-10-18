-- ─────────────────────────────────────────────
-- Undo: Sign in with Google (removed from the website)
--
-- Only for databases where 20261021000000_google_sign_in.sql was run.
-- Removes the complete_my_profile() function it added. The profile columns
-- it listed are kept on purpose: they already existed (the registration
-- form fills them in), so dropping them would delete joiners' data.
--
-- Safe to run more than once, and harmless if the Google SQL was never run.
-- ─────────────────────────────────────────────

drop function if exists public.complete_my_profile(jsonb);
