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

-- ═══ e2e-fixture-2@usa.edu.ph ═══
-- A second Playwright fixture user, needed for two-party flows (Phase 4
-- offer negotiation E2E) where the same browser session can't be both the
-- listing owner and the offerer. Mirrors e2e-fixture@usa.edu.ph exactly.
-- Note: 33333333-3333-3333-3333-333333333333 is deliberately reserved
-- elsewhere as an unseeded third-party UUID for RLS testing (see
-- supabase/tests/phase4_offers_rls.sql) — this user uses 44444444-... to
-- avoid any confusion with that.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated',
  'e2e-fixture-2@usa.edu.ph',
  crypt('not-a-real-password', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.profiles (id, display_name, program, year_level, verified_at)
values ('44444444-4444-4444-4444-444444444444', 'E2E Fixture 2', 'BSCS', 2, now());

-- ═══ e2e-fixture-3@usa.edu.ph ═══
-- A third Playwright fixture user, needed for third-party isolation tests
-- (Phase 5 deal room — a user who is neither the listing owner nor the
-- offerer). Mirrors e2e-fixture@usa.edu.ph exactly. Uses 55555555-... —
-- 33333333-... stays reserved as the unseeded third-party UUID used
-- directly inside pgTAP RLS tests (see supabase/tests/phase4_offers_rls.sql
-- and phase5_deal_room_rls.sql), 44444444-... is e2e-fixture-2.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '55555555-5555-5555-5555-555555555555',
  'authenticated', 'authenticated',
  'e2e-fixture-3@usa.edu.ph',
  crypt('not-a-real-password', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.profiles (id, display_name, program, year_level, verified_at)
values ('55555555-5555-5555-5555-555555555555', 'E2E Fixture 3', 'BSBA', 1, now());
