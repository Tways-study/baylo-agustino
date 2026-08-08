-- supabase/tests/phase8_deletable_profiles.sql
-- Proves 20261020000000_phase8_deletable_profiles.sql's fix: deleting the
-- auth.users row behind a profile (what lib/account/actions.ts's
-- deleteAccount() does via admin.deleteUser()) must succeed even when that
-- profile has meetup/cancellation/report/audit-log history, and those
-- historical rows must survive with the actor column set to null rather
-- than blocking the delete or vanishing.
begin;
select plan(6);

-- ═══ fixtures ═══
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'authenticated', 'authenticated',
  'deletable-test@usa.edu.ph',
  '', now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);
insert into public.profiles (id, display_name, verified_at)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'Deletable Test User', now());

insert into public.listings (id, code, owner_id, intent, title, status)
values (
  '88888888-8888-8888-8888-888888888801'::uuid, 'BA-9801',
  '11111111-1111-1111-1111-111111111111'::uuid, 'give', 'Fixture for deletable-profiles test', 'active'
);

insert into public.offers (id, listing_id, root_offer_id, from_user_id, to_user_id, status)
values (
  '99999999-9999-9999-9999-999999999801'::uuid,
  '88888888-8888-8888-8888-888888888801'::uuid,
  '99999999-9999-9999-9999-999999999801'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'accepted'
);

-- The deletable user is the actor on all four previously-blocking columns —
-- realism of who-did-what doesn't matter here, only that these FKs exist.
insert into public.meetups (offer_id, spot_id, scheduled_at, proposed_by)
values (
  '99999999-9999-9999-9999-999999999801'::uuid,
  (select id from public.meetup_spots limit 1),
  now() + interval '1 day',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
);

insert into public.offer_cancellations (offer_id, cancelled_by, reason_code, was_late)
values (
  '99999999-9999-9999-9999-999999999801'::uuid,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'changed_mind', false
);

insert into public.reports (reporter_id, target_type, target_id, reason_code, resolved_by, status)
values (
  '11111111-1111-1111-1111-111111111111'::uuid, 'listing',
  '88888888-8888-8888-8888-888888888801'::uuid, 'spam',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'actioned'
);

insert into public.audit_log (actor_id, action, target_type, target_id)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'listing_takedown',
  'listing', '88888888-8888-8888-8888-888888888801'::uuid
);

-- ═══ the actual deletion, exactly as admin.deleteUser() triggers it ═══
select lives_ok(
  $$ delete from auth.users where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid $$,
  'deleting the underlying auth.users row succeeds even though the profile has meetup/cancellation/report/audit-log history'
);

select is(
  (select count(*)::int from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid),
  0,
  'the profile itself cascades away with the auth.users row'
);

select is(
  (select proposed_by from public.meetups where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  null,
  'the meetup row survives with proposed_by set to null instead of blocking the delete'
);

select is(
  (select cancelled_by from public.offer_cancellations where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  null,
  'the offer_cancellations row survives with cancelled_by set to null'
);

select is(
  (select resolved_by from public.reports where target_id = '88888888-8888-8888-8888-888888888801'::uuid),
  null,
  'the report row survives with resolved_by set to null'
);

select is(
  (select actor_id from public.audit_log where target_id = '88888888-8888-8888-8888-888888888801'::uuid),
  null,
  'the audit_log row survives with actor_id set to null'
);

select * from finish();
rollback;
