-- supabase/tests/phase4_offers_rls.sql
begin;
-- Brief specified plan(16), but the assertions below (8 privilege checks +
-- 9 functional assertions: unauth create_offer, ownership-trigger lives_ok +
-- throws_like, unique-index throws_ok, expiry lives_ok + is + ok, thread is,
-- notifications-RLS is) total 17. Corrected to match the actual count so
-- finish() doesn't report a planned/run mismatch.
select plan(17);

-- ═══ fixtures ═══
-- supabase/seed.sql seeds profile rows for 11111111.../22222222... but no
-- listings. The assertions below need at least one listing owned by each
-- fixture user, so we insert minimal ones directly here — same approach as
-- supabase/tests/phase2_listings_rls.sql (lines 57-75). They roll back with
-- the rest of this transaction, so this is safe and repeatable against the
-- live linked database.
insert into public.listings (id, code, owner_id, intent, title, status, ask_centavos)
values
  ('88888888-8888-8888-8888-888888888801'::uuid, 'BA-9101',
   '11111111-1111-1111-1111-111111111111'::uuid, 'sale', 'Fixture listing owned by user1', 'active', 5000),
  ('88888888-8888-8888-8888-888888888802'::uuid, 'BA-9102',
   '22222222-2222-2222-2222-222222222222'::uuid, 'sale', 'Fixture listing owned by user2', 'active', 8000);

-- ═══ privileges ═══
-- has_table_privilege/has_function_privilege/has_column_privilege are native
-- Postgres functions with no description argument — pgTAP's assertion is
-- ok(), not a positional description arg. A bare call with the description
-- tacked on errors "function ... does not exist" instead of producing a TAP
-- result (same issue documented in phase2_listings_rls.sql); every call
-- below is wrapped in ok().
select ok(has_table_privilege('authenticated', 'public.offers', 'SELECT'), 'authenticated has SELECT on offers');
select ok(not has_table_privilege('authenticated', 'public.offers', 'INSERT'), 'authenticated cannot INSERT offers directly');
select ok(not has_table_privilege('authenticated', 'public.offer_items', 'INSERT'), 'authenticated cannot INSERT offer_items directly');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'INSERT'), 'authenticated cannot INSERT notifications directly');
select ok(has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE'), 'authenticated can UPDATE notifications.read_at');

select ok(has_function_privilege('authenticated',
  'public.create_offer(uuid, uuid[], integer, text, text)', 'EXECUTE'),
  'authenticated can call create_offer');
select ok(has_function_privilege('authenticated',
  'public.counter_offer(uuid, integer, text, text)', 'EXECUTE'),
  'authenticated can call counter_offer');
select ok(
  not has_function_privilege('authenticated', 'public.expire_stale_offers()', 'EXECUTE'),
  'authenticated cannot call expire_stale_offers directly'
);

-- ═══ create_offer rejects an unauthenticated call (real, unsimulated) ═══
select throws_ok(
  $$ select public.create_offer(gen_random_uuid(), null, 100, 'from_offerer', null) $$,
  'P0001', 'Not authenticated.', 'create_offer rejects a session with no auth.uid()'
);

-- ═══ ownership trigger — the item-you-don't-own backstop ═══
-- Seed: user1 owns a listing being offered on; user2 owns a *different*
-- listing they do NOT control as the offerer here.
select lives_ok(
  $$
  insert into public.offers (id, listing_id, root_offer_id, from_user_id, to_user_id)
  values (
    '99999999-9999-9999-9999-999999999901'::uuid,
    '88888888-8888-8888-8888-888888888802'::uuid,
    '99999999-9999-9999-9999-999999999901'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid
  )
  $$,
  'seed a root offer row directly for the ownership-trigger test below'
);

select throws_like(
  $$
  insert into public.offer_items (root_offer_id, listing_id)
  values (
    '99999999-9999-9999-9999-999999999901'::uuid,
    '88888888-8888-8888-8888-888888888802'::uuid
  )
  $$,
  '%You can only offer listings you own%',
  'offer_items insert rejects a listing not owned by the offer''s from_user_id'
);

-- ═══ one_live_offer_per_pair unique index ═══
-- throws_ok(sql, errcode, description) as a bare 3-arg call resolves to
-- pgTAP's (sql, errcode, errmsg) overload — the 3rd string is compared
-- against the exact raised message, not used as a label, and there is no
-- separate description in that overload (confirmed against pg_proc's
-- extensions.throws_ok(text, integer, text) definition, which delegates to
-- throws_ok($1, $2::char(5), $3, NULL)). The explicit 4-arg form below with
-- errmsg = NULL matches by SQLSTATE only and takes the description as the
-- 4th argument, exactly as intended.
select throws_ok(
  $$
  insert into public.offers (listing_id, root_offer_id, from_user_id, to_user_id)
  select listing_id, gen_random_uuid(), from_user_id, to_user_id
  from public.offers where id = '99999999-9999-9999-9999-999999999901'::uuid
  $$,
  '23505', NULL,
  'a second pending root offer for the same listing+offerer violates the unique index'
);

-- ═══ expire_stale_offers ═══
select lives_ok(
  $$
  update public.offers
  set expires_at = now() - interval '1 hour'
  where id = '99999999-9999-9999-9999-999999999901'::uuid
  $$,
  'backdate the seeded offer past its expiry for the next assertion'
);

select is(
  (select public.expire_stale_offers()),
  1,
  'expire_stale_offers expires exactly the one backdated pending offer'
);

select ok(
  exists(
    select 1 from public.notifications
    where offer_id = '99999999-9999-9999-9999-999999999901'::uuid
      and kind = 'offer_expired'
  ),
  'expiring an offer notifies the original offerer'
);

-- ═══ recursive chain via get_offer_thread ═══
select is(
  (select count(*)::int from public.get_offer_thread('99999999-9999-9999-9999-999999999901'::uuid)),
  1,
  'get_offer_thread on a single-row (now-expired) thread returns exactly that row'
);

-- ═══ notifications RLS: a second user cannot read another user's row ═══
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.notifications where offer_id = '99999999-9999-9999-9999-999999999901'::uuid),
  0,
  'user2 cannot see the notification addressed to user1'
);
reset role;

select * from finish();
rollback;
