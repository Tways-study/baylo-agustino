# Phase 4 — The Offer Engine Design

**Date:** 2026-08-02
**Status:** Draft — pending review
**Scope:** The thing that makes this not a Facebook group.

---

## Context

Phases 1–3 shipped identity, listings, and discovery — a student can find a listing but has no way to actually transact against it. `app/(app)/l/[code]/page.tsx` already renders a disabled "Make an offer" button (`title="Coming in a later phase"`) as a placeholder from Phase 2. Phase 4 replaces that placeholder with the real thing: an offer composer, a negotiation state machine (offer → counter → counter → accept/decline/withdraw/expire), and an inbox. The build spec flags this as the highest-risk phase and mandates writing state transitions as pure, unit-tested functions before touching UI — this design follows that literally.

Four scope decisions were made explicitly during brainstorming, each resolving a real gap or ambiguity in the build spec rather than following it verbatim:

1. **Item valuation.** Only `sale` listings carry a price (`ask_centavos`) today; `swap` and `give` have none, but the balance beam needs _some_ value to compare against. Resolution: add an optional `estimated_value_centavos` to `listings`, meaningful only for `swap`. If either side of a trade lacks a usable value, the beam shows a can't-gauge read rather than guessing.
2. **Notifications.** The spec asks for push + in-app on every state change. No push infrastructure exists (no service worker, no VAPID keys, no subscription storage). Resolution: build a real in-app notification model this phase; defer web push to Phase 8 hardening as its own scoped addition.
3. **Expiry mechanism.** The spec asks for `pg_cron` + an Edge Function. This environment has no local Docker and Edge Function deployment is unverified here. Resolution: `pg_cron` calls a plain `plpgsql` function directly — nothing to deploy, verifiable live via `psql` like every migration this project has shipped so far.
4. **Give-listing offers.** Give listings suppress price entirely; the full item/cash/beam composer doesn't make sense for them. Resolution: a simplified claim flow — one-tap "I'll take it" with an optional note, still a real `offers` row so accept/decline/counter/expiry stay uniform, just a lighter composer UI and no beam.
5. **Counter-offer items.** The spec's "roles swapped" language conflicts with the "`offer_items` owned by `from_user_id`" invariant once a counter tries to re-pick items (the owner doesn't own the original offerer's items). Resolution: items are fixed at the root offer for the life of a negotiation thread; counters (either side) can only adjust `cash_centavos` / `cash_direction` / `note`. `offer_items` is stored once, against the root offer, and referenced — not duplicated — by every row in the thread.

---

## Data Model

**Migration:** `supabase/migrations/20260901000000_phase4_offers.sql` — tables, RLS, triggers, RPCs, and the `pg_cron` schedule all in this one file, per project convention (migration + its policies never ship in separate turns).

```sql
-- ═══ listings: optional estimated value for swap ═══
alter table public.listings
  add column estimated_value_centavos integer check (estimated_value_centavos >= 0);

comment on column public.listings.estimated_value_centavos is
  'Optional, swap-only. The owner''s own rough estimate, used only to render
   the balance beam''s plain-language read — never shown as a hard price.';
```

This column is read directly by `getListingByCode`/`getFeedListings` (already `select *`/named-column selects — no query change needed) but is **written** through Phase 2's existing `create_listing`/`update_listing` RPCs, which predate this column. Both RPCs need one new parameter, `p_estimated_value_centavos integer`, stored only when `p_intent = 'swap'` (mirrors the existing `case when p_intent = 'give' then null else ...` pattern already in `create_listing` for `ask_centavos`) and forced `null` otherwise. This is a genuine signature change to already-shipped Phase 2 functions, done via `create or replace function` in this Phase 4 migration — not a new migration editing old migration files in place (the pattern the Phase 3 final review flagged as worth moving away from). `lib/listings/schemas.ts`'s `createListingSchema`/`updateListingSchema` swap branches gain one optional field (`estimatedValueCentavos: z.coerce.number().int().positive().optional()`), and `ListingDetailsFields.tsx` (Phase 2, shared by post + edit) gains one optional input, shown only when `intent === 'swap'`.

```sql

-- ═══ offer_status ═══
create type public.offer_status as enum
  ('pending', 'accepted', 'declined', 'countered', 'withdrawn', 'expired', 'cancelled');
-- 'completed' is Phase 5 scope (two-sided deal_confirmations trigger) — not
-- reachable from any Phase 4 transition, but the enum value is reserved now
-- so Phase 5's migration doesn't need to alter this type.

-- ═══ offers ═══
create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings on delete cascade,
  root_offer_id   uuid not null,                    -- self-reference, see below
  from_user_id    uuid not null references public.profiles on delete cascade,
  to_user_id      uuid not null references public.profiles on delete cascade,
  parent_offer_id uuid references public.offers,     -- set when this is a counter
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
-- Added as a second statement (not inline) because a self-referencing FK on
-- a brand-new table can't be declared inline before the table exists in the
-- catalog; this is the standard Postgres pattern for self-referencing FKs.

create index on public.offers (listing_id);
create index on public.offers (root_offer_id);
create index on public.offers (to_user_id, status);
create index on public.offers (from_user_id, status);

-- Only one live (pending) offer per listing+offerer pair at a time.
create unique index one_live_offer_per_pair
  on public.offers (listing_id, from_user_id)
  where status = 'pending';

alter table public.offers enable row level security;
revoke insert, update, delete on public.offers from authenticated;

create policy "offers visible only to the two parties"
  on public.offers for select
  using (auth.uid() in (from_user_id, to_user_id));

-- ═══ offer_items — items the ROOT offerer put on the table, fixed for the
-- life of the thread (see Decision 5 above) ═══
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

-- ═══ in-app notifications (Decision 2) ═══
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
-- The one direct-write exception in this migration: marking a notification
-- read changes nothing security-sensitive, and routing it through an RPC
-- for a single boolean flip would be ceremony with no payoff. Every other
-- write on every other new table goes through SECURITY DEFINER RPCs.
grant update (read_at) on public.notifications to authenticated;
```

---

## Ownership & Rate-Limit Enforcement

```sql
-- ═══ offer_items ownership trigger (BEFORE INSERT only — items never
-- change after the root offer, so no UPDATE/DELETE case to guard) ═══
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
```

This trigger is the backstop the spec's acceptance criterion asks for ("a user cannot offer an item they don't own even via direct API call") — it fires regardless of whether the insert came through `create_offer` or a hypothetical future direct call, because `authenticated` has no direct `INSERT` on `offer_items` in the first place; the trigger protects the RPC's own internal insert from a logic bug, and protects forever against anyone who later adds a second write path.

---

## RPCs

All `SECURITY DEFINER`, `SET search_path = ''`, fully-qualified identifiers — same posture as every write path since Phase 2.

```sql
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
  -- Belt-and-suspenders with one_live_offer_per_pair below: that index only
  -- catches a second *root* offer from the same offerer. This also catches
  -- the case where the caller is mid-negotiation as the current recipient
  -- of a counter (from_user_id swapped to the owner) and tries to open a
  -- second, unrelated thread on the same listing at the same time.

  -- Give listings: simplified claim flow, enforced server-side regardless
  -- of what the client sent (Decision 4 — never trust the UI to have hidden
  -- the fields correctly).
  if v_listing_intent = 'give' then
    p_item_listing_ids := null;
    p_cash_centavos := 0;
    p_cash_direction := 'from_offerer';
  end if;

  v_item_count := coalesce(array_length(p_item_listing_ids, 1), 0);
  if v_item_count = 0 and coalesce(p_cash_centavos, 0) = 0 and v_listing_intent <> 'give' then
    raise exception 'Add at least one item or some cash.';
  end if;

  -- Generated up front so id and root_offer_id can be the same value in one
  -- INSERT — a root offer's root_offer_id always equals its own id. Doing
  -- this as two separate gen_random_uuid() calls in the VALUES list (an
  -- earlier draft of this function did) would produce two different UUIDs
  -- and violate the self-referencing FK before any fixup UPDATE could run.
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
    -- Raises via the BEFORE INSERT trigger (enforce_offer_item_ownership)
    -- if any listing isn't owned by v_offerer or isn't active — the whole
    -- statement, and therefore the whole function, rolls back.
  end if;

  insert into public.notifications (user_id, offer_id, kind)
  values (v_owner, v_offer_id, 'offer_received');

  return v_offer_id;
end;
$$;

grant execute on function public.create_offer(uuid, uuid[], integer, text, text) to authenticated;
```

```sql
-- ═══ counter_offer — items carried by reference, not re-inserted ═══
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
  if coalesce(p_cash_centavos, 0) = 0 and v_root_offer_id = p_offer_id then
    -- Cosmetic guard only, not a security boundary: a counter that changes
    -- nothing is a UX mistake (the composer should prevent it), not an
    -- invariant worth hard-blocking server-side beyond a friendly message.
    null;
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
```

```sql
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
  -- same listing stay pending — the owner may still fall back to one of
  -- them if this deal falls through.

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
```

```sql
-- ═══ expiry — pg_cron calls this directly, no Edge Function (Decision 3) ═══
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

-- No EXECUTE grant to authenticated — this only ever runs as the function
-- owner via pg_cron, never callable by a client.

select cron.schedule(
  'expire-stale-offers',
  '*/5 * * * *',
  $$select public.expire_stale_offers()$$
);
```

**Symmetric update policy** (referenced in the brainstorm — lets `withdraw_offer`'s own row-level check be backed by RLS too, not just the RPC's internal logic):

```sql
create policy "offerer can withdraw own pending offer"
  on public.offers for update
  using (auth.uid() = from_user_id and status = 'pending')
  with check (status = 'withdrawn');

create policy "recipient can respond to pending offer"
  on public.offers for update
  using (auth.uid() = to_user_id and status = 'pending')
  with check (status in ('accepted', 'declined', 'countered'));
```

These two policies exist even though `authenticated` has no direct `UPDATE` grant at all (`revoke ... from authenticated` above) — belt-and-suspenders, matching the Phase 2 pattern where RLS and RPC-only-writes are layered rather than either standing alone. If a future migration ever grants direct `UPDATE` (it shouldn't, but "shouldn't" isn't a security boundary), these policies are already the correct shape.

---

## Balance Heuristic — `lib/offers/balance.ts`

```ts
export type BalanceRead =
  | 'heavily_theirs'
  | 'slightly_theirs'
  | 'close_enough'
  | 'slightly_yours'
  | 'heavily_yours'
  | 'cant_gauge'

export interface BalanceInput {
  listingValueCentavos: number | null
  offeredItemsValueCentavos: (number | null)[]
  cashCentavos: number
  cashDirection: 'from_offerer' | 'to_offerer'
}

export function computeBalance(input: BalanceInput): BalanceRead {
  if (input.listingValueCentavos === null || input.listingValueCentavos === 0) {
    return 'cant_gauge'
  }
  if (input.offeredItemsValueCentavos.some((v) => v === null)) {
    return 'cant_gauge'
  }

  const itemsTotal = input.offeredItemsValueCentavos.reduce((sum, v) => sum + (v ?? 0), 0)
  const cashDelta =
    input.cashDirection === 'from_offerer' ? input.cashCentavos : -input.cashCentavos
  const offeredValue = itemsTotal + cashDelta

  const ratio = offeredValue / input.listingValueCentavos

  if (ratio < 0.7) return 'heavily_theirs'
  if (ratio < 0.9) return 'slightly_theirs'
  if (ratio <= 1.1) return 'close_enough'
  if (ratio <= 1.3) return 'slightly_yours'
  return 'heavily_yours'
}

export const BALANCE_READ_COPY: Record<BalanceRead, string> = {
  heavily_theirs: 'Heavily in their favor',
  slightly_theirs: 'Slightly in their favor',
  close_enough: 'Close enough — send it',
  slightly_yours: 'Slightly in your favor',
  heavily_yours: 'Heavily in your favor',
  cant_gauge: "Hard to gauge — there's no estimate to compare against",
}
```

A missing per-item value forces `cant_gauge` for the _whole_ read rather than being silently treated as ₱0 — a give-listed item folded into a swap offer (rare, but possible: you can offer any of your own active listings, including give ones) must not quietly make the beam think you offered nothing for that slot and tilt against you, or worse, make an unbalanced trade look artificially fair.

**Test table** (`lib/offers/balance.test.ts`) covers: each of the five numeric bands, both boundary values of every threshold (0.7, 0.9, 1.1, 1.3 exactly), `cash_direction` in both directions, zero cash, `listingValueCentavos: null`, an offered item with a `null` value mixed among valid ones, and `listingValueCentavos: 0` (division-by-zero guard).

---

## State Machine — `lib/offers/state-machine.ts`

Per CLAUDE.md's standing rule ("write state transitions as pure, unit-tested functions... before touching UI"), this is a pure client-side predictor mirroring the RPCs' actual rules — used only to disable/enable action buttons optimistically. The database remains the sole authority; this function never bypasses an RPC call, it just avoids showing a button that would fail server-side.

```ts
export type OfferStatus =
  'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn' | 'expired' | 'cancelled'

export type OfferAction = 'accept' | 'decline' | 'counter' | 'withdraw'

export type OfferRole = 'offerer' | 'recipient'

export function canTransition(status: OfferStatus, action: OfferAction, role: OfferRole): boolean {
  if (status !== 'pending') return false

  switch (action) {
    case 'accept':
    case 'decline':
    case 'counter':
      return role === 'recipient'
    case 'withdraw':
      return role === 'offerer'
  }
}
```

**Test table** (`lib/offers/state-machine.test.ts`): every `(status, action, role)` combination — all 7 statuses × 4 actions × 2 roles = 56 cases — asserting `true` only for the 4 legal cells (`pending`+`accept`/`decline`/`counter`+`recipient`, `pending`+`withdraw`+`offerer`) and `false` for the other 52, including every illegal one explicitly (matches the spec's literal "including the illegal ones").

---

## Screens

### Offer composer — `/l/[code]/offer`

Server Component shell (fetch the target listing + the current user's own active listings server-side, matching the post flow's pattern of avoiding a client fetch waterfall), rendering a client `OfferComposer`.

- **Give-listing path (Decision 4):** no item picker, no cash control, no beam. Just the listing summary, an optional note field, and a "Claim this" primary button. Calls `createOffer` with empty items/cash — the server enforces this regardless (see `create_offer` above).
- **Swap/sale path:** item picker (`from your shelf` — multi-select from the caller's own `active` listings, reusing the `pick`/`tick` visual pattern from the mockup), a cash amount + direction control ("Even it out" — amount input plus a two-way toggle for `cash_direction`), a note field, and the balance beam rendered live from `computeBalance()` as the picks/cash change. Submit disabled until at least one item or nonzero cash is present (mirrors the RPC's own validation, client-side for immediate feedback).
- On submit: `createOffer(listingId, itemIds, cashCentavos, cashDirection, note)` Server Action → `create_offer` RPC → redirect to `/deals/[newOfferId]`.

### Offer inbox — `/deals`

No mockup exists for this screen (build spec only mocked the composer and deal room) — original layout work within the existing Stamped Heraldry tokens, following the same approach Phase 2 took for the post flow.

- `Ribbon "Deals"` header.
- A Received/Sent segmented toggle, visually consistent with the existing filter-chip pattern from Phase 3 (`FilterChips.tsx`'s pill styling).
- **Received** = threads on listings the caller owns. **Sent** = threads the caller initiated on someone else's listing. This split is stable across counters because `listing_id.owner_id` never changes mid-negotiation — only `from_user_id`/`to_user_id` swap (Decision-adjacent reasoning from the brainstorm).
- Within each tab, sections in this order: _Needs your response_ (leaf `pending`, caller is leaf's `to_user_id`) → _Waiting on them_ (leaf `pending`, other side's turn) → _Accepted_ → _Closed_ (declined/withdrawn/expired/cancelled).
- Each row is a new `OfferRow` component (listing thumbnail via the existing `getSignedImageUrls` helper, counterparty display name, a status `Chip`, relative expiry via the existing `formatRelativeTime`) — same visual family as `MiniListingRow`, not a new pattern invented from scratch.
- Query: **no recursion needed here.** Because a counter always marks exactly its immediate parent `countered` and never leaves two live rows in the same chain, the current leaf of every thread is simply the one row per `root_offer_id` whose `status <> 'countered'` — every older row in a chain is `countered`, every terminal or currently-live row is not. So the inbox query is a flat `where status <> 'countered' and (from_user_id = auth.uid() or to_user_id = auth.uid())`, split into Received/Sent by joining `listings.owner_id`. The recursive CTE (below) exists for reconstructing the _full_ chain — needed on the offer detail page and the acceptance-criteria test, not for the inbox list.

### Offer detail — `/deals/[id]`

Also original design (no mockup). Server Component fetching the full thread (root + every counter, ordered root-to-leaf) plus the target listing, via the recursive CTE the spec's acceptance criterion asks for:

```sql
with recursive chain as (
  select * from public.offers where id = (
    select root_offer_id from public.offers where id = $1
  )
  union all
  select o.* from public.offers o
  join chain c on o.parent_offer_id = c.id
)
select * from chain order by created_at asc;
```

Called with any offer id in a thread (not just the root — `$1` resolves to the thread's `root_offer_id` first, so the detail page works whether it's linked from a fresh offer or a specific counter), this returns every row in the negotiation in order. RLS's existing `"offers visible only to the two parties"` policy still applies per-row inside the CTE — a third party's `select` returns nothing, satisfying the spec's "immutable chain queryable in one recursive CTE" criterion without needing a separate authorization check bolted on.

- Each entry in the chain rendered as a compact card: who, cash/items/note, timestamp, and (for a `countered` row) a small "countered" marker linking visually to the next entry.
- The live leaf's balance beam re-rendered (unless the listing is `give`).
- Action row at the bottom: `Accept` / `Decline` / `Counter` / `Withdraw`, filtered through `canTransition()` against the caller's role at the leaf — never all four shown regardless of state.
- `Counter` opens a lightweight sheet (cash + note only, per Decision 5 — no item re-picker) calling `counterOffer`.

### Listing detail — `app/(app)/l/[code]/page.tsx` (existing file, modified)

The existing disabled "Make an offer" button becomes a real `Link` to `/l/[code]/offer`, enabled whenever `listing.status === 'active'` and not expired and the caller isn't the owner (mirrors the existing `isOwner` branch already in this file). `Message` stays disabled — chat is Phase 5.

### Notifications (Decision 2)

A small bell icon + unread-count badge, added to the existing header area (not the bottom nav — five slots are already full). Server Component fetches unread `notifications` joined to their `offers`/`listings` for display text; tapping a notification marks it read (the one direct-write path in this migration) and navigates to `/deals/[offer_id]`. No dedicated full-page notification list in Phase 4 — the dropdown from the header is sufficient at this scale; a full history page is a reasonable Phase 8 addition if ever needed, not built speculatively now.

---

## pgTAP Tests — `supabase/tests/phase4_offers_rls.sql`

- Privilege checks: `authenticated` has `SELECT` but not `INSERT`/`UPDATE`/`DELETE` on `offers`, `offer_items`, `notifications`; has `EXECUTE` on `create_offer`, `counter_offer`, `accept_offer`, `decline_offer`, `withdraw_offer`; does **not** have `EXECUTE` on `expire_stale_offers`.
- `create_offer` rejects an unauthenticated call (`auth.uid()` null in a raw pgTAP session — same real, unsimulated pattern as Phase 2's `create_listing` test).
- Ownership trigger: inserting into `offer_items` with a `listing_id` not owned by the root offer's `from_user_id` raises.
- `one_live_offer_per_pair` unique index: a second `pending` insert for the same `(listing_id, from_user_id)` violates uniqueness (direct SQL insert against the table bypassing RPC — the constraint itself must hold at the storage layer, not just in application logic).
- `expire_stale_offers()`: seed a `pending` offer with `expires_at` in the past, call the function directly, assert `status = 'expired'` and a `notifications` row was inserted for the original offerer.
- Recursive-chain query: build a 3-row chain (root pending → countered → new pending) via direct inserts, run the offer-detail page's recursive CTE, assert it returns exactly the 3 rows in root-to-leaf order and that the two `countered` rows are immutable (their `cash_centavos`/`note`/`from_user_id`/`to_user_id` match what was originally inserted, never overwritten by the counter that superseded them).
- `notifications` RLS: a second seeded user cannot `select` another user's notification rows.

Live verification (offer → counter → counter → accept end-to-end, and the "cannot offer an item you don't own via direct RPC call" criterion specifically) follows this session's established pattern: hosted Supabase project + `psql` via the connection pooler, no Docker required — same method used for Phases 1–3.

---

## Acceptance Criteria

| Build-spec "Done when"                                                                                                   | How it's proven                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Full negotiation (offer → counter → counter → accept) produces a correct, immutable chain queryable in one recursive CTE | pgTAP recursive-chain test; live end-to-end verification against the hosted project                            |
| A user cannot offer an item they don't own even via direct API call                                                      | pgTAP: `create_offer` RPC and raw `offer_items` insert both tested against a listing owned by a different user |
| Expiry fires reliably                                                                                                    | pgTAP: seeded past-due offer + direct `expire_stale_offers()` call                                             |
| Every transition has a unit test including the illegal ones                                                              | `lib/offers/state-machine.test.ts`, all 56 `(status, action, role)` cells                                      |
| TypeScript clean                                                                                                         | `npx tsc --noEmit`                                                                                             |
| ESLint clean                                                                                                             | `npx eslint . --max-warnings 0`                                                                                |
| Build clean                                                                                                              | `npm run build`; `/l/[code]/offer`, `/deals`, `/deals/[id]` appear in the route manifest                       |

---

## Deferred Out of Phase 4 Scope

- **Web push notifications** (Decision 2) — Phase 8 hardening.
- **Chat, meetup scheduling, two-sided completion** — Phase 5 (Deal room), unaffected by this design; `offer_status` reserves `'completed'` for that phase's trigger to set.
- **A dedicated full-page notification history** — the header dropdown is sufficient at Phase 4's scale.
