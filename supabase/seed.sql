-- supabase/seed.sql
-- Local-dev-only fixture data, loaded automatically by `supabase db reset`
-- (see supabase/config.toml [db.seed]). Never applied to a real environment.

-- ═══ seed-owner@usa.edu.ph ═══
-- A throwaway verified user, used only so pgTAP's sale/give CHECK-constraint
-- tests (supabase/tests/phase2_listings_rls.sql) have a valid owner_id to
-- satisfy the listings.owner_id foreign key.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'seed-owner@usa.edu.ph',
  crypt('not-a-real-password', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.profiles (id, display_name, verified_at)
values ('11111111-1111-1111-1111-111111111111', 'Seed Owner', now());

-- ═══ e2e-fixture@usa.edu.ph ═══
-- The Playwright fixture user (e2e/helpers/auth.ts mints a magic-link session
-- for this address so tests skip the real OTP-over-email round trip). Fully
-- onboarded so middleware lets it straight through to protected routes.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'e2e-fixture@usa.edu.ph',
  crypt('not-a-real-password', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.profiles (id, display_name, program, year_level, verified_at)
values ('22222222-2222-2222-2222-222222222222', 'E2E Fixture', 'BSIT', 3, now());
