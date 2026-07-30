-- supabase/tests/phase1_rls.sql
-- Phase 1 pgTAP tests: RLS and column-level security proofs
--
-- Run with: supabase test db
-- Assertions: 11 (plan must match exactly)

begin;
select plan(11);

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

-- ─── 5. authenticated has INSERT on profiles ────────────────────────────────
select has_table_privilege(
  'authenticated',
  'public.profiles',
  'INSERT',
  'authenticated role has INSERT on profiles'
);

-- ─── 6. authenticated has SELECT on profiles ────────────────────────────────
select has_table_privilege(
  'authenticated',
  'public.profiles',
  'SELECT',
  'authenticated role has SELECT on profiles'
);

-- ─── 7. authenticated has UPDATE on profiles (RLS restricts to own row) ─────
select has_table_privilege(
  'authenticated',
  'public.profiles',
  'UPDATE',
  'authenticated role has UPDATE on profiles (RLS restricts to own row)'
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
select has_table_privilege(
  'authenticated',
  'public.policy_acceptances',
  'INSERT',
  'authenticated role has INSERT on policy_acceptances'
);

select * from finish();
rollback;
