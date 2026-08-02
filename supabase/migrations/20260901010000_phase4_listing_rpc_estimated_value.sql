-- supabase/migrations/20260901010000_phase4_listing_rpc_estimated_value.sql
-- Phase 4 fix: create_listing/update_listing were never altered to accept
-- p_estimated_value_centavos, even though types/database.ts (Task 3) already
-- declares it and lib/listings/actions.ts (Task 9) already sends it on every
-- call. PostgREST dispatches .rpc() by exact named-parameter match, so every
-- listing create/update would fail at runtime with PGRST202 until this lands.
--
-- Adding a new trailing parameter with a DEFAULT to an existing function via
-- `create or replace function` preserves the function's OID (so GRANTs would
-- normally survive) and does not break any existing positional call sites,
-- as long as the new parameter comes after all existing parameters in the
-- same order. Design intent (Phase 4 spec, Design Decision 1) is swap-only:
-- sale and give always store null for estimated_value_centavos regardless of
-- what is passed, mirroring the existing ask_centavos/accepts_cash guards.

-- ═══ create_listing RPC ═══
create or replace function public.create_listing(
  p_id uuid,
  p_intent public.listing_intent,
  p_title text,
  p_description text,
  p_category_id smallint,
  p_condition text,
  p_ask_centavos integer,
  p_accepts_cash boolean,
  p_meetup_spot_id smallint,
  p_wants text[],
  p_image_paths text[],
  p_estimated_value_centavos integer default null
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_code text;
  v_recent_count integer;
begin
  if v_owner is null then
    raise exception 'Not authenticated.';
  end if;

  if p_image_paths is not null and array_length(p_image_paths, 1) > 4 then
    raise exception 'Up to 4 photos.';
  end if;

  select count(*) into v_recent_count
  from public.listings
  where owner_id = v_owner and created_at > now() - interval '24 hours';

  if v_recent_count >= 10 then
    raise exception 'You have reached today''s limit of 10 listings. Try again tomorrow.';
  end if;

  v_code := public.generate_listing_code();

  insert into public.listings (
    id, code, owner_id, intent, title, description, category_id, condition,
    ask_centavos, estimated_value_centavos, accepts_cash, status, meetup_spot_id,
    bumped_at, expires_at
  ) values (
    p_id, v_code, v_owner, p_intent, p_title, nullif(p_description, ''),
    p_category_id, p_condition,
    case when p_intent = 'give' then null else p_ask_centavos end,
    case when p_intent = 'swap' then p_estimated_value_centavos else null end,
    case when p_intent = 'give' then false else coalesce(p_accepts_cash, false) end,
    'active', p_meetup_spot_id, now(), now() + interval '30 days'
  );

  if p_wants is not null and array_length(p_wants, 1) > 0 then
    insert into public.listing_wants (listing_id, label, position)
    select p_id, w, ord - 1 from unnest(p_wants) with ordinality as t(w, ord);
  end if;

  if p_image_paths is not null and array_length(p_image_paths, 1) > 0 then
    insert into public.listing_images (listing_id, storage_path, position)
    select p_id, path, ord - 1 from unnest(p_image_paths) with ordinality as t(path, ord);
  end if;

  return query select p_id, v_code;
end;
$$;

grant execute on function public.create_listing(
  uuid, public.listing_intent, text, text, smallint, text, integer, boolean,
  smallint, text[], text[], integer
) to authenticated;

-- ═══ update_listing RPC (fields + wants; photos not editable in Phase 2) ═══
create or replace function public.update_listing(
  p_id uuid,
  p_title text,
  p_description text,
  p_category_id smallint,
  p_condition text,
  p_ask_centavos integer,
  p_accepts_cash boolean,
  p_meetup_spot_id smallint,
  p_wants text[],
  p_estimated_value_centavos integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_intent public.listing_intent;
begin
  select owner_id, intent into v_owner, v_intent from public.listings where id = p_id;

  if v_owner is null then
    raise exception 'Listing not found.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'You can only edit your own listings.';
  end if;

  update public.listings set
    title = p_title,
    description = nullif(p_description, ''),
    category_id = p_category_id,
    condition = p_condition,
    ask_centavos = case when v_intent = 'give' then null else p_ask_centavos end,
    estimated_value_centavos = case when v_intent = 'swap' then p_estimated_value_centavos else null end,
    accepts_cash = case when v_intent = 'give' then false else coalesce(p_accepts_cash, false) end,
    meetup_spot_id = p_meetup_spot_id
  where id = p_id;

  if p_wants is not null then
    delete from public.listing_wants where listing_id = p_id;
    if array_length(p_wants, 1) > 0 then
      insert into public.listing_wants (listing_id, label, position)
      select p_id, w, ord - 1 from unnest(p_wants) with ordinality as t(w, ord);
    end if;
  end if;
end;
$$;

grant execute on function public.update_listing(
  uuid, text, text, smallint, text, integer, boolean, smallint, text[], integer
) to authenticated;
