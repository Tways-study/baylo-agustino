-- supabase/tests/phase2_listings_rls.sql
-- Assertions: 28 (plan must match exactly). Tests 1-22 predate the
-- two-identity functional-proof convention established from
-- phase4_offers_rls.sql onward; the block-hides-listing invariant (line
-- 110-115 below) was only ever proven by regex-matching the policy's SQL
-- text. The Phase 8 RLS-audit backfill (tests 23-28, appended near the end
-- of this file) adds real two-session functional coverage for draft-listing
-- visibility, listing_images/listing_wants following their parent's
-- visibility, and an actual block hiding an active listing.
begin;
select plan(28);

-- ─── Read grants ───
-- has_table_privilege/has_function_privilege are native Postgres functions
-- with no description argument — pgTAP's assertion is ok(), not a 4th
-- positional arg. A bare 4-arg call errors "function ... does not exist"
-- instead of producing a TAP result; every call below is wrapped in ok().
select ok(has_table_privilege('authenticated', 'public.listings', 'SELECT'),
  'authenticated has SELECT on listings');
select ok(has_table_privilege('authenticated', 'public.listing_images', 'SELECT'),
  'authenticated has SELECT on listing_images');
select ok(has_table_privilege('authenticated', 'public.listing_wants', 'SELECT'),
  'authenticated has SELECT on listing_wants');
select ok(has_table_privilege('authenticated', 'public.categories', 'SELECT'),
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
select ok(has_function_privilege('authenticated',
  'public.create_listing(uuid, public.listing_intent, text, text, smallint, text, integer, boolean, smallint, text[], text[], integer)',
  'EXECUTE'), 'authenticated can call create_listing');
select ok(has_function_privilege('authenticated',
  'public.bump_listing(uuid)', 'EXECUTE'), 'authenticated can call bump_listing');
select ok(has_function_privilege('authenticated',
  'public.archive_listing(uuid)', 'EXECUTE'), 'authenticated can call archive_listing');

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

-- ─── listings policy uses is_blocked_by(), not a raw blocks subquery ───────
-- See supabase/tests/phase1_rls.sql for why the raw form silently does
-- nothing: blocks' own RLS hides the block row from the blocked party, so
-- an inline `exists (select 1 from blocks where ...)` evaluated as that
-- party sees zero rows regardless of whether a block exists. Found live
-- against a hosted project during Phase 2 verification (a blocked user
-- could still read the blocker's active listing) and fixed by routing
-- through the SECURITY DEFINER helper instead.
select matches(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'listings'
   and policyname = 'listings readable by verified members'),
  'is_blocked_by',
  'listings SELECT policy calls is_blocked_by(), not a blocks subquery that RLS would silently hide'
);

-- ═══ functional RLS (Phase 8 audit backfill) ═══
-- Fixtures: a draft listing owned by 1111, an active listing owned by 2222,
-- plus one image and one want on the draft — direct inserts as the
-- unrestricted test-runner role (authenticated has zero direct INSERT on
-- any of these three tables, per the revokes above).
insert into public.listings (id, code, owner_id, intent, title, status)
values
  ('88888888-8888-8888-8888-888888888201'::uuid, 'BA-9201',
   '11111111-1111-1111-1111-111111111111'::uuid, 'give', 'Fixture draft listing', 'draft'),
  ('88888888-8888-8888-8888-888888888202'::uuid, 'BA-9202',
   '22222222-2222-2222-2222-222222222222'::uuid, 'give', 'Fixture active listing owned by 2222', 'active');

insert into public.listing_images (listing_id, storage_path, position)
values ('88888888-8888-8888-8888-888888888201'::uuid, '11111111-1111-1111-1111-111111111111/fixture.jpg', 0);

insert into public.listing_wants (listing_id, label, position)
values ('88888888-8888-8888-8888-888888888201'::uuid, 'Anything useful', 0);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.listings where id = '88888888-8888-8888-8888-888888888201'::uuid),
  1,
  'the owner can see their own draft listing'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.listings where id = '88888888-8888-8888-8888-888888888201'::uuid),
  0,
  'a draft listing is invisible to a non-owner'
);
select is(
  (select count(*)::int from public.listing_images where listing_id = '88888888-8888-8888-8888-888888888201'::uuid),
  0,
  'listing_images of a draft listing are invisible to a non-owner (visibility follows the parent listing)'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.listing_images where listing_id = '88888888-8888-8888-8888-888888888201'::uuid),
  1,
  'the owner can see their own draft listing''s images'
);
select is(
  (select count(*)::int from public.listing_wants where listing_id = '88888888-8888-8888-8888-888888888201'::uuid),
  1,
  'the owner can see their own draft listing''s wants'
);

-- Block hides an otherwise-visible active listing — the real query-level
-- proof that the "is_blocked_by(), not a raw subquery" assertion above only
-- proved by matching policy text. reset role for the direct blocks insert
-- (blocks has zero direct grant for authenticated beyond its own RLS-scoped
-- policy, and inserting as 2222 here isn't the point of this assertion).
reset role;
insert into public.blocks (blocker_id, blocked_id) values (
  '22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid
);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.listings where id = '88888888-8888-8888-8888-888888888202'::uuid),
  0,
  'a block hides the blocker''s active listing from the blocked user'
);

reset role;
select * from finish();
rollback;

-- Note: the deferred swap-requires-want constraint trigger is NOT covered
-- here — pgTAP wraps this file in begin;/rollback; and a deferred constraint
-- only fires at COMMIT, which never happens in this transaction. Primary
-- coverage for that invariant is e2e/swap-requires-want.spec.ts, which does
-- a real commit through the actual app flow.
