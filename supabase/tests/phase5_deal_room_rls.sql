-- supabase/tests/phase5_deal_room_rls.sql
begin;
-- Brief specified plan(38); this file adds 4 more assertions beyond the
-- brief's own SQL, proving the anon-auth-bypass regression fixed in Task 1
-- (20260915000000_phase5_deal_room.sql's `revoke execute ... from anon`
-- lines, added after the original review found `if v_caller not in (...)`
-- silently lets a NULL auth.uid() through PL/pgSQL's NULL-is-false `if`)
-- can never reoccur: 38 + 4 = 42.
select plan(42);

-- ═══ fixtures — an accepted offer between seed.sql's two profiles ═══
insert into public.listings (id, code, owner_id, intent, title, status, ask_centavos)
values
  ('88888888-8888-8888-8888-888888888901'::uuid, 'BA-9201',
   '22222222-2222-2222-2222-222222222222'::uuid, 'sale', 'Fixture listing for deal room', 'reserved', 5000);

insert into public.offers (
  id, listing_id, root_offer_id, from_user_id, to_user_id,
  cash_centavos, cash_direction, status
) values (
  '99999999-9999-9999-9999-999999999801'::uuid,
  '88888888-8888-8888-8888-888888888901'::uuid,
  '99999999-9999-9999-9999-999999999801'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  500, 'from_offerer', 'accepted'
);

-- ═══ privileges ═══
select ok(not has_table_privilege('authenticated', 'public.meetups', 'INSERT'), 'authenticated cannot INSERT meetups directly');
select ok(not has_table_privilege('authenticated', 'public.meetups', 'UPDATE'), 'authenticated cannot UPDATE meetups directly');
select ok(not has_table_privilege('authenticated', 'public.meetups', 'DELETE'), 'authenticated cannot DELETE meetups directly');
select ok(not has_table_privilege('authenticated', 'public.deal_confirmations', 'INSERT'), 'authenticated cannot INSERT deal_confirmations directly');
select ok(not has_table_privilege('authenticated', 'public.deal_confirmations', 'UPDATE'), 'authenticated cannot UPDATE deal_confirmations directly');
select ok(not has_table_privilege('authenticated', 'public.deal_confirmations', 'DELETE'), 'authenticated cannot DELETE deal_confirmations directly');
select ok(not has_table_privilege('authenticated', 'public.offer_cancellations', 'INSERT'), 'authenticated cannot INSERT offer_cancellations directly');
select ok(has_column_privilege('authenticated', 'public.messages', 'offer_id', 'INSERT'), 'authenticated can INSERT messages.offer_id');
select ok(has_column_privilege('authenticated', 'public.messages', 'sender_id', 'INSERT'), 'authenticated can INSERT messages.sender_id');
select ok(has_column_privilege('authenticated', 'public.messages', 'body', 'INSERT'), 'authenticated can INSERT messages.body');
select ok(not has_column_privilege('authenticated', 'public.messages', 'created_at', 'INSERT'), 'authenticated cannot INSERT messages.created_at directly');
select ok(not has_table_privilege('authenticated', 'public.messages', 'UPDATE'), 'authenticated cannot UPDATE messages directly');
select ok(has_function_privilege('authenticated', 'public.propose_meetup(uuid, smallint, timestamptz)', 'EXECUTE'), 'authenticated can call propose_meetup');
select ok(has_function_privilege('authenticated', 'public.confirm_meetup(uuid)', 'EXECUTE'), 'authenticated can call confirm_meetup');
select ok(has_function_privilege('authenticated', 'public.mark_swapped(uuid)', 'EXECUTE'), 'authenticated can call mark_swapped');
select ok(has_function_privilege('authenticated', 'public.cancel_deal(uuid, text, text)', 'EXECUTE'), 'authenticated can call cancel_deal');

-- Regression guard: Task 1's original migration let an unauthenticated
-- caller (auth.uid() = NULL, i.e. the anon role) slip past
-- `if v_caller not in (v_from_user, v_to_user) then raise exception ...`
-- because SQL `NULL not in (...)` evaluates to NULL and PL/pgSQL's `if`
-- treats a NULL condition as false, silently skipping the exception. The
-- fix added an explicit `if v_caller is null then raise exception 'Not
-- authenticated.'; end if;` guard plus `revoke execute ... from anon` on
-- all 4 RPCs. These 4 assertions prove anon has zero EXECUTE privilege at
-- all, so this cannot regress silently.
select ok(not has_function_privilege('anon', 'public.propose_meetup(uuid, smallint, timestamptz)', 'EXECUTE'), 'anon cannot call propose_meetup (regression guard for the auth-bypass fix)');
select ok(not has_function_privilege('anon', 'public.confirm_meetup(uuid)', 'EXECUTE'), 'anon cannot call confirm_meetup (regression guard for the auth-bypass fix)');
select ok(not has_function_privilege('anon', 'public.mark_swapped(uuid)', 'EXECUTE'), 'anon cannot call mark_swapped (regression guard for the auth-bypass fix)');
select ok(not has_function_privilege('anon', 'public.cancel_deal(uuid, text, text)', 'EXECUTE'), 'anon cannot call cancel_deal (regression guard for the auth-bypass fix)');

-- ═══ functional: propose_meetup + confirm_meetup ═══
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.propose_meetup('99999999-9999-9999-9999-999999999801'::uuid, (select id from public.meetup_spots limit 1), now() + interval '2 days') $$,
  'offerer can propose a meetup on their accepted deal'
);
select is(
  (select confirmed_by_offerer from public.meetups where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  true,
  'proposer''s own side auto-confirms'
);
select is(
  (select confirmed_by_owner from public.meetups where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  false,
  'the other side starts unconfirmed'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select lives_ok(
  $$ select public.confirm_meetup('99999999-9999-9999-9999-999999999801'::uuid) $$,
  'the owner can confirm the proposed meetup'
);
select is(
  (select confirmed_by_owner from public.meetups where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  true,
  'confirm_meetup flips only the caller''s own flag'
);

select lives_ok(
  $$ select public.propose_meetup('99999999-9999-9999-9999-999999999801'::uuid, (select id from public.meetup_spots limit 1), now() + interval '3 days') $$,
  'the owner can re-propose a new time'
);
select is(
  (select confirmed_by_offerer from public.meetups where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  false,
  'changing the proposal resets the other side''s confirmation'
);

-- ═══ functional: mark_swapped + completion trigger ═══
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.mark_swapped('99999999-9999-9999-9999-999999999801'::uuid) $$,
  'first party can mark the deal swapped'
);
select is(
  (select status from public.offers where id = '99999999-9999-9999-9999-999999999801'::uuid)::text,
  'accepted',
  'one-sided confirmation does not complete the deal'
);
select lives_ok(
  $$ select public.mark_swapped('99999999-9999-9999-9999-999999999801'::uuid) $$,
  'a repeat confirmation from the same party is a harmless no-op'
);
select is(
  (select count(*)::int from public.deal_confirmations where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  1,
  'the no-op did not insert a second row for the same user'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select lives_ok(
  $$ select public.mark_swapped('99999999-9999-9999-9999-999999999801'::uuid) $$,
  'second party marking swapped completes the deal'
);
select is(
  (select status from public.offers where id = '99999999-9999-9999-9999-999999999801'::uuid)::text,
  'completed',
  'both confirmations flip the offer to completed'
);
select is(
  (select status from public.listings where id = '88888888-8888-8888-8888-888888888901'::uuid)::text,
  'completed',
  'both confirmations flip the listing to completed'
);

-- ═══ functional: cancel_deal (fresh accepted offer — the one above is now completed) ═══
-- `reset role` here is required, not decorative: role was switched to
-- 'authenticated' earlier (line 62) and stays switched for the rest of the
-- transaction (set_config's third arg is transaction-local, not
-- statement-local). authenticated has zero direct INSERT/UPDATE grant on
-- offers/listings — those tables are written only through the
-- SECURITY DEFINER RPCs — so this raw fixture insert must run as the
-- unrestricted postgres role, same as the fixtures at the top of this file
-- (which run before any role switch happens). Restore 'authenticated' right
-- after so the following cancel_deal call still exercises real RLS/grants.
reset role;
insert into public.offers (
  id, listing_id, root_offer_id, from_user_id, to_user_id,
  cash_centavos, cash_direction, status
) values (
  '99999999-9999-9999-9999-999999999802'::uuid,
  '88888888-8888-8888-8888-888888888901'::uuid,
  '99999999-9999-9999-9999-999999999802'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  0, 'from_offerer', 'accepted'
);
update public.listings set status = 'reserved' where id = '88888888-8888-8888-8888-888888888901'::uuid;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.cancel_deal('99999999-9999-9999-9999-999999999802'::uuid, 'changed_mind', null) $$,
  'a party can cancel their accepted deal with a curated reason'
);
select is(
  (select status from public.offers where id = '99999999-9999-9999-9999-999999999802'::uuid)::text,
  'cancelled',
  'cancel_deal sets the offer to cancelled'
);
select is(
  (select status from public.listings where id = '88888888-8888-8888-8888-888888888901'::uuid)::text,
  'active',
  'cancel_deal reverts the listing to active'
);
select is(
  (select was_late from public.offer_cancellations where offer_id = '99999999-9999-9999-9999-999999999802'::uuid),
  false,
  'was_late is false when no meetup was ever scheduled'
);
-- The brief's pattern was '%longer%', copied from confirm_meetup/mark_swapped's
-- "This deal is no longer active." wording — but cancel_deal's own guard for a
-- non-'accepted' offer (20260915000000_phase5_deal_room.sql:366) raises a
-- different message with no "longer" in it: 'Only an accepted deal that has
-- not yet been swapped or cancelled can be cancelled.' Matched to the actual
-- text so the assertion tests the real guard instead of failing on a
-- string mismatch.
select throws_like(
  $$ select public.cancel_deal('99999999-9999-9999-9999-999999999802'::uuid, 'changed_mind', null) $$,
  '%has not yet been swapped or cancelled%',
  'cancel_deal cannot be called twice on an already-cancelled offer'
);

-- ═══ functional RLS: third party ═══
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);
select is(
  (select count(*)::int from public.meetups where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  0,
  'a third party cannot see the meetup row'
);
select is(
  (select count(*)::int from public.deal_confirmations where offer_id = '99999999-9999-9999-9999-999999999801'::uuid),
  0,
  'a third party cannot see deal_confirmations rows'
);
select throws_ok(
  $$ insert into public.messages (offer_id, sender_id, body) values ('99999999-9999-9999-9999-999999999801'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'hi') $$,
  '42501', NULL,
  'a third party cannot insert a message on a deal they are not party to'
);

reset role;
select * from finish();
rollback;
