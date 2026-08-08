-- supabase/tests/phase1_rls.sql
-- Phase 1 pgTAP tests: RLS and column-level security proofs
--
-- Run with: supabase test db
-- Assertions: 25 (plan must match exactly). Tests 1-15 predate the
-- two-identity functional-proof convention established from
-- phase4_offers_rls.sql onward (set_config('role', 'authenticated', true) +
-- set_config('request.jwt.claims', ...) to simulate a real caller, then
-- query/insert as that identity). Tests 16-25 (Phase 8 RLS-audit backfill)
-- add that functional coverage for blocks, policy_acceptances, and the
-- block-hides-profile behavior that test 15 only proved indirectly via a
-- regex match on the policy's SQL text.

begin;
select plan(25);

-- ─── 1. Domain helper: exact match passes ───────────────────────────────────
select ok(
  public.check_email_domain('student@usa.edu.ph'),
  'usa.edu.ph email passes domain check'
);

-- ─── 2. Domain helper: foreign domain fails ─────────────────────────────────
select ok(
  not public.check_email_domain('hacker@gmail.com'),
  'gmail.com email fails domain check'
);

-- ─── 3. Domain helper: double-@ bypass is blocked ───────────────────────────
-- The regex '^[^@]+@usa\.edu\.ph$' requires exactly one @ before the domain.
select ok(
  not public.check_email_domain('attacker@evil.com@usa.edu.ph'),
  'double-@ bypass is rejected (second segment evil.com fails regex)'
);

-- ─── 4. Domain helper: trailing-domain bypass is blocked ────────────────────
-- 'attacker@usa.edu.ph@evil.com' — split_part gave segment 2 = 'usa.edu.ph'
-- which would have PASSED the old check. The regex anchors the end so it fails.
select ok(
  not public.check_email_domain('attacker@usa.edu.ph@evil.com'),
  'trailing-domain bypass is rejected (regex requires string to end at usa.edu.ph)'
);

-- ─── 5. authenticated has INSERT on the allow-listed profiles columns ───────
-- has_table_privilege(user, table, privilege) is a native Postgres function
-- with no description argument — pgTAP's own assertion is ok(), not a 4th
-- positional arg. A bare 4-arg call errors with "function ... does not
-- exist" rather than producing a TAP result.
--
-- profiles has no table-level INSERT/UPDATE grant for authenticated (see
-- test 8-10's comment) — only specific columns are granted, so this checks
-- has_column_privilege on an allow-listed column, not has_table_privilege.
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'INSERT'),
  'authenticated role has INSERT on profiles.display_name'
);

-- ─── 6. authenticated has SELECT on profiles ────────────────────────────────
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated role has SELECT on profiles'
);

-- ─── 7. authenticated has UPDATE on the allow-listed profiles columns ───────
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated role has UPDATE on profiles.display_name (RLS restricts to own row)'
);

-- ─── 8. Column-level: authenticated cannot UPDATE verified_at ───────────────
-- The migration revokes UPDATE(verified_at) from authenticated.
-- has_column_privilege returns false when the privilege was revoked.
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'UPDATE'),
  'authenticated role cannot UPDATE verified_at'
);

-- ─── 9. Column-level: authenticated cannot UPDATE is_suspended ──────────────
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_suspended', 'UPDATE'),
  'authenticated role cannot UPDATE is_suspended'
);

-- ─── 10. Column-level: authenticated cannot UPDATE trust_score ──────────────
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'trust_score', 'UPDATE'),
  'authenticated role cannot UPDATE trust_score'
);

-- ─── 11. authenticated has INSERT on policy_acceptances ─────────────────────
select ok(
  has_table_privilege('authenticated', 'public.policy_acceptances', 'INSERT'),
  'authenticated role has INSERT on policy_acceptances'
);

-- ─── 12. is_blocked_by() exists and is granted to authenticated ────────────
-- Regression coverage for a real bug: "users manage own blocks" (blocks'
-- own RLS) only lets a user see rows where they are blocker_id, so a raw
-- `exists (select 1 from blocks where ...)` inside another table's policy
-- silently sees nothing when evaluated for the blocked party — the block
-- never actually hides anything. is_blocked_by() is SECURITY DEFINER so it
-- isn't subject to that recursive RLS restriction. Confirmed against a real
-- hosted project during Phase 2 verification: before this fix, a blocked
-- user could still read the blocker's profile and listings.
select ok(
  has_function_privilege('authenticated', 'public.is_blocked_by(uuid, uuid)', 'EXECUTE'),
  'authenticated can call is_blocked_by'
);

-- ─── 13. is_blocked_by() is false before any block row exists ──────────────
-- Uses the seed-owner/e2e-fixture ids from supabase/seed.sql (also relied on
-- by phase2_listings_rls.sql's CHECK-constraint tests) to satisfy
-- blocks.blocker_id/blocked_id's FK into auth.users — verify the seed ran
-- before trusting this and test 14.
select is(
  public.is_blocked_by('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  false,
  'is_blocked_by is false before any block row exists'
);

-- ─── 14. is_blocked_by() is true once the block row exists ─────────────────
insert into public.blocks (blocker_id, blocked_id) values (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'
);

select is(
  public.is_blocked_by('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  true,
  'is_blocked_by is true once the block row exists, called with (owner, viewer) order'
);

-- ─── 15. profiles policy actually calls is_blocked_by (not a raw subquery) ─
select matches(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles'
   and policyname = 'profiles readable by authenticated'),
  'is_blocked_by',
  'profiles SELECT policy calls is_blocked_by(), not a blocks subquery that RLS would silently hide'
);

-- ═══ functional RLS: blocks (Phase 8 audit backfill) ═══
-- Test 14 above inserted a 1111->2222 block row directly as the unrestricted
-- postgres role (no role switch had happened yet at that point in the file),
-- which proves nothing about RLS enforcement for the authenticated role
-- itself. These assertions simulate real callers via set_config, the
-- convention every phase from 4 onward uses (see phase6_trust_safety.sql).
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

select lives_ok(
  $$ insert into public.blocks (blocker_id, blocked_id) values ('11111111-1111-1111-1111-111111111111'::uuid, '44444444-4444-4444-4444-444444444444'::uuid) $$,
  'a user can insert their own block row (blocker_id = auth.uid())'
);

-- The with check on "users manage own blocks" requires auth.uid() = blocker_id;
-- inserting a row naming someone else as blocker_id must be rejected with the
-- standard RLS violation SQLSTATE. 4-arg throws_ok form used deliberately —
-- see phase4_offers_rls.sql's note on why a bare 3-arg (sql, errcode,
-- description) call resolves to the wrong pgTAP overload.
select throws_ok(
  $$ insert into public.blocks (blocker_id, blocked_id) values ('22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid) $$,
  '42501', NULL,
  'a user cannot insert a block row naming someone else as blocker_id'
);

select is(
  (select count(*)::int from public.blocks where blocker_id = '11111111-1111-1111-1111-111111111111'::uuid),
  2,
  'the blocker can see their own block rows (fixture 1111->2222 plus the 1111->4444 insert above)'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.blocks where blocker_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0,
  '"users manage own blocks" hides another user''s block rows even from the person who was blocked'
);

-- ═══ functional RLS: policy_acceptances (Phase 8 audit backfill) ═══
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ insert into public.policy_acceptances (user_id, policy_version) values ('11111111-1111-1111-1111-111111111111'::uuid, 1) $$,
  'a user can insert their own policy_acceptances row'
);
select throws_ok(
  $$ insert into public.policy_acceptances (user_id, policy_version) values ('22222222-2222-2222-2222-222222222222'::uuid, 1) $$,
  '42501', NULL,
  'a user cannot insert a policy_acceptances row naming someone else as user_id'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.policy_acceptances where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0,
  'a user cannot see another user''s policy_acceptances row'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.policy_acceptances where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'a user can see their own policy_acceptances row'
);

-- ═══ functional RLS: profiles hidden by a block, in only one direction ═══
-- The "profiles readable by authenticated" policy checks
-- is_blocked_by(profiles.id, auth.uid()) — i.e. "has the profile's OWNER
-- blocked this VIEWER". With the 1111->2222 block from test 14: 2222 (the
-- blocked party) loses visibility into 1111's profile, but 1111 (the
-- blocker) keeps visibility into 2222's — blocking hides yourself from
-- someone, it does not hide them from you. This is the actual functional
-- proof that test 15's regex match on the policy's SQL text stood in for.
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid),
  0,
  'a blocked user cannot see the profile of the user who blocked them'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  1,
  'the blocker can still see the profile of the user they blocked'
);

reset role;
select * from finish();
rollback;
