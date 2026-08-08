-- supabase/tests/phase8_auth_helpers.sql
-- Phase 8 pgTAP tests: user_is_registered RPC, plus the auth rate-limiting
-- RPCs added by 20261015000000_phase8_auth_rate_limiting.sql.
--
-- Run with: supabase test db
-- Assertions: 26 (plan must match exactly)

begin;
select plan(26);

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

-- ═══ auth rate limiting: privileges ═══
-- Both anon and authenticated need EXECUTE — OTP send, password-reset send,
-- and login all happen pre-session (no auth.uid() yet).
select ok(has_function_privilege('anon', 'public.check_and_log_email_send(text, text)', 'EXECUTE'), 'anon can call check_and_log_email_send');
select ok(has_function_privilege('authenticated', 'public.check_and_log_email_send(text, text)', 'EXECUTE'), 'authenticated can call check_and_log_email_send');
select ok(has_function_privilege('anon', 'public.check_login_rate_limit(text)', 'EXECUTE'), 'anon can call check_login_rate_limit');
select ok(has_function_privilege('authenticated', 'public.check_login_rate_limit(text)', 'EXECUTE'), 'authenticated can call check_login_rate_limit');
select ok(has_function_privilege('anon', 'public.record_login_attempt(text, boolean)', 'EXECUTE'), 'anon can call record_login_attempt');
select ok(has_function_privilege('authenticated', 'public.record_login_attempt(text, boolean)', 'EXECUTE'), 'authenticated can call record_login_attempt');

-- ═══ auth rate limiting: direct table access is fully denied ═══
-- Both tables have RLS enabled with zero policies — the SECURITY DEFINER
-- RPCs above are the only door, same as reports/audit_log in Phase 6.
select ok(not has_table_privilege('authenticated', 'public.email_send_attempts', 'INSERT'), 'authenticated cannot INSERT email_send_attempts directly');
select ok(not has_table_privilege('authenticated', 'public.email_send_attempts', 'UPDATE'), 'authenticated cannot UPDATE email_send_attempts directly');
select ok(not has_table_privilege('authenticated', 'public.email_send_attempts', 'DELETE'), 'authenticated cannot DELETE email_send_attempts directly');
select ok(not has_table_privilege('authenticated', 'public.login_attempts', 'INSERT'), 'authenticated cannot INSERT login_attempts directly');
select ok(not has_table_privilege('authenticated', 'public.login_attempts', 'UPDATE'), 'authenticated cannot UPDATE login_attempts directly');
select ok(not has_table_privilege('authenticated', 'public.login_attempts', 'DELETE'), 'authenticated cannot DELETE login_attempts directly');

-- ═══ functional: check_and_log_email_send throttle ═══
-- Seed 4 prior attempts directly (unrestricted test-runner role) so the RPC
-- call below is the 5th — allowed — and the one after it is the 6th — denied.
insert into public.email_send_attempts (email, action)
select 'throttle-test@usa.edu.ph', 'otp' from generate_series(1, 4);

select lives_ok(
  $$ select public.check_and_log_email_send('throttle-test@usa.edu.ph', 'otp') $$,
  'the 5th email send within an hour is allowed'
);
select throws_ok(
  $$ select public.check_and_log_email_send('throttle-test@usa.edu.ph', 'otp') $$,
  'Too many codes requested. Wait a bit before trying again.',
  'the 6th email send within an hour is throttled'
);
select throws_ok(
  $$ select public.check_and_log_email_send('throttle-test@usa.edu.ph', 'bogus') $$,
  'Invalid action.',
  'check_and_log_email_send rejects an invalid action'
);
select lives_ok(
  $$ select public.check_and_log_email_send('throttle-test@usa.edu.ph', 'password_reset') $$,
  'password_reset attempts are throttled independently of otp attempts for the same email'
);

-- ═══ functional: check_login_rate_limit / record_login_attempt ═══
insert into public.login_attempts (email, success)
select 'lockout-test@usa.edu.ph', false from generate_series(1, 4);

select lives_ok(
  $$ select public.check_login_rate_limit('lockout-test@usa.edu.ph') $$,
  'a check before a 5th failure is logged is allowed'
);
select lives_ok(
  $$ select public.record_login_attempt('lockout-test@usa.edu.ph', false) $$,
  'record_login_attempt logs the 5th failure'
);
select throws_ok(
  $$ select public.check_login_rate_limit('lockout-test@usa.edu.ph') $$,
  'Too many failed attempts. Wait 15 minutes before trying again.',
  'a check after 5 recent failures is throttled'
);

insert into public.login_attempts (email, success) values ('clean-test@usa.edu.ph', false);
select lives_ok(
  $$ select public.check_login_rate_limit('clean-test@usa.edu.ph') $$,
  'a single prior failure does not trip the 5-failure threshold'
);
select lives_ok(
  $$ select public.record_login_attempt('clean-test@usa.edu.ph', true) $$,
  'record_login_attempt logs a successful login'
);

select * from finish();

rollback;
