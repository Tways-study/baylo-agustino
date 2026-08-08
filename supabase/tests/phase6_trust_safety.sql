-- supabase/tests/phase6_trust_safety.sql
begin;
select plan(83);

-- ═══ fixtures ═══
-- A completed offer between seed.sql's 1111 (from) and 2222 (to), needed for
-- submit_review. Raw inserts bypass RLS — offers/listings are written only
-- through SECURITY DEFINER RPCs, so this must run as the unrestricted
-- postgres role (same pattern as phase5_deal_room_rls.sql's fixtures).
insert into public.listings (id, code, owner_id, intent, title, status, ask_centavos)
values
  ('88888888-8888-8888-8888-888888888601'::uuid, 'BA-9601',
   '22222222-2222-2222-2222-222222222222'::uuid, 'sale', 'Fixture listing for trust & safety', 'completed', 5000);

insert into public.offers (
  id, listing_id, root_offer_id, from_user_id, to_user_id,
  cash_centavos, cash_direction, status
) values (
  '99999999-9999-9999-9999-999999999601'::uuid,
  '88888888-8888-8888-8888-888888888601'::uuid,
  '99999999-9999-9999-9999-999999999601'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  500, 'from_offerer', 'completed'
);

-- A second, still-pending offer between the same two users — used to prove
-- submit_review rejects a non-completed deal.
insert into public.offers (
  id, listing_id, root_offer_id, from_user_id, to_user_id,
  cash_centavos, cash_direction, status
) values (
  '99999999-9999-9999-9999-999999999602'::uuid,
  '88888888-8888-8888-8888-888888888601'::uuid,
  '99999999-9999-9999-9999-999999999602'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  500, 'from_offerer', 'pending'
);

-- A second listing (owned by 1111) to take down via admin_take_down_listing.
insert into public.listings (id, code, owner_id, intent, title, status)
values (
  '88888888-8888-8888-8888-888888888602'::uuid, 'BA-9602',
  '11111111-1111-1111-1111-111111111111'::uuid, 'give', 'Listing to be taken down', 'active'
);

-- ═══ privileges — reviews / user_roles / reports / audit_log / app_settings ═══
select ok(not has_table_privilege('authenticated', 'public.reviews', 'INSERT'), 'authenticated cannot INSERT reviews directly');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'UPDATE'), 'authenticated cannot UPDATE reviews directly');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'DELETE'), 'authenticated cannot DELETE reviews directly');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'INSERT'), 'authenticated cannot INSERT user_roles directly');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'UPDATE'), 'authenticated cannot UPDATE user_roles directly');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'DELETE'), 'authenticated cannot DELETE user_roles directly');
select ok(not has_table_privilege('authenticated', 'public.reports', 'INSERT'), 'authenticated cannot INSERT reports directly');
select ok(not has_table_privilege('authenticated', 'public.reports', 'UPDATE'), 'authenticated cannot UPDATE reports directly');
select ok(not has_table_privilege('authenticated', 'public.reports', 'DELETE'), 'authenticated cannot DELETE reports directly');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'), 'authenticated cannot INSERT audit_log directly');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE'), 'authenticated cannot UPDATE audit_log directly');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'), 'authenticated cannot DELETE audit_log directly');
select ok(not has_table_privilege('authenticated', 'public.app_settings', 'INSERT'), 'authenticated cannot INSERT app_settings directly');
select ok(not has_table_privilege('authenticated', 'public.app_settings', 'UPDATE'), 'authenticated cannot UPDATE app_settings directly');
select ok(not has_table_privilege('authenticated', 'public.app_settings', 'DELETE'), 'authenticated cannot DELETE app_settings directly');

-- ═══ privileges — RPCs (authenticated has EXECUTE, anon does not) ═══
select ok(has_function_privilege('authenticated', 'public.submit_review(uuid, uuid, smallint, boolean, text)', 'EXECUTE'), 'authenticated can call submit_review');
select ok(has_function_privilege('authenticated', 'public.submit_report(text, uuid, text, text)', 'EXECUTE'), 'authenticated can call submit_report');
select ok(has_function_privilege('authenticated', 'public.admin_take_down_listing(uuid, text, uuid)', 'EXECUTE'), 'authenticated can call admin_take_down_listing');
select ok(has_function_privilege('authenticated', 'public.admin_suspend_user(uuid, text, uuid)', 'EXECUTE'), 'authenticated can call admin_suspend_user');
select ok(has_function_privilege('authenticated', 'public.admin_unsuspend_user(uuid)', 'EXECUTE'), 'authenticated can call admin_unsuspend_user');
select ok(has_function_privilege('authenticated', 'public.admin_dismiss_report(uuid)', 'EXECUTE'), 'authenticated can call admin_dismiss_report');
select ok(has_function_privilege('authenticated', 'public.admin_upsert_meetup_spot(smallint, text, text, boolean, boolean)', 'EXECUTE'), 'authenticated can call admin_upsert_meetup_spot');
select ok(has_function_privilege('authenticated', 'public.admin_bump_policy_version()', 'EXECUTE'), 'authenticated can call admin_bump_policy_version');

select ok(not has_function_privilege('anon', 'public.submit_review(uuid, uuid, smallint, boolean, text)', 'EXECUTE'), 'anon cannot call submit_review');
select ok(not has_function_privilege('anon', 'public.submit_report(text, uuid, text, text)', 'EXECUTE'), 'anon cannot call submit_report');
select ok(not has_function_privilege('anon', 'public.admin_take_down_listing(uuid, text, uuid)', 'EXECUTE'), 'anon cannot call admin_take_down_listing');
select ok(not has_function_privilege('anon', 'public.admin_suspend_user(uuid, text, uuid)', 'EXECUTE'), 'anon cannot call admin_suspend_user');
select ok(not has_function_privilege('anon', 'public.admin_unsuspend_user(uuid)', 'EXECUTE'), 'anon cannot call admin_unsuspend_user');
select ok(not has_function_privilege('anon', 'public.admin_dismiss_report(uuid)', 'EXECUTE'), 'anon cannot call admin_dismiss_report');
select ok(not has_function_privilege('anon', 'public.admin_upsert_meetup_spot(smallint, text, text, boolean, boolean)', 'EXECUTE'), 'anon cannot call admin_upsert_meetup_spot');
select ok(not has_function_privilege('anon', 'public.admin_bump_policy_version()', 'EXECUTE'), 'anon cannot call admin_bump_policy_version');
select ok(not has_function_privilege('anon', 'public.is_admin(uuid)', 'EXECUTE'), 'anon cannot call is_admin');

-- ═══ functional: submit_review ═══
select set_config('role', 'authenticated', true);

-- Third party (3333, not seeded — RLS/auth checks only need auth.uid(), no profiles row).
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);
select throws_ok(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999601'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 5, true, null) $$,
  'You are not a party to this offer.',
  'a third party cannot review a deal they were not part of'
);

-- 1111 is a party but names the wrong reviewee (themselves).
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select throws_ok(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999601'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 5, true, null) $$,
  'You can only review the other party to this deal.',
  'a party cannot name themselves as the reviewee'
);

-- Cannot review a deal that has not completed.
select throws_ok(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999602'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 5, true, null) $$,
  'You can only review a completed deal.',
  'a pending deal cannot be reviewed'
);

select lives_ok(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999601'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 4, true, 'Showed up on time') $$,
  'a party to a completed deal can review the other party'
);
select is(
  (select count(*)::int from public.reviews where offer_id = '99999999-9999-9999-9999-999999999601'::uuid),
  1,
  'submit_review inserted exactly one review row'
);
select is(
  (select trust_score from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  4.00::numeric(3,2),
  'submit_review recomputes the reviewee''s trust_score'
);
select is(
  (select show_up_rate from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  1.000::numeric(4,3),
  'submit_review recomputes the reviewee''s show_up_rate'
);
select is(
  (select review_count from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  1,
  'submit_review recomputes the reviewee''s review_count'
);

-- Duplicate review on the same offer by the same reviewer is blocked by the
-- unique (offer_id, reviewer_id) constraint. 4-arg form required: a bare
-- 3-arg throws_ok(sql, errcode, description) resolves to pgTAP's
-- (sql, errcode, errmsg) overload, not (sql, errcode, description) — see
-- phase4_offers_rls.sql's note on the one_live_offer_per_pair assertion.
select throws_ok(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999601'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 3, false, null) $$,
  '23505', NULL,
  'a reviewer cannot review the same offer twice'
);

-- Reviews are readable by anyone authenticated, including a true non-party
-- (3333 was never from_user_id/to_user_id on this offer).
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);
select is(
  (select count(*)::int from public.reviews where offer_id = '99999999-9999-9999-9999-999999999601'::uuid),
  1,
  'reviews are publicly selectable, even to a non-party'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

-- ═══ functional: submit_report ═══
select throws_ok(
  $$ select public.submit_report('bogus', '88888888-8888-8888-8888-888888888601'::uuid, 'spam', null) $$,
  'Invalid report target.',
  'submit_report rejects an invalid target_type'
);
select throws_ok(
  $$ select public.submit_report('listing', '88888888-8888-8888-8888-888888888601'::uuid, 'bogus', null) $$,
  'Pick a valid report reason.',
  'submit_report rejects an invalid reason_code'
);
select throws_ok(
  $$ select public.submit_report('listing', '00000000-0000-0000-0000-000000000000'::uuid, 'spam', null) $$,
  'Could not find what you''re trying to report.',
  'submit_report rejects a target that does not exist'
);

select lives_ok(
  $$ select public.submit_report('listing', '88888888-8888-8888-8888-888888888602'::uuid, 'banned_item', 'looks like a banned item') $$,
  '1111 can report a listing'
);
select is(
  (select count(*)::int from public.reports
   where reporter_id = '11111111-1111-1111-1111-111111111111'::uuid
     and target_id = '88888888-8888-8888-8888-888888888602'::uuid),
  1,
  'submit_report inserted a report row for the caller'
);
select is(
  (select status from public.reports
   where reporter_id = '11111111-1111-1111-1111-111111111111'::uuid
     and target_id = '88888888-8888-8888-8888-888888888602'::uuid),
  'open',
  'a fresh report starts open'
);

-- Rate limit: 9 more reports (10 total) from 1111 in the last 24h, then the
-- 11th call must be rejected. Direct inserts bypass RLS, run as postgres.
reset role;
insert into public.reports (reporter_id, target_type, target_id, reason_code)
select '11111111-1111-1111-1111-111111111111'::uuid, 'listing', '88888888-8888-8888-8888-888888888602'::uuid, 'spam'
from generate_series(1, 9);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);

select throws_ok(
  $$ select public.submit_report('listing', '88888888-8888-8888-8888-888888888602'::uuid, 'spam', null) $$,
  'You have reached today''s limit of 10 reports. Try again tomorrow.',
  'submit_report enforces the 10-per-24h rate limit'
);

-- reports RLS: reporter sees their own report; a third party sees none of it.
select is(
  (select count(*)::int from public.reports where target_id = '88888888-8888-8888-8888-888888888602'::uuid),
  10,
  'the reporter can see their own report rows'
);
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
select is(
  (select count(*)::int from public.reports where target_id = '88888888-8888-8888-8888-888888888602'::uuid),
  0,
  'a non-admin, non-reporter cannot see another user''s reports'
);

-- ═══ functional: user_roles / is_admin ═══
select is(public.is_admin('11111111-1111-1111-1111-111111111111'::uuid), false, 'is_admin is false before any role is granted');

-- Grant 1111 the admin role. Direct insert bypasses RLS, run as postgres.
reset role;
insert into public.user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111'::uuid, 'admin');
select set_config('role', 'authenticated', true);

select is(public.is_admin('11111111-1111-1111-1111-111111111111'::uuid), true, 'is_admin is true once a user_roles row exists');
select is(public.is_admin('22222222-2222-2222-2222-222222222222'::uuid), false, 'is_admin is false for a user with no role row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.user_roles),
  0,
  'a non-admin cannot see any user_roles rows'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select count(*)::int from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'an admin can see their own role assignment'
);

-- ═══ functional: admin_take_down_listing ═══
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select throws_ok(
  $$ select public.admin_take_down_listing('88888888-8888-8888-8888-888888888602'::uuid, 'test', null) $$,
  'Admins only.',
  'a non-admin cannot take down a listing'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.admin_take_down_listing(
       '88888888-8888-8888-8888-888888888602'::uuid, 'banned item',
       (select id from public.reports where target_id = '88888888-8888-8888-8888-888888888602'::uuid
        order by created_at limit 1)
     ) $$,
  'an admin can take down a listing'
);
select is(
  (select status from public.listings where id = '88888888-8888-8888-8888-888888888602'::uuid)::text,
  'removed',
  'admin_take_down_listing sets the listing status to removed'
);
select is(
  (select count(*)::int from public.notifications
   where kind = 'listing_removed' and user_id = '11111111-1111-1111-1111-111111111111'::uuid
     and listing_id = '88888888-8888-8888-8888-888888888602'::uuid),
  1,
  'admin_take_down_listing notifies the listing owner'
);
select is(
  (select status from public.reports
   where target_id = '88888888-8888-8888-8888-888888888602'::uuid
   order by created_at limit 1),
  'actioned',
  'admin_take_down_listing marks the passed report as actioned'
);
select is(
  (select count(*)::int from public.audit_log where action = 'listing_takedown'),
  1,
  'admin_take_down_listing writes an audit_log entry'
);

-- ═══ functional: admin_suspend_user / admin_unsuspend_user ═══
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select throws_ok(
  $$ select public.admin_suspend_user('44444444-4444-4444-4444-444444444444'::uuid, 'test', null) $$,
  'Admins only.',
  'a non-admin cannot suspend a user'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.admin_suspend_user('44444444-4444-4444-4444-444444444444'::uuid, 'repeated no-shows', null) $$,
  'an admin can suspend a user'
);
select is(
  (select is_suspended from public.profiles where id = '44444444-4444-4444-4444-444444444444'::uuid),
  true,
  'admin_suspend_user flips is_suspended to true'
);
select is(
  (select count(*)::int from public.notifications
   where kind = 'account_suspended' and user_id = '44444444-4444-4444-4444-444444444444'::uuid),
  1,
  'admin_suspend_user notifies the suspended user'
);

select lives_ok(
  $$ select public.admin_unsuspend_user('44444444-4444-4444-4444-444444444444'::uuid) $$,
  'an admin can unsuspend a user'
);
select is(
  (select is_suspended from public.profiles where id = '44444444-4444-4444-4444-444444444444'::uuid),
  false,
  'admin_unsuspend_user flips is_suspended back to false'
);
select is(
  (select count(*)::int from public.audit_log where action in ('account_suspend', 'account_unsuspend')),
  2,
  'admin_suspend_user and admin_unsuspend_user each write an audit_log entry'
);

-- ═══ functional: admin_dismiss_report ═══
select lives_ok(
  $$ select public.admin_dismiss_report(
       (select id from public.reports where target_id = '88888888-8888-8888-8888-888888888602'::uuid and status = 'open' limit 1)
     ) $$,
  'an admin can dismiss an open report'
);
select is(
  (select count(*)::int from public.reports where target_id = '88888888-8888-8888-8888-888888888602'::uuid and status = 'dismissed'),
  1,
  'admin_dismiss_report marks the report dismissed'
);

-- ═══ functional: admin_upsert_meetup_spot ═══
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select throws_ok(
  $$ select public.admin_upsert_meetup_spot(null, 'Library steps', null, false, true) $$,
  'Admins only.',
  'a non-admin cannot create a meetup spot'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select throws_ok(
  $$ select public.admin_upsert_meetup_spot(null, '', null, false, true) $$,
  'Name is required.',
  'admin_upsert_meetup_spot rejects an empty name'
);

select lives_ok(
  $$ select public.admin_upsert_meetup_spot(null, 'Library steps', 'near the entrance', false, true) $$,
  'an admin can create a new meetup spot'
);
select is(
  (select count(*)::int from public.meetup_spots where name = 'Library steps'),
  1,
  'admin_upsert_meetup_spot inserted the new spot'
);
select lives_ok(
  $$ select public.admin_upsert_meetup_spot(
       (select id from public.meetup_spots where name = 'Library steps'),
       'Library steps (covered)', 'near the entrance', true, true
     ) $$,
  'an admin can update an existing meetup spot'
);
select is(
  (select is_camera_covered from public.meetup_spots where name = 'Library steps (covered)'),
  true,
  'admin_upsert_meetup_spot updated the existing row in place'
);

-- ═══ functional: admin_bump_policy_version ═══
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select throws_ok(
  $$ select public.admin_bump_policy_version() $$,
  'Admins only.',
  'a non-admin cannot bump the policy version'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select is(
  (select public.admin_bump_policy_version()),
  2,
  'admin_bump_policy_version increments policy_version from its seeded default of 1'
);
select is(
  (select policy_version from public.app_settings where id = true),
  2,
  'the bumped policy_version is persisted in app_settings'
);

-- app_settings is readable by any authenticated user, admin or not.
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.app_settings),
  1,
  'app_settings is publicly selectable, even to a non-admin'
);

-- ═══ functional: audit_log RLS ═══
select is(
  (select count(*)::int from public.audit_log),
  0,
  'a non-admin cannot see any audit_log rows'
);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select ok(
  (select count(*)::int from public.audit_log) > 0,
  'an admin can see audit_log rows'
);

reset role;
select * from finish();
rollback;
