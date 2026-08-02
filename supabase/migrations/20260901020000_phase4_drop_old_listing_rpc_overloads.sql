-- supabase/migrations/20260901020000_phase4_drop_old_listing_rpc_overloads.sql
-- The prior migration (20260901010000) added p_estimated_value_centavos as a
-- new trailing parameter to create_listing/update_listing via
-- `create or replace function`. Contrary to expectation, Postgres treats a
-- changed argument list as a distinct function even when OR REPLACE is used
-- and the new parameter has a DEFAULT — it does not replace the original
-- function in place, it creates a second overload alongside it. Verified
-- live: both the old and new signatures existed simultaneously, both
-- GRANTed to `authenticated`.
--
-- Every other RPC in this codebase has exactly one signature. Two live
-- overloads is not the intended end state (and risks PostgREST ambiguity
-- errors down the line), so this migration drops the old-signature
-- versions, leaving only the one with p_estimated_value_centavos.

drop function if exists public.create_listing(
  uuid, public.listing_intent, text, text, smallint, text, integer, boolean,
  smallint, text[], text[]
);

drop function if exists public.update_listing(
  uuid, text, text, smallint, text, integer, boolean, smallint, text[]
);
