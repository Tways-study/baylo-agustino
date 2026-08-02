-- supabase/migrations/20260901000000_phase4_offers.sql
-- Phase 4: The offer engine — all tables ship with RLS enabled in this
-- same file, per project convention.

-- ═══ listings: optional estimated value for swap (Design Decision 1) ═══
alter table public.listings
  add column estimated_value_centavos integer check (estimated_value_centavos >= 0);

comment on column public.listings.estimated_value_centavos is
  'Optional, swap-only. The owner''s own rough estimate, used only to render
   the balance beam''s plain-language read — never shown as a hard price.';

-- ═══ offer_status ═══
create type public.offer_status as enum
  ('pending', 'accepted', 'declined', 'countered', 'withdrawn', 'expired', 'cancelled');
-- 'completed' is Phase 5 scope (two-sided deal_confirmations trigger) — not
-- reachable from any Phase 4 transition, but reserved now so Phase 5's
-- migration doesn't need to alter this type.

-- ═══ offers ═══
create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings on delete cascade,
  root_offer_id   uuid not null,
  from_user_id    uuid not null references public.profiles on delete cascade,
  to_user_id      uuid not null references public.profiles on delete cascade,
  parent_offer_id uuid references public.offers,
  cash_centavos   integer not null default 0 check (cash_centavos >= 0),
  cash_direction  text not null default 'from_offerer'
                    check (cash_direction in ('from_offerer', 'to_offerer')),
  note            text check (char_length(note) <= 500),
  status          public.offer_status not null default 'pending',
  expires_at      timestamptz not null default now() + interval '48 hours',
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  constraint different_parties check (from_user_id <> to_user_id)
);
alter table public.offers
  add constraint offers_root_offer_id_fkey foreign key (root_offer_id) references public.offers (id);
-- Self-referencing FK added as a second statement — can't be declared
-- inline before the table exists in the catalog.

create index on public.offers (listing_id);
create index on public.offers (root_offer_id);
create index on public.offers (to_user_id, status);
create index on public.offers (from_user_id, status);

-- Only one live (pending) root-level offer per listing+offerer pair.
create unique index one_live_offer_per_pair
  on public.offers (listing_id, from_user_id)
  where status = 'pending';

alter table public.offers enable row level security;
revoke insert, update, delete on public.offers from authenticated;

create policy "offers visible only to the two parties"
  on public.offers for select
  using (auth.uid() in (from_user_id, to_user_id));

-- Belt-and-suspenders (RPCs are SECURITY DEFINER and bypass RLS already —
-- these exist so RLS itself is never the only thing standing between a
-- user and someone else's offer, matching the Phase 2 pattern).
create policy "offerer can withdraw own pending offer"
  on public.offers for update
  using (auth.uid() = from_user_id and status = 'pending')
  with check (status = 'withdrawn');

create policy "recipient can respond to pending offer"
  on public.offers for update
  using (auth.uid() = to_user_id and status = 'pending')
  with check (status in ('accepted', 'declined', 'countered'));

-- ═══ offer_items — items the ROOT offerer put on the table, fixed for the
-- life of the thread (Design Decision 5) ═══
create table public.offer_items (
  root_offer_id uuid not null references public.offers on delete cascade,
  listing_id    uuid not null references public.listings on delete cascade,
  primary key (root_offer_id, listing_id)
);
alter table public.offer_items enable row level security;
revoke insert, update, delete on public.offer_items from authenticated;

create policy "offer items visible with parent offer"
  on public.offer_items for select
  using (
    exists (
      select 1 from public.offers
      where offers.root_offer_id = offer_items.root_offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ in-app notifications (Design Decision 2 — push deferred to Phase 8) ═══
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  offer_id uuid not null references public.offers on delete cascade,
  kind text not null check (kind in
    ('offer_received', 'offer_countered', 'offer_accepted', 'offer_declined',
     'offer_withdrawn', 'offer_expired')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
revoke insert, update, delete on public.notifications from authenticated;

create policy "users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "users mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and read_at is not null);

grant update (read_at) on public.notifications to authenticated;

-- ═══ offer_items ownership trigger — the backstop that makes "cannot
-- offer an item you don't own even via direct API call" actually true ═══
create or replace function public.enforce_offer_item_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_user uuid;
  v_item_owner uuid;
  v_item_status public.listing_status;
begin
  select from_user_id into v_from_user from public.offers where id = new.root_offer_id;
  select owner_id, status into v_item_owner, v_item_status
    from public.listings where id = new.listing_id;

  if v_item_owner is null then
    raise exception 'Listing not found.';
  end if;
  if v_item_owner <> v_from_user then
    raise exception 'You can only offer listings you own.';
  end if;
  if v_item_status <> 'active' then
    raise exception 'Only active listings can be offered.';
  end if;

  return new;
end;
$$;

create trigger offer_item_ownership_check
  before insert on public.offer_items
  for each row execute function public.enforce_offer_item_ownership();

-- ═══ create_offer ═══
create or replace function public.create_offer(
  p_listing_id uuid,
  p_item_listing_ids uuid[],
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
  v_offerer uuid := auth.uid();
  v_owner uuid;
  v_listing_status public.listing_status;
  v_listing_intent public.listing_intent;
  v_expires_at timestamptz;
  v_offer_id uuid;
  v_recent_count integer;
  v_item_count integer;
begin
  if v_offerer is null then
    raise exception 'Not authenticated.';
  end if;

  select owner_id, status, intent, expires_at
    into v_owner, v_listing_status, v_listing_intent, v_expires_at
    from public.listings where id = p_listing_id;

  if v_owner is null then
    raise exception 'Listing not found.';
  end if;
  if v_owner = v_offerer then
    raise exception 'You cannot offer on your own listing.';
  end if;
  if v_listing_status <> 'active' or v_expires_at < now() then
    raise exception 'This listing is no longer accepting offers.';
  end if;

  select count(*) into v_recent_count
    from public.offers
    where from_user_id = v_offerer and created_at > now() - interval '24 hours';
  if v_recent_count >= 20 then
    raise exception 'You have reached today''s limit of 20 offers. Try again tomorrow.';
  end if;

  if exists (
    select 1 from public.offers
    where listing_id = p_listing_id
      and status = 'pending'
      and v_offerer in (from_user_id, to_user_id)
  ) then
    raise exception 'You already have an open negotiation on this listing.';
  end if;

  if v_listing_intent = 'give' then
    p_item_listing_ids := null;
    p_cash_centavos := 0;
    p_cash_direction := 'from_offerer';
  end if;

  v_item_count := coalesce(array_length(p_item_listing_ids, 1), 0);
  if v_item_count = 0 and coalesce(p_cash_centavos, 0) = 0 and v_listing_intent <> 'give' then
    raise exception 'Add at least one item or some cash.';
  end if;

  v_offer_id := gen_random_uuid();

  insert into public.offers (
    id, listing_id, root_offer_id, from_user_id, to_user_id,
    cash_centavos, cash_direction, note
  ) values (
    v_offer_id, p_listing_id, v_offer_id, v_offerer, v_owner,
    coalesce(p_cash_centavos, 0), coalesce(p_cash_direction, 'from_offerer'), nullif(p_note, '')
  );

  if v_item_count > 0 then
    insert into public.offer_items (root_offer_id, listing_id)
    select v_offer_id, unnest(p_item_listing_ids);
  end if;

  insert into public.notifications (user_id, offer_id, kind)
  values (v_owner, v_offer_id, 'offer_received');

  return v_offer_id;
end;
$$;

grant execute on function public.create_offer(uuid, uuid[], integer, text, text) to authenticated;

-- ═══ counter_offer — items carried forward by reference, never re-inserted ═══
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

grant execute on function public.counter_offer(uuid, integer, text, text) to authenticated;

-- ═══ accept_offer / decline_offer / withdraw_offer ═══
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

grant execute on function public.accept_offer(uuid) to authenticated;

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

grant execute on function public.decline_offer(uuid) to authenticated;

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

grant execute on function public.withdraw_offer(uuid) to authenticated;

-- ═══ get_offer_thread — the full negotiation chain, root to leaf.
-- SECURITY INVOKER (default, no "security definer") so the caller's own
-- RLS on `offers` applies row-by-row inside the recursive CTE — a third
-- party gets zero rows back, no separate authorization check needed. ═══
create or replace function public.get_offer_thread(p_offer_id uuid)
returns setof public.offers
language sql
stable
set search_path = ''
as $$
  with recursive chain as (
    select * from public.offers where id = (
      select root_offer_id from public.offers where id = p_offer_id
    )
    union all
    select o.* from public.offers o
    join chain c on o.parent_offer_id = c.id
  )
  select * from chain order by created_at asc;
$$;

grant execute on function public.get_offer_thread(uuid) to authenticated;

-- ═══ expiry — pg_cron calls this directly, no Edge Function
-- (Design Decision 3) ═══
create or replace function public.expire_stale_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.offers
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id, from_user_id
  )
  insert into public.notifications (user_id, offer_id, kind)
  select from_user_id, id, 'offer_expired' from expired;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
-- No EXECUTE grant to authenticated — only pg_cron (as the function owner)
-- ever calls this. Supabase auto-grants EXECUTE on new public-schema
-- functions to anon/authenticated via default privileges (the same reason
-- table grants are explicitly revoked above), so that default must be
-- revoked explicitly here too or this function is callable directly by
-- any authenticated client despite having no internal auth check.
-- Must also revoke from PUBLIC: a role-specific revoke does not override
-- a PUBLIC grant, and plain Postgres grants EXECUTE to PUBLIC by default
-- on function creation.
revoke execute on function public.expire_stale_offers() from public;
revoke execute on function public.expire_stale_offers() from anon, authenticated;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'expire-stale-offers',
  '*/5 * * * *',
  $$select public.expire_stale_offers()$$
);
