-- supabase/tests/phase3_discovery_rls.sql
-- Assertions: 17 (plan must match exactly). Tests 1-9 only prove grants and
-- policy existence, never a real cross-user query. The Phase 8 RLS-audit
-- backfill (appended near the end of this file) adds functional two-session
-- coverage for saved_listings and search_events, following the convention
-- established from phase4_offers_rls.sql onward.
begin;
select plan(17);

select ok(
  exists(select 1 from pg_extension where extname = 'pg_trgm'),
  'pg_trgm extension is installed'
);

select ok(
  has_table_privilege('authenticated', 'public.saved_listings', 'SELECT'),
  'authenticated has SELECT on saved_listings'
);
select ok(
  has_table_privilege('authenticated', 'public.saved_listings', 'INSERT'),
  'authenticated has INSERT on saved_listings'
);
select ok(
  has_table_privilege('authenticated', 'public.saved_listings', 'DELETE'),
  'authenticated has DELETE on saved_listings'
);

select ok(
  has_table_privilege('authenticated', 'public.search_events', 'SELECT'),
  'authenticated has SELECT on search_events'
);
select ok(
  has_table_privilege('authenticated', 'public.search_events', 'INSERT'),
  'authenticated has INSERT on search_events'
);

select ok(
  has_function_privilege('authenticated', 'public.search_listings_fuzzy(text, integer)', 'EXECUTE'),
  'authenticated can call search_listings_fuzzy'
);

select ok(
  not (select prosecdef from pg_proc where proname = 'search_listings_fuzzy'),
  'search_listings_fuzzy is not SECURITY DEFINER — it must honor caller RLS'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'saved_listings'
      and policyname = 'users manage own saved listings'
  ),
  'saved_listings RLS policy exists'
);

-- ═══ functional RLS (Phase 8 audit backfill) ═══
-- Fixture listing — saved_listings.listing_id has a not-null FK into
-- listings, and none exists yet in this file's transaction (seed.sql seeds
-- profiles for 1111/2222 but no listings, per the same note in
-- phase4_offers_rls.sql's own fixtures section).
insert into public.listings (id, code, owner_id, intent, title, status)
values ('88888888-8888-8888-8888-888888888301'::uuid, 'BA-9301',
  '11111111-1111-1111-1111-111111111111'::uuid, 'give', 'Fixture listing for discovery RLS', 'active');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

select lives_ok(
  $$ insert into public.saved_listings (user_id, listing_id) values ('11111111-1111-1111-1111-111111111111'::uuid, '88888888-8888-8888-8888-888888888301'::uuid) $$,
  'a user can save a listing for themselves'
);
-- 4-arg throws_ok form deliberately — see phase4_offers_rls.sql's note on
-- why a bare 3-arg (sql, errcode, description) call resolves to the wrong
-- pgTAP overload.
select throws_ok(
  $$ insert into public.saved_listings (user_id, listing_id) values ('22222222-2222-2222-2222-222222222222'::uuid, '88888888-8888-8888-8888-888888888301'::uuid) $$,
  '42501', NULL,
  'a user cannot insert a saved_listings row naming someone else as user_id'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.saved_listings where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0,
  'a user cannot see another user''s saved_listings row'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.saved_listings where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'a user can see their own saved_listings row'
);

select lives_ok(
  $$ insert into public.search_events (user_id, query) values ('11111111-1111-1111-1111-111111111111'::uuid, 'calculator') $$,
  'a user can log their own search event'
);
select throws_ok(
  $$ insert into public.search_events (user_id, query) values ('22222222-2222-2222-2222-222222222222'::uuid, 'calculator') $$,
  '42501', NULL,
  'a user cannot insert a search_events row naming someone else as user_id'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.search_events where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0,
  'a user cannot see another user''s search_events row'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.search_events where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'a user can see their own search_events row'
);

reset role;
select * from finish();
rollback;
