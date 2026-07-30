-- supabase/tests/phase1_rls.sql
-- Phase 1 pgTAP tests: RLS and column-level security proofs
--
-- Run with: supabase test db
-- Assertions: 10 (plan must match exactly)

begin;
select plan(10);

-- ─── 1. Domain helper: exact match passes ───────────────────────────────────
-- check_email_domain uses split_part(email, '@', 2) = 'usa.edu.ph'
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
-- split_part('attacker@evil.com@usa.edu.ph', '@', 2) = 'evil.com' ≠ 'usa.edu.ph'
select ok(
  not public.check_email_domain('attacker@evil.com@usa.edu.ph'),
  'double-@ bypass is rejected (split_part takes second segment, not last)'
);

-- ─── 4. authenticated has INSERT on profiles ────────────────────────────────
select has_table_privilege(
  'authenticated',
  'public.profiles',
  'INSERT',
  'authenticated role has INSERT on profiles'
);

-- ─── 5. authenticated has SELECT on profiles ────────────────────────────────
select has_table_privilege(
  'authenticated',
  'public.profiles',
  'SELECT',
  'authenticated role has SELECT on profiles'
);

-- ─── 6. authenticated has UPDATE on profiles (RLS restricts to own row) ─────
select has_table_privilege(
  'authenticated',
  'public.profiles',
  'UPDATE',
  'authenticated role has UPDATE on profiles (RLS restricts to own row)'
);

-- ─── 7. Column-level: authenticated cannot UPDATE verified_at ───────────────
-- The migration revokes UPDATE(verified_at) from authenticated.
-- has_column_privilege returns false when the privilege was revoked.
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'UPDATE'),
  'authenticated role cannot UPDATE verified_at'
);

-- ─── 8. Column-level: authenticated cannot UPDATE is_suspended ──────────────
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_suspended', 'UPDATE'),
  'authenticated role cannot UPDATE is_suspended'
);

-- ─── 9. Column-level: authenticated cannot UPDATE trust_score ───────────────
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'trust_score', 'UPDATE'),
  'authenticated role cannot UPDATE trust_score'
);

-- ─── 10. authenticated has INSERT on policy_acceptances ─────────────────────
select has_table_privilege(
  'authenticated',
  'public.policy_acceptances',
  'INSERT',
  'authenticated role has INSERT on policy_acceptances'
);

select * from finish();
rollback;
