-- supabase/tests/phase8_auth_helpers.sql
-- Phase 8 pgTAP tests: user_is_registered RPC
--
-- Run with: supabase test db
-- Assertions: 5 (plan must match exactly)

begin;
select plan(5);

-- ─── 1. Unknown email returns false ─────────────────────────────────────────
select is(
  public.user_is_registered('nobody-at-all@usa.edu.ph'),
  false,
  'Unknown email returns false'
);

-- ─── 2. seed-owner (verified_at set) returns true ───────────────────────────
select is(
  public.user_is_registered('seed-owner@usa.edu.ph'),
  true,
  'Verified seed-owner returns true'
);

-- ─── 3. e2e-fixture (verified_at set) returns true ──────────────────────────
select is(
  public.user_is_registered('e2e-fixture@usa.edu.ph'),
  true,
  'Verified e2e-fixture returns true'
);

-- ─── 4. User in auth.users with no profiles row returns false ───────────────
-- Insert a bare auth user without a matching profiles row, then check.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'no-profile@usa.edu.ph',
  '', now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

select is(
  public.user_is_registered('no-profile@usa.edu.ph'),
  false,
  'Auth user with no profiles row returns false'
);

-- ─── 5. User with profiles row but verified_at IS NULL returns false ─────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated',
  'unverified@usa.edu.ph',
  '', now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.profiles (id, display_name, verified_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Unverified User', null);

select is(
  public.user_is_registered('unverified@usa.edu.ph'),
  false,
  'User with profiles row but verified_at NULL returns false'
);

select * from finish();

rollback;
