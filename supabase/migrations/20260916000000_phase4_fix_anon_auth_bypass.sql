-- supabase/migrations/20260916000000_phase4_fix_anon_auth_bypass.sql
-- Fix: anon-role auth bypass in four Phase 4 offer RPCs.
--
-- Discovered while reviewing Phase 5: accept_offer, decline_offer, and
-- withdraw_offer each guard on a pattern of the shape
--   if v_to_user is null or v_to_user <> auth.uid() then raise exception ...
-- When called by an unauthenticated (anon-role) client, auth.uid() is NULL.
-- If the target offer exists, v_to_user is a real, non-null UUID, so the
-- guard evaluates to `false or NULL` = NULL. PL/pgSQL's `if` treats a NULL
-- condition as false, so the `raise exception` is silently skipped and the
-- function proceeds to act on someone else's offer. counter_offer has the
-- same hole via `if v_caller <> v_to_user` with no `is null` pre-check at
-- all (`NULL <> v_to_user` = NULL).
--
-- Compounding this: none of the four functions had a
-- `revoke execute ... from anon` in 20260901000000_phase4_offers.sql, unlike
-- expire_stale_offers further down in that same file. Supabase's default
-- privileges grant EXECUTE on new public-schema functions to anon, so this
-- was directly callable with only the public anon key and no session.
-- Confirmed live: calling accept_offer with only NEXT_PUBLIC_SUPABASE_ANON_KEY
-- and no session succeeded and accepted a real offer.
--
-- Fix mirrors the exact pattern already applied to Phase 5's own RPCs
-- (confirm_meetup, propose_meetup, mark_swapped, cancel_deal in
-- 20260915000000_phase5_deal_room.sql) and matches create_offer's existing,
-- correct `if v_offerer is null then raise exception 'Not authenticated.';
-- end if;` check in the same original migration:
--   1. Explicit `auth.uid() is null` check as the first statement in each
--      function body, before any query runs.
--   2. Explicit `revoke execute ... from public` and `... from anon` on each
--      function, closing the missing-revoke gap directly rather than relying
--      solely on the in-body guard.
--
-- Per project convention, already-shipped RPCs are fixed with a new
-- `create or replace function` migration, never by editing the original.

-- ═══ accept_offer ═══
create or replace function public.accept_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_id uuid;
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select listing_id, from_user_id, to_user_id, status
    into v_listing_id, v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_to_user is null or v_to_user <> auth.uid() then
    raise exception 'Offer not found or not yours to accept.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending offer can be accepted.';
  end if;

  update public.offers set status = 'accepted', responded_at = now() where id = p_offer_id;
  update public.listings set status = 'reserved' where id = v_listing_id;
  -- Per spec: accepting auto-declines nothing. Other pending offers on the
  -- same listing stay pending.

  insert into public.notifications (user_id, offer_id, kind)
  values (v_from_user, p_offer_id, 'offer_accepted');
end;
$$;

revoke execute on function public.accept_offer(uuid) from public;
revoke execute on function public.accept_offer(uuid) from anon;

-- ═══ decline_offer ═══
create or replace function public.decline_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select from_user_id, to_user_id, status into v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_to_user is null or v_to_user <> auth.uid() then
    raise exception 'Offer not found or not yours to decline.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending offer can be declined.';
  end if;

  update public.offers set status = 'declined', responded_at = now() where id = p_offer_id;

  insert into public.notifications (user_id, offer_id, kind)
  values (v_from_user, p_offer_id, 'offer_declined');
end;
$$;

revoke execute on function public.decline_offer(uuid) from public;
revoke execute on function public.decline_offer(uuid) from anon;

-- ═══ withdraw_offer ═══
create or replace function public.withdraw_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select from_user_id, to_user_id, status into v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_from_user is null or v_from_user <> auth.uid() then
    raise exception 'Offer not found or not yours to withdraw.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending offer can be withdrawn.';
  end if;

  update public.offers set status = 'withdrawn', responded_at = now() where id = p_offer_id;

  insert into public.notifications (user_id, offer_id, kind)
  values (v_to_user, p_offer_id, 'offer_withdrawn');
end;
$$;

revoke execute on function public.withdraw_offer(uuid) from public;
revoke execute on function public.withdraw_offer(uuid) from anon;

-- ═══ counter_offer ═══
create or replace function public.counter_offer(
  p_offer_id uuid,
  p_cash_centavos integer,
  p_cash_direction text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_listing_id uuid;
  v_root_offer_id uuid;
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
  v_new_offer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select listing_id, root_offer_id, from_user_id, to_user_id, status
    into v_listing_id, v_root_offer_id, v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller <> v_to_user then
    raise exception 'Only the offer''s current recipient can counter it.';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending offer can be countered.';
  end if;

  update public.offers set status = 'countered', responded_at = now() where id = p_offer_id;

  insert into public.offers (
    listing_id, root_offer_id, from_user_id, to_user_id,
    parent_offer_id, cash_centavos, cash_direction, note
  ) values (
    v_listing_id, v_root_offer_id, v_caller, v_from_user,
    p_offer_id, coalesce(p_cash_centavos, 0), coalesce(p_cash_direction, 'from_offerer'), nullif(p_note, '')
  )
  returning id into v_new_offer_id;

  insert into public.notifications (user_id, offer_id, kind)
  values (v_from_user, v_new_offer_id, 'offer_countered');

  return v_new_offer_id;
end;
$$;

revoke execute on function public.counter_offer(uuid, integer, text, text) from public;
revoke execute on function public.counter_offer(uuid, integer, text, text) from anon;
