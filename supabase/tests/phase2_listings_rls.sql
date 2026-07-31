-- supabase/tests/phase2_listings_rls.sql
begin;
select plan(20);

-- ─── Read grants ───
select has_table_privilege('authenticated', 'public.listings', 'SELECT',
  'authenticated has SELECT on listings');
select has_table_privilege('authenticated', 'public.listing_images', 'SELECT',
  'authenticated has SELECT on listing_images');
select has_table_privilege('authenticated', 'public.listing_wants', 'SELECT',
  'authenticated has SELECT on listing_wants');
select has_table_privilege('authenticated', 'public.categories', 'SELECT',
  'authenticated has SELECT on categories');

-- ─── Writes are revoked — everything goes through RPCs ───
select ok(not has_table_privilege('authenticated', 'public.listings', 'INSERT'),
  'authenticated cannot INSERT listings directly');
select ok(not has_table_privilege('authenticated', 'public.listings', 'UPDATE'),
  'authenticated cannot UPDATE listings directly');
select ok(not has_table_privilege('authenticated', 'public.listings', 'DELETE'),
  'authenticated cannot DELETE listings directly');
select ok(not has_table_privilege('authenticated', 'public.listing_images', 'INSERT'),
  'authenticated cannot INSERT listing_images directly');
select ok(not has_table_privilege('authenticated', 'public.listing_wants', 'INSERT'),
  'authenticated cannot INSERT listing_wants directly');

-- ─── RPC execute grants ───
select has_function_privilege('authenticated',
  'public.create_listing(uuid, public.listing_intent, text, text, smallint, text, integer, boolean, smallint, text[], text[])',
  'EXECUTE', 'authenticated can call create_listing');
select has_function_privilege('authenticated',
  'public.bump_listing(uuid)', 'EXECUTE', 'authenticated can call bump_listing');
select has_function_privilege('authenticated',
  'public.archive_listing(uuid)', 'EXECUTE', 'authenticated can call archive_listing');

-- ─── generate_listing_code(): format + monotonic ───
select matches(public.generate_listing_code(), '^BA-\d{4}$',
  'code matches BA-#### format');
select isnt(public.generate_listing_code(), public.generate_listing_code(),
  'two consecutive codes are distinct');

-- ─── create_listing() rejects an unauthenticated caller ───
-- In this pgTAP session auth.uid() is null (no JWT claim set), so this is a
-- real, not simulated, unauthenticated call.
select throws_ok(
  $$ select public.create_listing(
       gen_random_uuid(), 'give', 'Test item', null, null, null, null, false, null, null, null
     ) $$,
  'P0001', 'Not authenticated.',
  'create_listing rejects a session with no auth.uid()'
);

-- ─── CHECK constraints: sale requires price, give suppresses it ───
-- Requires the seed-owner profile row from supabase/seed.sql. Run as the
-- privileged test-runner role so the INSERT itself isn't blocked by the
-- authenticated-role revoke above.
select throws_ok(
  $$ insert into public.listings (owner_id, code, intent, title, status)
     select id, 'BA-9001', 'sale', 'No price sale', 'active'
     from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  null, null,
  'sale listing without ask_centavos violates sale_requires_price'
);

select throws_ok(
  $$ insert into public.listings (owner_id, code, intent, title, status, ask_centavos)
     select id, 'BA-9002', 'give', 'Priced give', 'active', 100
     from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  null, null,
  'give listing with ask_centavos violates give_suppresses_price'
);

-- ─── Storage policies exist ───
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'users write only into their own folder'
), 'listing-images insert policy exists');

select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'users update own listing images'
), 'listing-images update policy exists');

select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'users delete own listing images'
), 'listing-images delete policy exists');

select ok(exists(
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'listing images readable by authenticated'
), 'listing-images select policy exists');

select * from finish();
rollback;

-- Note: the deferred swap-requires-want constraint trigger is NOT covered
-- here — pgTAP wraps this file in begin;/rollback; and a deferred constraint
-- only fires at COMMIT, which never happens in this transaction. Primary
-- coverage for that invariant is e2e/swap-requires-want.spec.ts, which does
-- a real commit through the actual app flow.
