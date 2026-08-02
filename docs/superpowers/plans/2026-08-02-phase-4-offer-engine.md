# Phase 4 — The Offer Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled "Make an offer" button with a real negotiation engine — offer composer with a balance-beam read, accept/decline/counter/withdraw, 48h expiry, an inbox, and in-app notifications.

**Architecture:** All offer writes go through `SECURITY DEFINER` RPCs (`authenticated` has zero direct DML on `offers`/`offer_items`), same posture as every write path since Phase 2. Items are fixed at the root offer for the life of a negotiation thread; counters only adjust cash and note. Expiry runs via `pg_cron` calling a plain SQL function directly — no Edge Function, nothing to deploy. Two new pure, exhaustively-unit-tested TS modules (`lib/offers/balance.ts`, `lib/offers/state-machine.ts`) exist before any UI touches them, per CLAUDE.md's standing rule for this phase.

**Tech Stack:** Next.js 15 Server Components/Actions, Supabase (Postgres RLS + `pg_cron`), Zod, TypeScript strict.

**Design spec:** `docs/superpowers/specs/2026-08-02-phase-4-offer-engine-design.md` — read this first if anything below is ambiguous; it's the source of the five scope decisions this plan implements (item valuation, notification scope, expiry mechanism, give-listing offers, counter-offer items).

## Global Constraints

- Money is `integer` centavos, never `float`. Never `Number.parseFloat` on a stored value — only on raw peso-string user input, same as `lib/listings/format.ts`'s existing `pesosToCentavos`.
- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully qualified identifiers (`public.table`, not `table`).
- RLS enabled at table creation, in the same migration file that creates the table. No policy added in a later migration.
- `authenticated` gets zero direct `INSERT`/`UPDATE`/`DELETE` on `offers`, `offer_items`, `notifications` — all writes through RPCs. The one exception is `notifications.read_at`, granted at the column level (mirrors the `profiles` column-grant pattern from Phase 1).
- Offer expiry: 48 hours (`now() + interval '48 hours'`), enforced by a `pg_cron` job every 5 minutes calling `public.expire_stale_offers()` directly — no Edge Function.
- Rate limit: 20 offers/day per offerer, enforced inside `create_offer`, same shape as Phase 2's 10-listings/day check.
- `offer_status` enum: `'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn' | 'expired' | 'cancelled'`. `'completed'` is reserved for Phase 5, never reachable from any Phase 4 transition.
- `cash_direction`: `'from_offerer' | 'to_offerer'` only.
- Balance heuristic thresholds (ratio = offered value ÷ listing value): `<0.7` heavily-theirs, `<0.9` slightly-theirs, `≤1.1` close-enough, `≤1.3` slightly-yours, `>1.3` heavily-yours. Any missing value on either side → `cant_gauge`, never a guess.
- No `any` anywhere — ESLint enforces this with zero tolerance.
- Zod schemas live in `lib/offers/schemas.ts` (colocated per domain, matching `lib/listings/schemas.ts`), not a flat `lib/schemas/`.
- `estimated_value_centavos` is optional and swap-only; `sale` continues to use `ask_centavos` as its value, `give` has no value and skips the balance beam entirely.

## File Map

| File                                                   | Action | Purpose                                                                                                                |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260901000000_phase4_offers.sql` | Create | `offers`, `offer_items`, `notifications`, `listings.estimated_value_centavos`, triggers, RPCs, RLS, `pg_cron` schedule |
| `supabase/tests/phase4_offers_rls.sql`                 | Create | pgTAP: privileges, ownership trigger, unique index, expiry, recursive chain, notification RLS                          |
| `types/database.ts`                                    | Modify | New tables/enums/functions, `estimated_value_centavos` on `listings`                                                   |
| `lib/offers/balance.ts`                                | Create | Pure `computeBalance()` heuristic                                                                                      |
| `lib/offers/balance.test.ts`                           | Create | Test table — every threshold boundary + can't-gauge paths                                                              |
| `lib/offers/state-machine.ts`                          | Create | Pure `canTransition()` predictor                                                                                       |
| `lib/offers/state-machine.test.ts`                     | Create | Exhaustive 56-cell test table                                                                                          |
| `lib/offers/schemas.ts`                                | Create | Zod for offer composer + counter inputs                                                                                |
| `lib/offers/queries.ts`                                | Create | `getOwnOfferableListings`, `getOfferThread`, `getInboxThreads`, `getUnreadNotifications`                               |
| `lib/offers/actions.ts`                                | Create | Server Actions: `createOffer`, `counterOffer`, `acceptOffer`, `declineOffer`, `withdrawOffer`, `markNotificationRead`  |
| `lib/listings/schemas.ts`                              | Modify | Add optional `estimatedValueCentavos` to the swap branch                                                               |
| `lib/listings/actions.ts`                              | Modify | Pass `p_estimated_value_centavos` through to the RPCs                                                                  |
| `lib/listings/queries.ts`                              | Modify | Add `estimated_value_centavos` to `ListingDetail`                                                                      |
| `app/(app)/post/ListingDetailsFields.tsx`              | Modify | One optional input, swap branch only                                                                                   |
| `app/(app)/post/PostSheet.tsx`                         | Modify | Wire the new field through to `createListing`                                                                          |
| `app/(app)/l/[code]/edit/EditListingForm.tsx`          | Modify | Wire the new field through to `updateListing`                                                                          |
| `app/(app)/l/[code]/edit/page.tsx`                     | Modify | Pass `estimatedValueCentavos` as an initial value                                                                      |
| `components/ui/BalanceBeam.tsx`                        | Create | Visual balance-beam component                                                                                          |
| `components/ui/Ribbon.tsx`                             | Modify | Optional `end` slot (non-breaking)                                                                                     |
| `components/ui/NotificationBell.tsx`                   | Create | Header bell + unread dropdown                                                                                          |
| `components/ui/OfferRow.tsx`                           | Create | Inbox row (same family as `MiniListingRow`)                                                                            |
| `components/ui/index.ts`                               | Modify | Export the three new components                                                                                        |
| `app/(app)/l/[code]/offer/page.tsx`                    | Create | Offer composer — Server Component shell                                                                                |
| `app/(app)/l/[code]/offer/OfferComposer.tsx`           | Create | Client composer (give path + swap/sale path)                                                                           |
| `app/(app)/l/[code]/page.tsx`                          | Modify | Wire the existing disabled "Make an offer" button                                                                      |
| `app/(app)/page.tsx`                                   | Modify | Render `NotificationBell` in the Ribbon's `end` slot                                                                   |
| `app/(app)/deals/page.tsx`                             | Create | Offer inbox — Server Component shell                                                                                   |
| `app/(app)/deals/DealsList.tsx`                        | Create | Client Received/Sent tabs, grouped by status                                                                           |
| `app/(app)/deals/[id]/page.tsx`                        | Create | Offer detail — Server Component shell                                                                                  |
| `app/(app)/deals/[id]/OfferThread.tsx`                 | Create | Chain display + live balance beam                                                                                      |
| `app/(app)/deals/[id]/OfferActions.tsx`                | Create | Accept/decline/counter/withdraw + counter sheet                                                                        |
| `e2e/offer-negotiation.spec.ts`                        | Create | Full flow: offer → counter → counter → accept                                                                          |
| `CLAUDE.md`                                            | Modify | Phase table → Phase 4 current                                                                                          |

---

## Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260901000000_phase4_offers.sql`

**Interfaces:**

- Produces: tables `public.offers`, `public.offer_items`, `public.notifications`; column `public.listings.estimated_value_centavos`; type `public.offer_status`; functions `public.create_offer(uuid, uuid[], integer, text, text) returns uuid`, `public.counter_offer(uuid, integer, text, text) returns uuid`, `public.accept_offer(uuid) returns void`, `public.decline_offer(uuid) returns void`, `public.withdraw_offer(uuid) returns void`, `public.expire_stale_offers() returns integer`, `public.get_offer_thread(uuid) returns setof public.offers`.

- [ ] **Step 1: Write the migration**

```sql
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
-- ever calls this.

select cron.schedule(
  'expire-stale-offers',
  '*/5 * * * *',
  $$select public.expire_stale_offers()$$
);
```

- [ ] **Step 2: Apply and eyeball**

Run: `supabase db reset` (or, per this project's established no-Docker workflow, `npx supabase db push` against the linked hosted project, then `psql` via the connection pooler to confirm). Studio/`psql` should show: `offers`, `offer_items`, `notifications` tables; `listings.estimated_value_centavos` column; `offer_status` enum; the `expire-stale-offers` entry in `cron.job` (`select * from cron.job;`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260901000000_phase4_offers.sql
git commit -m "feat: Phase 4 database migration — offers, offer_items, notifications, RPCs, pg_cron expiry"
```

---

## Task 2: pgTAP tests

**Files:**

- Create: `supabase/tests/phase4_offers_rls.sql`

**Interfaces:**

- Consumes: everything from Task 1. Requires `supabase/seed.sql`'s existing fixture users (`11111111-1111-1111-1111-111111111111`, `22222222-2222-2222-2222-222222222222`) — reuse, don't create new fixtures.

- [ ] **Step 1: Write the test file**

```sql
-- supabase/tests/phase4_offers_rls.sql
begin;
select plan(16);

-- ═══ privileges ═══
select has_table_privilege('authenticated', 'public.offers', 'SELECT', 'authenticated has SELECT on offers');
select ok(not has_table_privilege('authenticated', 'public.offers', 'INSERT'), 'authenticated cannot INSERT offers directly');
select ok(not has_table_privilege('authenticated', 'public.offer_items', 'INSERT'), 'authenticated cannot INSERT offer_items directly');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'INSERT'), 'authenticated cannot INSERT notifications directly');
select has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE', 'authenticated can UPDATE notifications.read_at');

select has_function_privilege('authenticated',
  'public.create_offer(uuid, uuid[], integer, text, text)', 'EXECUTE',
  'authenticated can call create_offer');
select has_function_privilege('authenticated',
  'public.counter_offer(uuid, integer, text, text)', 'EXECUTE',
  'authenticated can call counter_offer');
select ok(
  not has_function_privilege('authenticated', 'public.expire_stale_offers()', 'EXECUTE'),
  'authenticated cannot call expire_stale_offers directly'
);

-- ═══ create_offer rejects an unauthenticated call (real, unsimulated) ═══
select throws_ok(
  $$ select public.create_offer(gen_random_uuid(), null, 100, 'from_offerer', null) $$,
  'P0001', 'Not authenticated.', 'create_offer rejects a session with no auth.uid()'
);

-- ═══ ownership trigger — the item-you-don't-own backstop ═══
-- Seed: user1 owns a listing being offered on; user2 owns a *different*
-- listing they do NOT control as the offerer here.
select lives_ok(
  $$
  insert into public.offers (id, listing_id, root_offer_id, from_user_id, to_user_id)
  select
    '99999999-9999-9999-9999-999999999901'::uuid,
    l.id,
    '99999999-9999-9999-9999-999999999901'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    l.owner_id
  from public.listings l
  where l.owner_id <> '11111111-1111-1111-1111-111111111111'::uuid
  limit 1
  $$,
  'seed a root offer row directly for the ownership-trigger test below'
);

select throws_like(
  $$
  insert into public.offer_items (root_offer_id, listing_id)
  select '99999999-9999-9999-9999-999999999901'::uuid, l.id
  from public.listings l
  where l.owner_id <> '11111111-1111-1111-1111-111111111111'::uuid
  limit 1
  $$,
  '%You can only offer listings you own%',
  'offer_items insert rejects a listing not owned by the offer''s from_user_id'
);

-- ═══ one_live_offer_per_pair unique index ═══
select throws_ok(
  $$
  insert into public.offers (listing_id, root_offer_id, from_user_id, to_user_id)
  select listing_id, gen_random_uuid(), from_user_id, to_user_id
  from public.offers where id = '99999999-9999-9999-9999-999999999901'::uuid
  $$,
  '23505',
  'a second pending root offer for the same listing+offerer violates the unique index'
);

-- ═══ expire_stale_offers ═══
select lives_ok(
  $$
  update public.offers
  set expires_at = now() - interval '1 hour'
  where id = '99999999-9999-9999-9999-999999999901'::uuid
  $$,
  'backdate the seeded offer past its expiry for the next assertion'
);

select is(
  (select public.expire_stale_offers()),
  1,
  'expire_stale_offers expires exactly the one backdated pending offer'
);

select ok(
  exists(
    select 1 from public.notifications
    where offer_id = '99999999-9999-9999-9999-999999999901'::uuid
      and kind = 'offer_expired'
  ),
  'expiring an offer notifies the original offerer'
);

-- ═══ recursive chain via get_offer_thread ═══
select is(
  (select count(*)::int from public.get_offer_thread('99999999-9999-9999-9999-999999999901'::uuid)),
  1,
  'get_offer_thread on a single-row (now-expired) thread returns exactly that row'
);

-- ═══ notifications RLS: a second user cannot read another user's row ═══
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
select is(
  (select count(*)::int from public.notifications where offer_id = '99999999-9999-9999-9999-999999999901'::uuid),
  0,
  'user2 cannot see the notification addressed to user1'
);
reset role;

select * from finish();
rollback;
```

Note: the deferred-nature caveats that applied to Phase 2's swap-requires-want trigger don't apply here — `offer_items` ownership is enforced by a plain (non-deferred) `BEFORE INSERT` trigger, so `throws_like` inside the pgTAP transaction catches it directly.

- [ ] **Step 2: Run until green**

Run: `supabase test db` (or, per this project's no-Docker fallback, apply via `psql` against the hosted project and run the assertions manually, documenting the results the same way Task 16 of the Phase 3 plan did).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase4_offers_rls.sql
git commit -m "test: Phase 4 pgTAP — offers RLS, ownership trigger, unique index, expiry, notifications"
```

---

## Task 3: Types

**Files:**

- Modify: `types/database.ts`

**Interfaces:**

- Produces: `OfferStatus`, `CashDirection` type aliases; `OfferRow`, `OfferItemRow`, `NotificationRow` type aliases; `Database['public']['Tables']['listings']['Row'].estimated_value_centavos: number | null`.

- [ ] **Step 1: Add `estimated_value_centavos` to the `listings` table shape**

In the `listings` table's `Row`, `Insert`, and (leave `Update: Record<string, never>` as-is, matching the existing pattern where updates go through the RPC, not direct table writes):

```diff
       listings: {
         Row: {
           id: string
           code: string
           owner_id: string
           intent: ListingIntent
           title: string
           description: string | null
           category_id: number | null
           condition: string | null
           ask_centavos: number | null
+          estimated_value_centavos: number | null
           accepts_cash: boolean
           status: ListingStatus
           meetup_spot_id: number | null
           search_tsv: string
           view_count: number
           created_at: string
           bumped_at: string
           expires_at: string
         }
         Insert: {
           id?: string
           code: string
           owner_id: string
           intent: ListingIntent
           title: string
           description?: string | null
           category_id?: number | null
           condition?: string | null
           ask_centavos?: number | null
+          estimated_value_centavos?: number | null
           accepts_cash?: boolean
           status?: ListingStatus
           meetup_spot_id?: number | null
           created_at?: string
           bumped_at?: string
           expires_at?: string
         }
```

- [ ] **Step 2: Update `create_listing`/`update_listing` Function signatures**

```diff
       create_listing: {
         Args: {
           p_id: string
           p_intent: ListingIntent
           p_title: string
           p_description: string | null
           p_category_id: number | null
           p_condition: string | null
           p_ask_centavos: number | null
+          p_estimated_value_centavos: number | null
           p_accepts_cash: boolean | null
           p_meetup_spot_id: number | null
           p_wants: string[] | null
           p_image_paths: string[] | null
         }
         Returns: Array<{ id: string; code: string }>
       }
       update_listing: {
         Args: {
           p_id: string
           p_title: string
           p_description: string | null
           p_category_id: number | null
           p_condition: string | null
           p_ask_centavos: number | null
+          p_estimated_value_centavos: number | null
           p_accepts_cash: boolean | null
           p_meetup_spot_id: number | null
           p_wants: string[] | null
         }
         Returns: undefined
       }
```

- [ ] **Step 3: Add the new tables, enum, and functions**

Insert after the `search_events` table entry (before the closing `}` of `Tables`):

```ts
      offers: {
        Row: {
          id: string
          listing_id: string
          root_offer_id: string
          from_user_id: string
          to_user_id: string
          parent_offer_id: string | null
          cash_centavos: number
          cash_direction: CashDirection
          note: string | null
          status: OfferStatus
          expires_at: string
          created_at: string
          responded_at: string | null
        }
        Insert: {
          id?: string
          listing_id: string
          root_offer_id?: string
          from_user_id: string
          to_user_id: string
          parent_offer_id?: string | null
          cash_centavos?: number
          cash_direction?: CashDirection
          note?: string | null
          status?: OfferStatus
          expires_at?: string
          created_at?: string
          responded_at?: string | null
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      offer_items: {
        Row: {
          root_offer_id: string
          listing_id: string
        }
        Insert: {
          root_offer_id: string
          listing_id: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          offer_id: string
          kind: NotificationKind
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          offer_id: string
          kind: NotificationKind
          read_at?: string | null
          created_at?: string
        }
        Update: { read_at?: string | null }
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
```

Insert into `Functions` (after `search_listings_fuzzy`):

```ts
      create_offer: {
        Args: {
          p_listing_id: string
          p_item_listing_ids: string[] | null
          p_cash_centavos: number | null
          p_cash_direction: string | null
          p_note: string | null
        }
        Returns: string
      }
      counter_offer: {
        Args: {
          p_offer_id: string
          p_cash_centavos: number | null
          p_cash_direction: string | null
          p_note: string | null
        }
        Returns: string
      }
      accept_offer: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      decline_offer: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      withdraw_offer: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      get_offer_thread: {
        Args: { p_offer_id: string }
        Returns: Database['public']['Tables']['offers']['Row'][]
      }
```

Insert into `Enums`:

```ts
offer_status: OfferStatus
```

- [ ] **Step 4: Add the exported type aliases**

At the bottom of the file, alongside the existing `ListingIntent`/`ListingStatus` aliases:

```ts
export type OfferStatus =
  'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn' | 'expired' | 'cancelled'
export type CashDirection = 'from_offerer' | 'to_offerer'
export type NotificationKind =
  | 'offer_received'
  | 'offer_countered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_withdrawn'
  | 'offer_expired'

export type OfferRow = Database['public']['Tables']['offers']['Row']
export type NotificationRow = Database['public']['Tables']['notifications']['Row']
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit` — expect it to fail right now (nothing references the new types yet is fine; it must not fail due to a malformed type). If it reports errors inside this file itself, fix them before moving on.

- [ ] **Step 6: Commit**

```bash
git add types/database.ts
git commit -m "feat: Phase 4 types — offers, offer_items, notifications, estimated_value_centavos"
```

---

## Task 4: Balance heuristic

**Files:**

- Create: `lib/offers/balance.ts`
- Test: `lib/offers/balance.test.ts`

**Interfaces:**

- Produces: `computeBalance(input: BalanceInput): BalanceRead`, `BALANCE_READ_COPY: Record<BalanceRead, string>`, types `BalanceRead`, `BalanceInput`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/offers/balance.test.ts
import { describe, expect, it } from 'vitest'
import { computeBalance } from './balance'

describe('computeBalance', () => {
  it('reads close_enough at exact parity', () => {
    expect(
      computeBalance({
        listingValueCentavos: 60000,
        offeredItemsValueCentavos: [60000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('reads heavily_theirs just under the 0.7 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [69999],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('heavily_theirs')
  })

  it('reads slightly_theirs exactly at the 0.7 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [70000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('slightly_theirs')
  })

  it('reads close_enough exactly at the 0.9 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [90000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('reads close_enough exactly at the 1.1 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [110000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('reads slightly_yours just over the 1.1 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [110001],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('slightly_yours')
  })

  it('reads slightly_yours exactly at the 1.3 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [130000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('slightly_yours')
  })

  it('reads heavily_yours just over the 1.3 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [130001],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('heavily_yours')
  })

  it('adds cash from_offerer to the offered side', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [80000],
        cashCentavos: 20000,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('subtracts cash to_offerer from the offered side', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [130000],
        cashCentavos: 30000,
        cashDirection: 'to_offerer',
      }),
    ).toBe('close_enough')
  })

  it('sums multiple offered items', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [40000, 60000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('cant_gauge when the listing has no value', () => {
    expect(
      computeBalance({
        listingValueCentavos: null,
        offeredItemsValueCentavos: [50000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('cant_gauge')
  })

  it('cant_gauge when the listing value is zero (division guard)', () => {
    expect(
      computeBalance({
        listingValueCentavos: 0,
        offeredItemsValueCentavos: [50000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('cant_gauge')
  })

  it('cant_gauge when any offered item has an unknown value, even mixed with known ones', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [50000, null],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('cant_gauge')
  })

  it('cant_gauge with zero offered items and zero cash still resolves (no divide-by-zero on the numerator side)', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('heavily_theirs')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/offers/balance.test.ts`
Expected: FAIL — `Cannot find module './balance'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/offers/balance.ts

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/offers/balance.test.ts`
Expected: PASS, 15/15

- [ ] **Step 5: Commit**

```bash
git add lib/offers/balance.ts lib/offers/balance.test.ts
git commit -m "feat: Phase 4 balance heuristic — pure function, full threshold test table"
```

---

## Task 5: State machine

**Files:**

- Create: `lib/offers/state-machine.ts`
- Test: `lib/offers/state-machine.test.ts`

**Interfaces:**

- Produces: `canTransition(status, action, role): boolean`, types `OfferStatus`, `OfferAction`, `OfferRole`.
- Note: this module defines its own `OfferStatus` union rather than importing the one from `types/database.ts` — keeping `lib/offers/` free of a dependency on generated DB types is deliberate here, since this file must stay a pure, framework-free predictor. The two unions are structurally identical; if they ever drift, `lib/offers/queries.ts` (Task 7) is where the mismatch would surface as a type error at the query boundary.

- [ ] **Step 1: Write the failing test**

```ts
// lib/offers/state-machine.test.ts
import { describe, expect, it } from 'vitest'
import { canTransition, type OfferAction, type OfferRole, type OfferStatus } from './state-machine'

const ALL_STATUSES: OfferStatus[] = [
  'pending',
  'accepted',
  'declined',
  'countered',
  'withdrawn',
  'expired',
  'cancelled',
]
const ALL_ACTIONS: OfferAction[] = ['accept', 'decline', 'counter', 'withdraw']
const ALL_ROLES: OfferRole[] = ['offerer', 'recipient']

const LEGAL: Array<[OfferStatus, OfferAction, OfferRole]> = [
  ['pending', 'accept', 'recipient'],
  ['pending', 'decline', 'recipient'],
  ['pending', 'counter', 'recipient'],
  ['pending', 'withdraw', 'offerer'],
]

function isLegal(status: OfferStatus, action: OfferAction, role: OfferRole): boolean {
  return LEGAL.some(([s, a, r]) => s === status && a === action && r === role)
}

describe('canTransition', () => {
  for (const status of ALL_STATUSES) {
    for (const action of ALL_ACTIONS) {
      for (const role of ALL_ROLES) {
        const expected = isLegal(status, action, role)
        it(`${status} + ${action} + ${role} → ${expected}`, () => {
          expect(canTransition(status, action, role)).toBe(expected)
        })
      }
    }
  }
})
```

This exhaustively covers all 7×4×2 = 56 `(status, action, role)` cells — 4 legal, 52 illegal, matching the build spec's literal "every transition has a unit test including the illegal ones."

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/offers/state-machine.test.ts`
Expected: FAIL — `Cannot find module './state-machine'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/offers/state-machine.ts

export type OfferStatus =
  'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn' | 'expired' | 'cancelled'

export type OfferAction = 'accept' | 'decline' | 'counter' | 'withdraw'

export type OfferRole = 'offerer' | 'recipient'

/**
 * Pure client-side predictor mirroring the RPCs' actual transition rules —
 * used only to disable/enable action buttons optimistically. The database
 * (accept_offer/decline_offer/counter_offer/withdraw_offer) remains the
 * sole authority; this never substitutes for calling those RPCs.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/offers/state-machine.test.ts`
Expected: PASS, 56/56

- [ ] **Step 5: Commit**

```bash
git add lib/offers/state-machine.ts lib/offers/state-machine.test.ts
git commit -m "feat: Phase 4 state machine — pure canTransition predictor, exhaustive 56-cell test table"
```

---

## Task 6: Zod schemas

**Files:**

- Create: `lib/offers/schemas.ts`

**Interfaces:**

- Consumes: nothing new (plain Zod).
- Produces: `createOfferSchema`, `counterOfferSchema`, `offerIdSchema`, types `CreateOfferInput`, `CounterOfferInput`.

- [ ] **Step 1: Write the schema**

```ts
// lib/offers/schemas.ts
import { z } from 'zod'

export const cashDirectionSchema = z.enum(['from_offerer', 'to_offerer'])

export const createOfferSchema = z
  .object({
    listingId: z.string().uuid(),
    itemListingIds: z.array(z.string().uuid()).max(20).default([]),
    cashCentavos: z.coerce.number().int().min(0).default(0),
    cashDirection: cashDirectionSchema.default('from_offerer'),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.itemListingIds.length > 0 || v.cashCentavos > 0, {
    message: 'Add at least one item or some cash.',
    path: ['itemListingIds'],
  })
export type CreateOfferInput = z.infer<typeof createOfferSchema>

// Give-listing "claim" path: no items, no cash, just an optional note.
// A separate schema rather than making the fields above optional — the
// discriminated shape keeps the give path from silently accepting a
// mistaken cash/item payload the server would strip anyway (Design
// Decision 4: give listings are enforced server-side regardless, but the
// client-side schema should already reflect the same intent).
export const claimOfferSchema = z.object({
  listingId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
})
export type ClaimOfferInput = z.infer<typeof claimOfferSchema>

export const counterOfferSchema = z.object({
  offerId: z.string().uuid(),
  cashCentavos: z.coerce.number().int().min(0),
  cashDirection: cashDirectionSchema,
  note: z.string().trim().max(500).optional(),
})
export type CounterOfferInput = z.infer<typeof counterOfferSchema>

export const offerIdSchema = z.object({ offerId: z.string().uuid() })
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/offers/schemas.ts
git commit -m "feat: Phase 4 Zod schemas — create/claim/counter offer inputs"
```

---

## Task 7: Queries

**Files:**

- Create: `lib/offers/queries.ts`

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/server`, `OfferRow`/`NotificationRow`/`ListingIntent` from `@/types/database`.
- Produces: `getOwnOfferableListings(userId, excludeOwnerId)`, `getListingForOffer(code)`, `getOfferThread(offerId)`, `getInboxThreads(userId)`, `getUnreadNotifications(userId)`, types `OfferableListing`, `OfferThreadRow`, `InboxThread`.

- [ ] **Step 1: Write the queries**

```ts
// lib/offers/queries.ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ListingIntent, NotificationRow, OfferStatus } from '@/types/database'

export interface OfferableListing {
  id: string
  code: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

/** The caller's own active listings, eligible to be picked in the item picker. */
export async function getOwnOfferableListings(userId: string): Promise<OfferableListing[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select('id, code, title, intent, ask_centavos, estimated_value_centavos')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as OfferableListing[]
}

export interface ListingForOffer {
  id: string
  code: string
  owner_id: string
  intent: ListingIntent
  title: string
  status: string
  expires_at: string
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

export async function getListingForOffer(code: string): Promise<ListingForOffer | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select(
      'id, code, owner_id, intent, title, status, expires_at, ask_centavos, estimated_value_centavos',
    )
    .eq('code', code)
    .maybeSingle()
  return (data ?? null) as unknown as ListingForOffer | null
}

export interface OfferThreadRow {
  id: string
  listing_id: string
  root_offer_id: string
  from_user_id: string
  to_user_id: string
  parent_offer_id: string | null
  cash_centavos: number
  cash_direction: 'from_offerer' | 'to_offerer'
  note: string | null
  status: OfferStatus
  expires_at: string
  created_at: string
  responded_at: string | null
}

/** Full negotiation chain, root to leaf, via the get_offer_thread RPC (recursive CTE). */
export async function getOfferThread(offerId: string): Promise<OfferThreadRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_offer_thread', { p_offer_id: offerId })
  return (data ?? []) as unknown as OfferThreadRow[]
}

export interface InboxThread {
  id: string
  listing_id: string
  from_user_id: string
  to_user_id: string
  cash_centavos: number
  cash_direction: 'from_offerer' | 'to_offerer'
  status: OfferStatus
  expires_at: string
  created_at: string
  listing: {
    id: string
    code: string
    title: string
    owner_id: string
    intent: ListingIntent
    listing_images: { storage_path: string; position: number }[]
  }
  counterpartyName: string
}

/**
 * One row per thread — the leaf (status <> 'countered') of every chain the
 * caller is a party to. No recursion needed: a counter always marks
 * exactly its immediate parent 'countered' and never leaves two live rows
 * in the same chain, so the leaf is simply the one non-'countered' row per
 * root_offer_id. Split into received/sent by comparing listing.owner_id to
 * the caller — stable across counters because listing ownership never
 * changes, only from_user_id/to_user_id swap.
 */
export async function getInboxThreads(
  userId: string,
): Promise<{ received: InboxThread[]; sent: InboxThread[] }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offers')
    .select(
      'id, listing_id, from_user_id, to_user_id, cash_centavos, cash_direction, status, expires_at, created_at, ' +
        'listings!inner(id, code, title, owner_id, intent, listing_images(storage_path, position)), ' +
        'from_profile:profiles!offers_from_user_id_fkey(display_name), ' +
        'to_profile:profiles!offers_to_user_id_fkey(display_name)',
    )
    .neq('status', 'countered')
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order('expires_at', { ascending: true })

  interface RawRow {
    id: string
    listing_id: string
    from_user_id: string
    to_user_id: string
    cash_centavos: number
    cash_direction: 'from_offerer' | 'to_offerer'
    status: OfferStatus
    expires_at: string
    created_at: string
    listings: InboxThread['listing']
    from_profile: { display_name: string } | null
    to_profile: { display_name: string } | null
  }

  const rows = (data ?? []) as unknown as RawRow[]
  const received: InboxThread[] = []
  const sent: InboxThread[] = []

  for (const row of rows) {
    const isReceived = row.listings.owner_id === userId
    const counterpartyName = isReceived
      ? (row.from_profile?.display_name ?? 'Someone')
      : (row.to_profile?.display_name ?? 'Someone')

    const thread: InboxThread = {
      id: row.id,
      listing_id: row.listing_id,
      from_user_id: row.from_user_id,
      to_user_id: row.to_user_id,
      cash_centavos: row.cash_centavos,
      cash_direction: row.cash_direction,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      listing: row.listings,
      counterpartyName,
    }

    if (isReceived) received.push(thread)
    else sent.push(thread)
  }

  return { received, sent }
}

export async function getUnreadNotifications(userId: string): Promise<NotificationRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}
```

**Verify before trusting:** confirm the FK constraint names `offers_from_user_id_fkey`/`offers_to_user_id_fkey` after `Task 1`'s migration actually apply (`\d offers` in `psql`) — Postgres auto-names inline `references` constraints as `<table>_<column>_fkey`, which is what Task 1's DDL produces, but verify against the real schema before trusting the embed hint at request time (a wrong name fails at request time, not compile time — same caveat Phase 2's plan flagged for its own FK embed).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/offers/queries.ts
git commit -m "feat: Phase 4 queries — offerable listings, offer thread, inbox, notifications"
```

---

## Task 8: Server Actions

**Files:**

- Create: `lib/offers/actions.ts`

**Interfaces:**

- Consumes: schemas from Task 6, `createClient` from `@/lib/supabase/server`.
- Produces: `createOffer`, `claimGiveListing`, `counterOffer`, `acceptOffer`, `declineOffer`, `withdrawOffer`, `markNotificationRead`, type `OfferActionResult`.

- [ ] **Step 1: Write the actions**

```ts
// lib/offers/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  createOfferSchema,
  claimOfferSchema,
  counterOfferSchema,
  offerIdSchema,
  type CreateOfferInput,
  type ClaimOfferInput,
  type CounterOfferInput,
} from '@/lib/offers/schemas'

export interface OfferActionResult {
  error?: string
  offerId?: string
}

export async function createOffer(raw: CreateOfferInput): Promise<OfferActionResult> {
  const result = createOfferSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your offer.' }
  }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('create_offer', {
    p_listing_id: input.listingId,
    p_item_listing_ids: input.itemListingIds.length > 0 ? input.itemListingIds : null,
    p_cash_centavos: input.cashCentavos,
    p_cash_direction: input.cashDirection,
    p_note: input.note ?? null,
  })

  if (error || !data) {
    return { error: error?.message ?? 'Could not send your offer. Try again.' }
  }

  redirect(`/deals/${data}`)
}

export async function claimGiveListing(raw: ClaimOfferInput): Promise<OfferActionResult> {
  const result = claimOfferSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entry.' }
  }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('create_offer', {
    p_listing_id: input.listingId,
    p_item_listing_ids: null,
    p_cash_centavos: 0,
    p_cash_direction: 'from_offerer',
    p_note: input.note ?? null,
  })

  if (error || !data) {
    return { error: error?.message ?? 'Could not claim this. Try again.' }
  }

  redirect(`/deals/${data}`)
}

export async function counterOffer(raw: CounterOfferInput): Promise<OfferActionResult> {
  const result = counterOfferSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your counter.' }
  }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('counter_offer', {
    p_offer_id: input.offerId,
    p_cash_centavos: input.cashCentavos,
    p_cash_direction: input.cashDirection,
    p_note: input.note ?? null,
  })

  if (error || !data) {
    return { error: error?.message ?? 'Could not send your counter. Try again.' }
  }

  return { offerId: data }
}

export async function acceptOffer(offerId: string): Promise<OfferActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId })
  if (error) return { error: 'Could not accept this offer.' }
  return {}
}

export async function declineOffer(offerId: string): Promise<OfferActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_offer', { p_offer_id: offerId })
  if (error) return { error: 'Could not decline this offer.' }
  return {}
}

export async function withdrawOffer(offerId: string): Promise<OfferActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_offer', { p_offer_id: offerId })
  if (error) return { error: 'Could not withdraw this offer.' }
  return {}
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/offers/actions.ts
git commit -m "feat: Phase 4 Server Actions — create/claim/counter/accept/decline/withdraw offer"
```

---

## Task 9: Extend Phase 2 listings for the estimated value field

**Files:**

- Modify: `lib/listings/schemas.ts`
- Modify: `lib/listings/actions.ts`
- Modify: `lib/listings/queries.ts`
- Modify: `app/(app)/post/ListingDetailsFields.tsx`
- Modify: `app/(app)/post/PostSheet.tsx`
- Modify: `app/(app)/l/[code]/edit/EditListingForm.tsx`
- Modify: `app/(app)/l/[code]/edit/page.tsx`

**Interfaces:**

- Consumes: `estimated_value_centavos` column and `p_estimated_value_centavos` RPC params from Task 1.
- Produces: `estimatedValueCentavos` field threaded from the post/edit UI through to `create_listing`/`update_listing`.

- [ ] **Step 1: `lib/listings/schemas.ts` — add the field to the swap branch of both schemas**

```diff
   z
     .object({
       intent: z.literal('swap'),
       ...sharedFields,
       wants: z
         .array(z.string().trim().min(1).max(80))
         .min(1, 'Add at least one thing you would take in return.')
         .max(5, 'Up to 5 things.'),
       acceptsCash: z.boolean().default(false),
+      estimatedValueCentavos: z.coerce.number().int().positive().optional(),
     })
     .strict(),
```

Apply the same one-line addition to the `swap` branch of `updateListingSchema` (the second discriminated union, further down the file).

- [ ] **Step 2: `lib/listings/actions.ts` — pass the new param through both RPC calls**

```diff
   const { data, error } = await supabase.rpc('create_listing', {
     p_id: listingId,
     p_intent: input.intent,
     p_title: input.title,
     p_description: input.description ?? null,
     p_category_id: input.categoryId,
     p_condition: input.condition,
     p_ask_centavos: input.intent === 'sale' ? input.askCentavos : null,
+    p_estimated_value_centavos: input.intent === 'swap' ? (input.estimatedValueCentavos ?? null) : null,
     p_accepts_cash: input.intent === 'swap' ? input.acceptsCash : false,
     p_meetup_spot_id: input.meetupSpotId,
     p_wants: input.intent === 'swap' ? input.wants : null,
     p_image_paths: input.images,
   })
```

Same diff shape for the `update_listing` call further down (same file).

- [ ] **Step 3: `lib/listings/queries.ts` — add the field to `ListingDetail`**

```diff
 export interface ListingDetail {
   id: string
   code: string
   owner_id: string
   intent: ListingIntent
   title: string
   description: string | null
   category_id: number | null
   condition: string | null
   ask_centavos: number | null
+  estimated_value_centavos: number | null
   accepts_cash: boolean
```

No query change needed — `getListingByCode`'s `select('*, ...')` already returns the new column once it exists.

- [ ] **Step 4: `app/(app)/post/ListingDetailsFields.tsx` — one optional input**

```diff
 export interface ListingDetailsValue {
   title: string
   description: string
   categoryId: number | null
   condition: Condition | null
   meetupSpotId: number | null
   wants: string[]
   acceptsCash: boolean
   askPesos: string
+  estimatedValuePesos: string
 }
```

Add the input inside the existing `{intent === 'swap' && (...)}` block, right after the "I'd also take cash" checkbox label:

```tsx
<div style={{ marginTop: '0.75rem' }}>
  <label htmlFor="listing-estimated-value" style={labelStyle}>
    Roughly worth (₱, optional)
  </label>
  <input
    id="listing-estimated-value"
    type="number"
    inputMode="decimal"
    min={1}
    step="1"
    value={value.estimatedValuePesos}
    onChange={(e) => set('estimatedValuePesos', e.target.value)}
    placeholder="600"
    style={inputStyle}
  />
  <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
    Helps the balance beam on offers — never shown as a price tag.
  </p>
</div>
```

- [ ] **Step 5: `app/(app)/post/PostSheet.tsx` — wire the field through**

```diff
 const emptyDetails: ListingDetailsValue = {
   title: '',
   description: '',
   categoryId: null,
   condition: null,
   meetupSpotId: null,
   wants: [''],
   acceptsCash: false,
   askPesos: '',
+  estimatedValuePesos: '',
 }
```

```diff
     const payload =
       intent === 'swap'
         ? {
             ...base,
             intent: 'swap' as const,
             wants: details.wants.map((w) => w.trim()).filter(Boolean),
             acceptsCash: details.acceptsCash,
+            estimatedValueCentavos: details.estimatedValuePesos
+              ? pesosToCentavos(details.estimatedValuePesos)
+              : undefined,
           }
```

- [ ] **Step 6: `app/(app)/l/[code]/edit/EditListingForm.tsx` — wire the field through**

```diff
 interface EditListingFormProps {
   listingId: string
   code: string
   intent: Intent
   categories: CategoryRow[]
   meetupSpots: MeetupSpotRow[]
   initial: {
     title: string
     description: string | null
     categoryId: number | null
     condition: ListingDetailsValue['condition']
     meetupSpotId: number | null
     askCentavos: number | null
+    estimatedValueCentavos: number | null
     acceptsCash: boolean
     wants: string[]
   }
 }
```

```diff
   const [details, setDetails] = useState<ListingDetailsValue>({
     title: initial.title,
     description: initial.description ?? '',
     categoryId: initial.categoryId,
     condition: initial.condition,
     meetupSpotId: initial.meetupSpotId,
     wants: initial.wants.length > 0 ? initial.wants : [''],
     acceptsCash: initial.acceptsCash,
     askPesos: initial.askCentavos ? centavosToPesos(initial.askCentavos) : '',
+    estimatedValuePesos: initial.estimatedValueCentavos
+      ? centavosToPesos(initial.estimatedValueCentavos)
+      : '',
   })
```

```diff
     const payload =
       intent === 'swap'
         ? {
             ...base,
             intent: 'swap' as const,
             wants: details.wants.map((w) => w.trim()).filter(Boolean),
             acceptsCash: details.acceptsCash,
+            estimatedValueCentavos: details.estimatedValuePesos
+              ? pesosToCentavos(details.estimatedValuePesos)
+              : undefined,
           }
```

- [ ] **Step 7: `app/(app)/l/[code]/edit/page.tsx` — pass the initial value**

```diff
         initial={{
           title: listing.title,
           description: listing.description,
           categoryId: listing.category_id,
           condition: listing.condition as 'new' | 'like_new' | 'good' | 'fair' | 'worn' | null,
           meetupSpotId: listing.meetup_spot_id,
           askCentavos: listing.ask_centavos,
+          estimatedValueCentavos: listing.estimated_value_centavos,
           acceptsCash: listing.accepts_cash,
           wants,
         }}
```

- [ ] **Step 8: Type-check and verify**

Run: `npx tsc --noEmit`. Then, once Task 1's migration is live, walk `/post` (swap) and confirm the new field appears only for swap, saves, and shows up correctly when editing.

- [ ] **Step 9: Commit**

```bash
git add lib/listings/schemas.ts lib/listings/actions.ts lib/listings/queries.ts \
  "app/(app)/post/ListingDetailsFields.tsx" "app/(app)/post/PostSheet.tsx" \
  "app/(app)/l/[code]/edit/EditListingForm.tsx" "app/(app)/l/[code]/edit/page.tsx"
git commit -m "feat: Phase 4 optional estimated value for swap listings, threaded through post/edit"
```

---

## Task 10: `BalanceBeam` component

**Files:**

- Create: `components/ui/BalanceBeam.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**

- Consumes: `BalanceRead`, `BALANCE_READ_COPY` from `@/lib/offers/balance`.
- Produces: `<BalanceBeam read={...} />`.

- [ ] **Step 1: Write the component**

```tsx
// components/ui/BalanceBeam.tsx
import type { CSSProperties } from 'react'
import type { BalanceRead } from '@/lib/offers/balance'
import { BALANCE_READ_COPY } from '@/lib/offers/balance'

interface BalanceBeamProps {
  read: BalanceRead
  className?: string
  style?: CSSProperties
}

// Positive rotation dips the left (THEIRS) pan; negative dips the right
// (YOURS) pan — a stylized read of the ratio, not a physics simulation.
const ROTATION: Record<BalanceRead, number> = {
  heavily_theirs: 12,
  slightly_theirs: 6,
  close_enough: 0,
  slightly_yours: -6,
  heavily_yours: -12,
  cant_gauge: 0,
}

export function BalanceBeam({ read, className = '', style }: BalanceBeamProps) {
  const rotation = ROTATION[read]
  const readColor = read === 'cant_gauge' ? 'var(--ink-45)' : 'var(--crimson-deep)'

  return (
    <div
      className={className}
      style={{
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        backgroundColor: 'var(--card)',
        boxShadow: 'var(--shadow-hard)',
        padding: '0.875rem 0.75rem 0.625rem',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 300 116"
        width="100%"
        height="116"
        aria-label={`Balance showing your offer against their item — ${BALANCE_READ_COPY[read]}`}
      >
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '150px 34px',
            transition: 'transform 0.5s cubic-bezier(0.34, 1.3, 0.5, 1)',
          }}
        >
          <line
            x1="46"
            y1="34"
            x2="254"
            y2="34"
            stroke="var(--ink)"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <line x1="46" y1="34" x2="46" y2="52" stroke="var(--ink)" strokeWidth={2} />
          <line x1="254" y1="34" x2="254" y2="52" stroke="var(--ink)" strokeWidth={2} />
          <path
            d="M22 52h48l-10 20H32z"
            fill={read === 'cant_gauge' ? 'var(--paper-dim)' : 'var(--gold)'}
            stroke="var(--ink)"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path
            d="M230 52h48l-10 20h-28z"
            fill={read === 'cant_gauge' ? 'var(--paper-dim)' : 'var(--crimson)'}
            stroke="var(--ink)"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <text
            x="46"
            y="66"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fontWeight={600}
            fill="var(--ink)"
          >
            THEIRS
          </text>
          <text
            x="254"
            y="66"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fontWeight={600}
            fill="var(--card)"
          >
            YOURS
          </text>
        </g>
        <path d="M150 34l16 46h-32z" fill="var(--ink)" />
        <rect x="112" y="80" width="76" height="7" rx="2" fill="var(--ink)" />
        <circle cx="150" cy="34" r="6" fill="var(--gold)" stroke="var(--ink)" strokeWidth={2.4} />
      </svg>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: readColor,
          margin: '0.375rem 0 0',
        }}
      >
        {BALANCE_READ_COPY[read]}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Export it**

```diff
 export { Button } from './Button'
+export { BalanceBeam } from './BalanceBeam'
 export { BottomNav } from './BottomNav'
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/ui/BalanceBeam.tsx components/ui/index.ts
git commit -m "feat: Phase 4 BalanceBeam component"
```

---

## Task 11: Offer composer

**Files:**

- Create: `app/(app)/l/[code]/offer/page.tsx`
- Create: `app/(app)/l/[code]/offer/OfferComposer.tsx`
- Modify: `app/(app)/l/[code]/page.tsx`

**Interfaces:**

- Consumes: `getListingForOffer`, `getOwnOfferableListings` (Task 7); `createOffer`, `claimGiveListing` (Task 8); `computeBalance` (Task 4); `BalanceBeam` (Task 10); `getAuthUser` from `@/lib/auth/session`.

- [ ] **Step 1: Server Component shell**

```tsx
// app/(app)/l/[code]/offer/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getListingForOffer, getOwnOfferableListings } from '@/lib/offers/queries'
import { getAuthUser } from '@/lib/auth/session'
import { Ribbon } from '@/components/ui'
import { OfferComposer } from './OfferComposer'

export default async function OfferPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [listing, user] = await Promise.all([getListingForOffer(code), getAuthUser()])
  if (!listing) notFound()
  if (!user || user.id === listing.owner_id) redirect(`/l/${code}`)
  if (listing.status !== 'active' || new Date(listing.expires_at).getTime() < Date.now()) {
    redirect(`/l/${code}`)
  }

  const ownListings = await getOwnOfferableListings(user.id)

  return (
    <>
      <header>
        <Ribbon>Make an offer</Ribbon>
      </header>
      <OfferComposer listing={listing} ownListings={ownListings} />
    </>
  )
}
```

- [ ] **Step 2: Client composer**

```tsx
// app/(app)/l/[code]/offer/OfferComposer.tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Panel, BalanceBeam } from '@/components/ui'
import { computeBalance } from '@/lib/offers/balance'
import { createOffer, claimGiveListing } from '@/lib/offers/actions'
import { pesosToCentavos, centavosToPesos } from '@/lib/listings/format'
import type { OfferableListing, ListingForOffer } from '@/lib/offers/queries'

interface OfferComposerProps {
  listing: ListingForOffer
  ownListings: OfferableListing[]
}

function itemValue(item: OfferableListing): number | null {
  if (item.intent === 'sale') return item.ask_centavos
  if (item.intent === 'swap') return item.estimated_value_centavos
  return null
}

function listingValue(listing: ListingForOffer): number | null {
  if (listing.intent === 'sale') return listing.ask_centavos
  if (listing.intent === 'swap') return listing.estimated_value_centavos
  return null
}

export function OfferComposer({ listing, ownListings }: OfferComposerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')

  // Give listings: simplified claim flow (Design Decision 4) — no picker,
  // no cash, no beam.
  if (listing.intent === 'give') {
    function handleClaim() {
      setError(null)
      startTransition(async () => {
        const res = await claimGiveListing({ listingId: listing.id, note: note || undefined })
        if (res.error) setError(res.error)
      })
    }

    return (
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Panel>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9375rem', margin: 0 }}>
            Claiming <strong>{listing.title}</strong>. Free — first to claim it.
          </p>
        </Panel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Optional note — say when you're free to meet…"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            padding: '0.75rem 1rem',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--card)',
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button type="button" variant="ghost" onClick={() => router.push(`/l/${listing.code}`)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={handleClaim}
          >
            {isPending ? 'Claiming…' : "I'll take it"}
          </Button>
        </div>
      </div>
    )
  }

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [cashPesos, setCashPesos] = useState('')
  const [cashDirection, setCashDirection] = useState<'from_offerer' | 'to_offerer'>('from_offerer')

  const selectedItems = ownListings.filter((l) => selectedIds.includes(l.id))
  const cashCentavos = cashPesos ? pesosToCentavos(cashPesos) : 0

  const balanceRead = useMemo(
    () =>
      computeBalance({
        listingValueCentavos: listingValue(listing),
        offeredItemsValueCentavos: selectedItems.map(itemValue),
        cashCentavos,
        cashDirection,
      }),
    [listing, selectedItems, cashCentavos, cashDirection],
  )

  function toggleItem(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function canSubmit(): boolean {
    return selectedIds.length > 0 || cashCentavos > 0
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createOffer({
        listingId: listing.id,
        itemListingIds: selectedIds,
        cashCentavos,
        cashDirection,
        note: note || undefined,
      })
      if (res.error) setError(res.error)
    })
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <BalanceBeam read={balanceRead} />

      <div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--ink-45)',
            margin: '0 0 0.5rem',
          }}
        >
          From your shelf
        </p>
        {ownListings.length === 0 ? (
          <p
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink-70)' }}
          >
            You have no active listings to offer. You can still send cash-only.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
            {ownListings.map((item) => {
              const selected = selectedIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-pressed={selected}
                  style={{
                    flex: '0 0 88px',
                    padding: '0.5rem',
                    textAlign: 'center',
                    border: 'var(--stroke)',
                    borderRadius: 'var(--radius)',
                    backgroundColor: selected ? 'rgba(255,204,0,0.2)' : 'var(--card)',
                    boxShadow: selected ? 'var(--shadow-hard)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      width: '15px',
                      height: '15px',
                      margin: '0 auto 4px',
                      border: 'var(--stroke)',
                      borderRadius: '50%',
                      backgroundColor: selected ? 'var(--crimson)' : 'var(--card)',
                    }}
                  />
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-body)',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: 'var(--ink)',
                    }}
                  >
                    {item.title}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--ink-45)',
            margin: '0 0 0.5rem',
          }}
        >
          Even it out
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--card)',
            boxShadow: 'var(--shadow-hard)',
            padding: '0.625rem 0.75rem',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>₱</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            value={cashPesos}
            onChange={(e) => setCashPesos(e.target.value)}
            placeholder="0"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '1.375rem',
              fontWeight: 600,
              backgroundColor: 'transparent',
            }}
          />
        </div>
        <div
          role="group"
          aria-label="Who adds the cash"
          style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem' }}
        >
          {[
            { value: 'from_offerer' as const, label: 'I add cash' },
            { value: 'to_offerer' as const, label: 'They add cash' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={cashDirection === opt.value}
              onClick={() => setCashDirection(opt.value)}
              style={{
                padding: '0.375rem 0.625rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: cashDirection === opt.value ? 'var(--crimson)' : 'var(--card)',
                color: cashDirection === opt.value ? 'var(--card)' : 'var(--ink)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Add a note — say when you're free to meet…"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          padding: '0.75rem 1rem',
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--card)',
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
        }}
      />

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-45)' }}>
        OFFER EXPIRES IN 48 HOURS
      </p>

      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button type="button" variant="ghost" onClick={() => router.push(`/l/${listing.code}`)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          fullWidth
          disabled={!canSubmit() || isPending}
          onClick={handleSubmit}
        >
          {isPending ? 'Sending…' : 'Send offer'}
        </Button>
      </div>
    </div>
  )
}
```

Note: `centavosToPesos` is imported but unused in the give-listing early-return path of this file — remove the import if the linter flags it, or keep it only if a later polish pass displays offered-item values inline (out of scope for this task; if ESLint's `no-unused-vars` fires, delete the import).

- [ ] **Step 3: Wire the "Make an offer" button on the listing detail page**

```diff
-            <Button
-              type="button"
-              variant="primary"
-              fullWidth
-              disabled
-              title="Coming in a later phase"
-            >
-              Make an offer
-            </Button>
+            <Link href={`/l/${listing.code}/offer`} style={{ flex: 1 }}>
+              <Button
+                type="button"
+                variant="primary"
+                fullWidth
+                disabled={listing.status !== 'active' || isExpired}
+              >
+                Make an offer
+              </Button>
+            </Link>
```

Add `import Link from 'next/link'` to the top of `app/(app)/l/[code]/page.tsx` if not already present (it isn't — this file currently has no `Link` import).

- [ ] **Step 4: Type-check and manual walkthrough**

Run: `npx tsc --noEmit && npm run build`. Once Task 1's migration is live: post a swap listing as user A with an estimated value, sign in as user B, open it, make an offer with an item + cash, confirm the beam updates live as picks/cash change, submit, confirm redirect to `/deals/[id]`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/l/[code]/offer/" "app/(app)/l/[code]/page.tsx"
git commit -m "feat: Phase 4 offer composer — give claim flow, swap/sale item+cash+beam flow"
```

---

## Task 12: Notification bell + OfferRow

**Files:**

- Modify: `components/ui/Ribbon.tsx`
- Create: `components/ui/NotificationBell.tsx`
- Create: `components/ui/OfferRow.tsx`
- Modify: `components/ui/index.ts`
- Modify: `app/(app)/page.tsx`

**Interfaces:**

- Consumes: `getUnreadNotifications` (Task 7), `markNotificationRead` (Task 8), `getAuthUser`.
- Produces: `<Ribbon end={...}>`, `<NotificationBell count={...} />`, `<OfferRow ... />`.

- [ ] **Step 1: Extend `Ribbon` with an optional trailing slot (non-breaking)**

```diff
 interface RibbonProps {
   children: ReactNode
   className?: string
   style?: CSSProperties
+  end?: ReactNode
 }

-export function Ribbon({ children, className = '', style }: RibbonProps) {
+export function Ribbon({ children, className = '', style, end }: RibbonProps) {
   return (
     <div
       className={`relative flex items-center justify-center px-8 py-2 ${className}`}
       style={{
         backgroundColor: 'var(--crimson)',
         color: 'var(--card)',
         clipPath:
           'polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%)',
         minHeight: '2.5rem',
         ...style,
       }}
     >
       <span
         className="font-mono-utility text-xs font-semibold tracking-widest"
         style={{ color: 'var(--card)' }}
       >
         {children}
       </span>
+      {end && (
+        <span style={{ position: 'absolute', right: '1.25rem', top: '50%', transform: 'translateY(-50%)' }}>
+          {end}
+        </span>
+      )}
     </div>
   )
 }
```

Every other `<Ribbon>` usage in the codebase omits `end`, so this is additive-only — no existing screen changes.

- [ ] **Step 2: `NotificationBell`**

```tsx
// components/ui/NotificationBell.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { markNotificationRead } from '@/lib/offers/actions'
import type { NotificationRow } from '@/types/database'

interface NotificationBellProps {
  notifications: NotificationRow[]
}

const KIND_COPY: Record<NotificationRow['kind'], string> = {
  offer_received: 'sent you an offer',
  offer_countered: 'countered your offer',
  offer_accepted: 'accepted your offer',
  offer_declined: 'declined your offer',
  offer_withdrawn: 'withdrew their offer',
  offer_expired: 'your offer expired',
}

export function NotificationBell({ notifications }: NotificationBellProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  const visible = notifications.filter((n) => !dismissed.includes(n.id))

  function handleSelect(notification: NotificationRow) {
    setDismissed((prev) => [...prev, notification.id])
    setOpen(false)
    void markNotificationRead(notification.id)
    router.push(`/deals/${notification.offer_id}`)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={`Notifications${visible.length > 0 ? ` (${visible.length} unread)` : ''}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          width: '1.75rem',
          height: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--card)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M4 15v-5a6 6 0 1112 0v5l1.5 2h-15z"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <path d="M8 17.5a2 2 0 004 0" stroke="currentColor" strokeWidth={1.5} />
        </svg>
        {visible.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: 'var(--gold)',
              border: '1.5px solid var(--crimson)',
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '2.25rem',
            right: 0,
            width: '18rem',
            maxHeight: '20rem',
            overflowY: 'auto',
            backgroundColor: 'var(--card)',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-hard)',
            zIndex: 30,
          }}
        >
          {visible.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                padding: '0.75rem',
                margin: 0,
              }}
            >
              Nothing new.
            </p>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(n)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.625rem 0.75rem',
                  border: 'none',
                  borderBottom: '1px solid var(--paper-dim)',
                  backgroundColor: 'transparent',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                Someone {KIND_COPY[n.kind]}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `OfferRow`**

```tsx
// components/ui/OfferRow.tsx
import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { OfferStatus } from '@/types/database'

interface OfferRowProps {
  href: string
  imageUrl?: string
  listingTitle: string
  counterpartyName: string
  status: OfferStatus
  expiresAt: string
  className?: string
  style?: CSSProperties
}

const STATUS_STYLE: Record<OfferStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'PENDING', bg: 'var(--gold)', color: 'var(--ink)' },
  accepted: { label: 'ACCEPTED', bg: 'var(--crimson)', color: 'var(--card)' },
  declined: { label: 'DECLINED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  withdrawn: { label: 'WITHDRAWN', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  expired: { label: 'EXPIRED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  cancelled: { label: 'CANCELLED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  countered: { label: 'COUNTERED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
}

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return 'expired'
  const hours = Math.round(diffMs / (60 * 60 * 1000))
  if (hours < 1) return '<1h left'
  if (hours < 24) return `${hours}h left`
  return `${Math.round(hours / 24)}d left`
}

export function OfferRow({
  href,
  imageUrl,
  listingTitle,
  counterpartyName,
  status,
  expiresAt,
  className = '',
  style,
}: OfferRowProps) {
  const { label, bg, color } = STATUS_STYLE[status]

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 py-2.5 ${className}`}
      style={{ borderBottom: '1px solid var(--paper-dim)', textDecoration: 'none', ...style }}
    >
      <span
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: '2.5rem',
          height: '2.5rem',
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--paper-dim)',
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-body text-sm truncate" style={{ color: 'var(--ink)' }}>
          {listingTitle}
        </span>
        <span className="block font-mono-utility text-[10px]" style={{ color: 'var(--ink-45)' }}>
          {counterpartyName} · {status === 'pending' ? timeUntil(expiresAt) : label}
        </span>
      </span>
      <span
        className="font-mono-utility text-xs px-2 py-0.5"
        style={{
          backgroundColor: bg,
          color,
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
        }}
      >
        {label}
      </span>
    </Link>
  )
}
```

- [ ] **Step 4: Export both**

```diff
 export { Button } from './Button'
 export { BalanceBeam } from './BalanceBeam'
 export { BottomNav } from './BottomNav'
 export { Chit } from './Chit'
 export { ChitSkeleton } from './ChitSkeleton'
 export { Chip } from './Chip'
 export { EmptyState } from './EmptyState'
 export { IntentTag } from './IntentTag'
 export { MiniListingRow } from './MiniListingRow'
+export { NotificationBell } from './NotificationBell'
+export { OfferRow } from './OfferRow'
 export { Panel } from './Panel'
 export { Ribbon } from './Ribbon'
```

- [ ] **Step 5: Render the bell on the Baylohan header**

```diff
+import { getUnreadNotifications } from '@/lib/offers/queries'
+import { NotificationBell } from '@/components/ui'
```

```diff
-  const [categories, user] = await Promise.all([getCategories(), getAuthUser()])
-  const [{ listings, nextCursor }, savedIds, recentSearches] = await Promise.all([
+  const [categories, user] = await Promise.all([getCategories(), getAuthUser()])
+  const [{ listings, nextCursor }, savedIds, recentSearches, notifications] = await Promise.all([
     getFeedListings(filters, categories),
     user ? getSavedListingIds(user.id) : Promise.resolve(new Set<string>()),
     user ? getRecentSearches(user.id) : Promise.resolve([]),
+    user ? getUnreadNotifications(user.id) : Promise.resolve([]),
   ])
```

```diff
       <header>
-        <Ribbon>Baylohan</Ribbon>
+        <Ribbon end={user && <NotificationBell notifications={notifications} />}>Baylohan</Ribbon>
       </header>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add components/ui/Ribbon.tsx components/ui/NotificationBell.tsx components/ui/OfferRow.tsx \
  components/ui/index.ts "app/(app)/page.tsx"
git commit -m "feat: Phase 4 in-app notification bell, OfferRow, Ribbon trailing slot"
```

---

## Task 13: Offer inbox — `/deals`

**Files:**

- Create: `app/(app)/deals/page.tsx`
- Create: `app/(app)/deals/DealsList.tsx`

**Interfaces:**

- Consumes: `getInboxThreads` (Task 7), `getSignedImageUrls`, `OfferRow` (Task 12).

- [ ] **Step 1: Server Component shell**

```tsx
// app/(app)/deals/page.tsx
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { getInboxThreads } from '@/lib/offers/queries'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import { Ribbon } from '@/components/ui'
import { DealsList } from './DealsList'

export default async function DealsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { received, sent } = await getInboxThreads(user.id)

  const coverPaths = [...received, ...sent]
    .map((t) => t.listing.listing_images.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)

  return (
    <>
      <header>
        <Ribbon>Deals</Ribbon>
      </header>
      <DealsList received={received} sent={sent} signedUrls={signedUrls} currentUserId={user.id} />
    </>
  )
}
```

- [ ] **Step 2: Client tabs + status grouping**

```tsx
// app/(app)/deals/DealsList.tsx
'use client'

import { useState } from 'react'
import { OfferRow, EmptyState } from '@/components/ui'
import type { InboxThread } from '@/lib/offers/queries'

interface DealsListProps {
  received: InboxThread[]
  sent: InboxThread[]
  signedUrls: Record<string, string>
  currentUserId: string
}

type Section = 'needs_response' | 'waiting' | 'accepted' | 'closed'

const SECTION_LABEL: Record<Section, string> = {
  needs_response: 'Needs your response',
  waiting: 'Waiting on them',
  accepted: 'Accepted',
  closed: 'Closed',
}

function sectionFor(thread: InboxThread, userId: string): Section {
  if (thread.status === 'accepted') return 'accepted'
  if (thread.status !== 'pending') return 'closed'
  // Pending: "needs your response" if the caller is the current recipient.
  return thread.to_user_id === userId ? 'needs_response' : 'waiting'
}

function groupBySection(threads: InboxThread[], userId: string): Record<Section, InboxThread[]> {
  const groups: Record<Section, InboxThread[]> = {
    needs_response: [],
    waiting: [],
    accepted: [],
    closed: [],
  }
  for (const thread of threads) {
    groups[sectionFor(thread, userId)].push(thread)
  }
  return groups
}

export function DealsList({ received, sent, signedUrls, currentUserId }: DealsListProps) {
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const threads = tab === 'received' ? received : sent
  const groups = groupBySection(threads, currentUserId)
  const sectionOrder: Section[] = ['needs_response', 'waiting', 'accepted', 'closed']

  return (
    <main className="flex flex-col gap-3 px-4 py-4">
      <div role="group" aria-label="Received or sent" style={{ display: 'flex', gap: '0.375rem' }}>
        {(['received', 'sent'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 0.875rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              backgroundColor: tab === t ? 'var(--ink)' : 'var(--card)',
              color: tab === t ? 'var(--card)' : 'var(--ink)',
            }}
          >
            {t === 'received' ? 'Received' : 'Sent'}
          </button>
        ))}
      </div>

      {threads.length === 0 ? (
        <EmptyState
          headline={tab === 'received' ? 'No offers yet.' : "You haven't sent any offers."}
          body={
            tab === 'received'
              ? 'Offers on your listings will show up here.'
              : 'Offers you make on other listings will show up here.'
          }
        />
      ) : (
        sectionOrder.map((section) =>
          groups[section].length === 0 ? null : (
            <div key={section}>
              <p className="font-mono-utility text-[10px] mb-2" style={{ color: 'var(--ink-45)' }}>
                {SECTION_LABEL[section]}
              </p>
              {groups[section].map((thread) => {
                const cover = thread.listing.listing_images.find(
                  (i) => i.position === 0,
                )?.storage_path
                return (
                  <OfferRow
                    key={thread.id}
                    href={`/deals/${thread.id}`}
                    imageUrl={cover ? signedUrls[cover] : undefined}
                    listingTitle={thread.listing.title}
                    counterpartyName={thread.counterpartyName}
                    status={thread.status}
                    expiresAt={thread.expires_at}
                  />
                )
              })}
            </div>
          ),
        )
      )}
    </main>
  )
}
```

- [ ] **Step 3: Type-check and verify**

Run: `npx tsc --noEmit && npm run build`. Once live: confirm `/deals` shows a real offer under "Needs your response" for the recipient and "Waiting on them" for the sender.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/deals/page.tsx" "app/(app)/deals/DealsList.tsx"
git commit -m "feat: Phase 4 offer inbox — Received/Sent tabs, grouped by status"
```

---

## Task 14: Offer detail — `/deals/[id]`

**Files:**

- Create: `app/(app)/deals/[id]/page.tsx`
- Create: `app/(app)/deals/[id]/OfferThread.tsx`
- Create: `app/(app)/deals/[id]/OfferActions.tsx`

**Interfaces:**

- Consumes: `getOfferThread` (Task 7), `getListingForOffer`/`getOwnOfferableListings` shape (Task 7), `acceptOffer`/`declineOffer`/`withdrawOffer`/`counterOffer` (Task 8), `canTransition` (Task 5), `computeBalance` (Task 4), `BalanceBeam` (Task 10).

- [ ] **Step 1: Server Component shell**

```tsx
// app/(app)/deals/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { getOfferThread } from '@/lib/offers/queries'
import { createClient } from '@/lib/supabase/server'
import { Ribbon } from '@/components/ui'
import { OfferThread, type ThreadListing, type ThreadItem } from './OfferThread'

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const thread = await getOfferThread(id)
  if (thread.length === 0) notFound()

  const first = thread[0]
  if (!first || (first.from_user_id !== user.id && first.to_user_id !== user.id)) notFound()

  const supabase = await createClient()
  const { data: listing } = await supabase
    .from('listings')
    .select('id, code, title, intent, ask_centavos, estimated_value_centavos, owner_id')
    .eq('id', first.listing_id)
    .maybeSingle()
  if (!listing) notFound()

  const { data: itemRows } = await supabase
    .from('offer_items')
    .select('listings(id, title, intent, ask_centavos, estimated_value_centavos)')
    .eq('root_offer_id', first.root_offer_id)
  const ownItems = ((itemRows ?? []) as unknown as Array<{ listings: ThreadItem }>).map(
    (r) => r.listings,
  )

  return (
    <>
      <header>
        <Ribbon>Offer</Ribbon>
      </header>
      <OfferThread
        thread={thread}
        listing={listing as unknown as ThreadListing}
        items={ownItems}
        currentUserId={user.id}
      />
    </>
  )
}
```

`listing` is cast once, at the query boundary, following this project's established pattern for hand-typed result shapes (the `Database` type has no `Relationships` metadata, so even this flat, non-embedded select benefits from an explicit interface rather than relying on inference) — `OfferThread`'s props are typed against that same interface, so nothing downstream needs its own cast.

- [ ] **Step 2: Chain display + live beam**

```tsx
// app/(app)/deals/[id]/OfferThread.tsx
'use client'

import { Panel, IntentTag, BalanceBeam } from '@/components/ui'
import { computeBalance } from '@/lib/offers/balance'
import { centavosToPesos, formatRelativeTime } from '@/lib/listings/format'
import { OfferActions } from './OfferActions'
import type { OfferThreadRow } from '@/lib/offers/queries'
import type { ListingIntent } from '@/types/database'

export interface ThreadListing {
  id: string
  code: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
  owner_id: string
}

export interface ThreadItem {
  id: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

interface OfferThreadProps {
  thread: OfferThreadRow[]
  listing: ThreadListing
  items: ThreadItem[]
  currentUserId: string
}

function value(row: {
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}): number | null {
  if (row.intent === 'sale') return row.ask_centavos
  if (row.intent === 'swap') return row.estimated_value_centavos
  return null
}

export function OfferThread({ thread, listing, items, currentUserId }: OfferThreadProps) {
  const leaf = thread[thread.length - 1]
  if (!leaf) return null

  const role = leaf.from_user_id === currentUserId ? 'offerer' : 'recipient'

  const balanceRead =
    listing.intent === 'give'
      ? null
      : computeBalance({
          listingValueCentavos: value(listing),
          offeredItemsValueCentavos: items.map(value),
          cashCentavos: leaf.cash_centavos,
          cashDirection: leaf.cash_direction,
        })

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IntentTag intent={listing.intent} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {listing.title}
          </span>
        </div>
      </Panel>

      {balanceRead && <BalanceBeam read={balanceRead} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {thread.map((offer) => (
          <Panel key={offer.id} style={{ opacity: offer.status === 'countered' ? 0.6 : 1 }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
                margin: '0 0 0.25rem',
              }}
            >
              {offer.from_user_id === currentUserId ? 'You' : 'Them'} ·{' '}
              {formatRelativeTime(offer.created_at)}
              {offer.status === 'countered' ? ' · countered' : ''}
            </p>
            {offer.cash_centavos > 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: 0 }}>
                ₱{centavosToPesos(offer.cash_centavos)}{' '}
                {offer.cash_direction === 'from_offerer'
                  ? 'added by the offerer'
                  : 'added by the owner'}
              </p>
            )}
            {offer.note && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink-70)',
                  margin: '0.25rem 0 0',
                }}
              >
                &ldquo;{offer.note}&rdquo;
              </p>
            )}
          </Panel>
        ))}
      </div>

      <OfferActions offer={leaf} role={role} />
    </div>
  )
}
```

- [ ] **Step 3: Actions + counter sheet**

```tsx
// app/(app)/deals/[id]/OfferActions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { canTransition } from '@/lib/offers/state-machine'
import { acceptOffer, declineOffer, withdrawOffer, counterOffer } from '@/lib/offers/actions'
import { pesosToCentavos } from '@/lib/listings/format'
import type { OfferThreadRow } from '@/lib/offers/queries'

interface OfferActionsProps {
  offer: OfferThreadRow
  role: 'offerer' | 'recipient'
}

export function OfferActions({ offer, role }: OfferActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterCashPesos, setCounterCashPesos] = useState('')
  const [counterDirection, setCounterDirection] = useState<'from_offerer' | 'to_offerer'>(
    offer.cash_direction,
  )
  const [counterNote, setCounterNote] = useState('')

  const status = offer.status

  function run(action: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleCounterSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await counterOffer({
        offerId: offer.id,
        cashCentavos: counterCashPesos ? pesosToCentavos(counterCashPesos) : 0,
        cashDirection: counterDirection,
        note: counterNote || undefined,
      })
      if (res.error) setError(res.error)
      else {
        setCounterOpen(false)
        router.refresh()
      }
    })
  }

  if (status !== 'pending') return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {canTransition(status, 'accept', role) && (
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={() => run(() => acceptOffer(offer.id))}
          >
            Accept
          </Button>
        )}
        {canTransition(status, 'counter', role) && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => setCounterOpen(true)}
          >
            Counter
          </Button>
        )}
        {canTransition(status, 'decline', role) && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => declineOffer(offer.id))}
          >
            Decline
          </Button>
        )}
        {canTransition(status, 'withdraw', role) && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => withdrawOffer(offer.id))}
          >
            Withdraw
          </Button>
        )}
      </div>

      <Sheet open={counterOpen} onClose={() => setCounterOpen(false)} title="Counter this offer">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="counter-cash"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Cash (₱)
            </label>
            <input
              id="counter-cash"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={counterCashPesos}
              onChange={(e) => setCounterCashPesos(e.target.value)}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                padding: '0.75rem 1rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div
            role="group"
            aria-label="Who adds the cash"
            style={{ display: 'flex', gap: '0.375rem' }}
          >
            {[
              { value: 'from_offerer' as const, label: 'I add cash' },
              { value: 'to_offerer' as const, label: 'They add cash' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={counterDirection === opt.value}
                onClick={() => setCounterDirection(opt.value)}
                style={{
                  padding: '0.375rem 0.625rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    counterDirection === opt.value ? 'var(--crimson)' : 'var(--card)',
                  color: counterDirection === opt.value ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            value={counterNote}
            onChange={(e) => setCounterNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Say what changed…"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              padding: '0.75rem 1rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={handleCounterSubmit}
          >
            {isPending ? 'Sending…' : 'Send counter'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
```

- [ ] **Step 4: Type-check and manual walkthrough**

Run: `npx tsc --noEmit && npm run build`. Once live: as the listing owner, open the received offer, confirm Accept/Decline/Counter show (not Withdraw); send a counter; confirm the original offerer now sees Accept/Decline/Counter on the new leaf (and the old row renders dimmed with "· countered"); accept it and confirm the listing flips to `reserved` on `/l/[code]`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/deals/[id]/"
git commit -m "feat: Phase 4 offer detail — negotiation chain, live beam, accept/decline/counter/withdraw"
```

---

## Task 15: E2E — full negotiation

**Files:**

- Create: `e2e/offer-negotiation.spec.ts`

**Interfaces:**

- Consumes: `e2e/helpers/fixtures.ts`'s `createFixtureListing()` (Phase 3), `e2e/helpers/auth.ts`'s `signInAsFixtureUser()` (Phase 2).

- [ ] **Step 1: Write the spec**

```ts
// e2e/offer-negotiation.spec.ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'

test('offer → counter → counter → accept produces a reserved listing', async ({ browser }) => {
  const listing = await createFixtureListing({
    ownerEmail: OWNER_EMAIL,
    intent: 'swap',
    title: 'E2E Negotiation Calculator',
    estimatedValueCentavos: 60000,
  })

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signInAsFixtureUser(ownerPage, OWNER_EMAIL)

  const offererContext = await browser.newContext()
  const offererPage = await offererContext.newPage()
  await signInAsFixtureUser(offererPage, OFFERER_EMAIL)

  // Offerer sends the initial offer (cash-only, no items required).
  await offererPage.goto(`/l/${listing.code}/offer`)
  await offererPage.getByPlaceholder('0').fill('500')
  await Promise.all([
    offererPage.waitForURL(/\/deals\/[0-9a-f-]+/),
    offererPage.getByRole('button', { name: 'Send offer' }).click(),
  ])
  const offerUrl = offererPage.url()

  // Owner sees it under Received, opens it, counters.
  await ownerPage.goto('/deals')
  await ownerPage.getByRole('button', { name: 'Received' }).click()
  await expect(ownerPage.getByText('E2E Negotiation Calculator')).toBeVisible()
  await ownerPage.getByText('E2E Negotiation Calculator').click()
  await ownerPage.getByRole('button', { name: 'Counter' }).click()
  await ownerPage.getByLabel('Cash (₱)').fill('700')
  await ownerPage.getByRole('button', { name: 'Send counter' }).click()
  await expect(ownerPage.getByText('· countered')).toBeVisible()

  // Offerer counters back.
  await offererPage.goto(offerUrl)
  await offererPage.reload()
  await offererPage.getByRole('button', { name: 'Counter' }).click()
  await offererPage.getByLabel('Cash (₱)').fill('650')
  await offererPage.getByRole('button', { name: 'Send counter' }).click()

  // Owner accepts the final terms.
  await ownerPage.goto('/deals')
  await ownerPage.getByRole('button', { name: 'Received' }).click()
  await ownerPage.getByText('E2E Negotiation Calculator').click()
  await Promise.all([
    ownerPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === ownerPage.url(),
    ),
    ownerPage.getByRole('button', { name: 'Accept' }).click(),
  ])

  // Listing is now reserved.
  await ownerPage.goto(`/l/${listing.code}`)
  await expect(ownerPage.getByText('RESERVED', { exact: false })).toBeVisible()
})
```

**Verify before trusting:** `createFixtureListing` (Phase 3's `e2e/helpers/fixtures.ts`) doesn't currently accept an `estimatedValueCentavos` option — extend its options type and the underlying `create_listing` RPC call to pass it through (same one-line addition pattern as Task 9's production code), and confirm a second fixture user (`e2e-fixture-2@usa.edu.ph`) exists in `supabase/seed.sql` alongside the existing `e2e-fixture@usa.edu.ph` — add one if it doesn't, following the exact shape of the existing fixture row.

This spec is written and type-checked but, per this project's established environment limitation (no local Docker, no running dev server in this sandbox), not executed end-to-end here — same accepted limitation documented for every Phase 2/3 E2E spec.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add e2e/offer-negotiation.spec.ts e2e/helpers/fixtures.ts supabase/seed.sql
git commit -m "test: Phase 4 E2E — full offer negotiation (offer, counter, counter, accept)"
```

---

## Task 16: CLAUDE.md reconciliation

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the phase table**

```diff
- **Phase 3** — Discovery (current)
- **Phase 4** — Offer engine ★ (highest risk, budget accordingly)
+ **Phase 3** — Discovery
+ **Phase 4** — Offer engine ★ (highest risk, budget accordingly) (current)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Phase 4 current"
```

---

## Acceptance Criteria Checklist

| Criterion (design spec)                                                                                                  | How it's proven                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Full negotiation (offer → counter → counter → accept) produces a correct, immutable chain queryable in one recursive CTE | `get_offer_thread` RPC (Task 1) + pgTAP (Task 2) + E2E (Task 15)                                 |
| A user cannot offer an item they don't own even via direct API call                                                      | `enforce_offer_item_ownership` trigger + pgTAP `throws_like` test (Task 2)                       |
| Expiry fires reliably                                                                                                    | `pg_cron` + `expire_stale_offers()` + pgTAP (Task 2)                                             |
| Every transition has a unit test including the illegal ones                                                              | `lib/offers/state-machine.test.ts`, 56/56 cells (Task 5)                                         |
| Balance heuristic never guesses on missing data                                                                          | `lib/offers/balance.test.ts` can't-gauge cases (Task 4)                                          |
| TypeScript clean                                                                                                         | `npx tsc --noEmit` exits 0                                                                       |
| ESLint clean                                                                                                             | `npx eslint . --max-warnings 0` exits 0                                                          |
| Build clean                                                                                                              | `npm run build` exits 0; `/l/[code]/offer`, `/deals`, `/deals/[id]` appear in the route manifest |

## Verification (end-to-end, after all tasks)

1. Apply the migration against the hosted Supabase project (this session's established no-Docker workflow) and confirm via `psql`: `offers`/`offer_items`/`notifications` tables, `listings.estimated_value_centavos`, and `select * from cron.job where jobname = 'expire-stale-offers';` returns one row.
2. Run pgTAP assertions (Task 2) live — 16/16 green.
3. `npx vitest run` — all unit tests green, including the 56-case state machine table and the balance test table.
4. `npx tsc --noEmit && npx eslint . --max-warnings 0 && npm run build` — all clean.
5. Manual walkthrough with two real signed-in sessions (established pattern from Phase 2/3 verification): post a swap listing with an estimated value as user A; as user B, make an offer with an item + cash, watch the beam update live; as A, counter; as B, counter again; as A, accept; confirm the listing shows `RESERVED` and the notification bell reflected each state change along the way.
6. Confirm `expire_stale_offers()` actually fires on schedule: manually backdate a test offer's `expires_at` via `psql`, wait ~5 minutes (or call the function directly), confirm it flips to `expired` and a notification appears.
