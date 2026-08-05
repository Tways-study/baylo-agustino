-- supabase/tests/phase7_social_rls.sql
begin;
select plan(28);

-- ═══ fixtures ═══
-- Want X: owned by user 1111 — used for close_want owner + third-party tests
--         and RLS open-want visibility check. Gets closed mid-test.
-- Want Y: owned by user 1111 — used for hanap_match trigger tests;
--         title kept simple so websearch_to_tsquery produces a two-term AND
--         that the tsvector of a matching listing title will satisfy.
insert into public.wants (id, user_id, title, status)
values
  ('00000007-0001-0000-0000-000000000001'::uuid,
   '11111111-1111-1111-1111-111111111111'::uuid,
   'ba-7-fixture close-want test',
   'open'),
  ('00000007-0002-0000-0000-000000000002'::uuid,
   '11111111-1111-1111-1111-111111111111'::uuid,
   'calculus textbook',
   'open');

-- ═══ privileges — wants ═══
select ok(not has_table_privilege('authenticated', 'public.wants', 'INSERT'), 'authenticated cannot INSERT wants directly');
select ok(not has_table_privilege('authenticated', 'public.wants', 'UPDATE'), 'authenticated cannot UPDATE wants directly');
select ok(not has_table_privilege('authenticated', 'public.wants', 'DELETE'), 'authenticated cannot DELETE wants directly');

-- ═══ privileges — follows ═══
select ok(not has_table_privilege('authenticated', 'public.follows', 'INSERT'), 'authenticated cannot INSERT follows directly');
select ok(not has_table_privilege('authenticated', 'public.follows', 'UPDATE'), 'authenticated cannot UPDATE follows directly');
select ok(not has_table_privilege('authenticated', 'public.follows', 'DELETE'), 'authenticated cannot DELETE follows directly');

-- ═══ privileges — RPCs ═══
select ok(has_function_privilege('authenticated', 'public.post_want(text, text, integer, text)', 'EXECUTE'), 'authenticated can call post_want');
select ok(has_function_privilege('authenticated', 'public.close_want(uuid)', 'EXECUTE'), 'authenticated can call close_want');
select ok(has_function_privilege('authenticated', 'public.follow_user(uuid)', 'EXECUTE'), 'authenticated can call follow_user');
select ok(has_function_privilege('authenticated', 'public.unfollow_user(uuid)', 'EXECUTE'), 'authenticated can call unfollow_user');

select ok(not has_function_privilege('anon', 'public.post_want(text, text, integer, text)', 'EXECUTE'), 'anon cannot call post_want');
select ok(not has_function_privilege('anon', 'public.close_want(uuid)', 'EXECUTE'), 'anon cannot call close_want');
select ok(not has_function_privilege('anon', 'public.follow_user(uuid)', 'EXECUTE'), 'anon cannot call follow_user');
select ok(not has_function_privilege('anon', 'public.unfollow_user(uuid)', 'EXECUTE'), 'anon cannot call unfollow_user');

-- ═══ privileges — pulse_stats matview ═══
select ok(has_table_privilege('authenticated', 'public.pulse_stats', 'SELECT'), 'authenticated can read pulse_stats matview');

-- ═══ functional: wants (RLS + RPCs) ═══
-- Establish session as user 2222 (e2e-fixture) — third party relative to Want X / Want Y.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);

select is(
  (select count(*)::int from public.wants where id = '00000007-0001-0000-0000-000000000001'::uuid),
  1,
  'open want is visible to another authenticated user'
);

-- Third party cannot close another user's want via the RPC.
select throws_ok(
  $$ select public.close_want('00000007-0001-0000-0000-000000000001'::uuid) $$,
  'Want not found or not yours.',
  'third party cannot close another user''s want'
);

-- Switch to want owner (user 1111) — post a want and close Want X.
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

select lives_ok(
  $$ select public.post_want('Second-hand TI-84 calculator', null, null, null) $$,
  'post_want inserts a new want for the caller'
);

select lives_ok(
  $$ select public.close_want('00000007-0001-0000-0000-000000000001'::uuid) $$,
  'want owner can close their own want'
);

-- Verify the now-closed Want X is hidden from another authenticated user by the
-- RLS select policy (status = 'open' filter).
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);

select is(
  (select count(*)::int from public.wants where id = '00000007-0001-0000-0000-000000000001'::uuid),
  0,
  'closed want is hidden from authenticated users by RLS'
);

-- ═══ functional: follows (RLS + RPCs) ═══
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

select lives_ok(
  $$ select public.follow_user('22222222-2222-2222-2222-222222222222'::uuid) $$,
  'authenticated user can follow another user'
);

select is(
  (select count(*)::int from public.follows
   where follower_id = '11111111-1111-1111-1111-111111111111'::uuid
     and followee_id = '22222222-2222-2222-2222-222222222222'::uuid),
  1,
  'follow row exists after follow_user'
);

select throws_ok(
  $$ select public.follow_user('11111111-1111-1111-1111-111111111111'::uuid) $$,
  'Cannot follow yourself.',
  'user cannot follow themselves'
);

select lives_ok(
  $$ select public.unfollow_user('22222222-2222-2222-2222-222222222222'::uuid) $$,
  'authenticated user can unfollow'
);

select is(
  (select count(*)::int from public.follows
   where follower_id = '11111111-1111-1111-1111-111111111111'::uuid
     and followee_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'follow row removed after unfollow_user'
);

-- ═══ functional: hanap_match trigger ═══
-- Direct listing inserts must bypass RLS (authenticated cannot INSERT listings
-- except via RPC). Reset to unrestricted postgres role; trigger still fires and
-- uses its own SECURITY DEFINER context to read wants and write notifications.
reset role;

-- Listing M (owner = user 2222, title = 'Calculus Textbook').
-- websearch_to_tsquery('simple', 'Calculus Textbook') = 'calculus' & 'textbook'.
-- Want Y's search_tsv contains both lexemes → match. Notification must be inserted
-- for user 1111 (Want Y owner ≠ listing owner, so self-skip does not apply).
insert into public.listings (id, code, owner_id, intent, title, status)
values (
  '00000007-0003-0000-0000-000000000003'::uuid,
  'BA-7T01',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'swap',
  'Calculus Textbook',
  'active'
);

select is(
  (select count(*)::int from public.notifications
   where kind = 'hanap_match'
     and user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'matching active listing triggers hanap_match notification for want owner'
);

-- Listing N (owner = user 2222, unrelated title). No want tsvector should match
-- 'organic chemistry lab kit', so the notification count must not increase.
insert into public.listings (id, code, owner_id, intent, title, status)
values (
  '00000007-0004-0000-0000-000000000004'::uuid,
  'BA-7T02',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'sale',
  'Organic Chemistry Lab Kit',
  'active'
);

select is(
  (select count(*)::int from public.notifications
   where kind = 'hanap_match'
     and user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'non-matching listing does not create a hanap_match notification'
);

-- Listing S (owner = user 1111, title = 'Calculus Textbook').
-- This title matches Want Y's tsvector. However, w.user_id = 1111 = new.owner_id,
-- so the trigger's self-skip guard (w.user_id <> new.owner_id) must prevent a
-- notification — the count stays at 1.
insert into public.listings (id, code, owner_id, intent, title, status)
values (
  '00000007-0005-0000-0000-000000000005'::uuid,
  'BA-7T03',
  '11111111-1111-1111-1111-111111111111'::uuid,
  'swap',
  'Calculus Textbook',
  'active'
);

select is(
  (select count(*)::int from public.notifications
   where kind = 'hanap_match'
     and user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'listing owner is not self-notified even when their listing matches their own open want'
);

select * from finish();
rollback;
