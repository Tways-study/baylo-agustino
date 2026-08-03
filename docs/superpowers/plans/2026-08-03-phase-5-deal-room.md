# Phase 5 — Deal Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an accepted offer somewhere to go — chat scoped to the deal, a curated-spot meetup card with propose/confirm, a stepper showing real deal state, a two-sided "mark as swapped" that only a trigger can complete, and a cancellation flow.

**Architecture:** Realtime chat runs on Postgres Changes + RLS — clients subscribe to `postgres_changes` on `messages` filtered by `offer_id`; writes are a plain authenticated `INSERT`, no RPC. Meetup scheduling is propose+confirm (not a negotiation chain): one row per offer, upserted by whichever party proposes, with two independent confirmation flags. Completion is two-sided: `mark_swapped` inserts into `deal_confirmations`, and only an `AFTER INSERT` trigger — never a client — flips `offers.status` to `'completed'`. Everything else (meetup RPCs, cancellation) follows Phase 4's `SECURITY DEFINER` + RLS-locked-table posture exactly.

**Tech Stack:** Next.js 15 Server Components/Actions, Supabase (Postgres RLS + Realtime), Zod, TypeScript strict.

**Design spec:** `docs/superpowers/specs/2026-08-03-phase-5-deal-room-design.md` — read this first if anything below is ambiguous; it's the source of the six scope/architecture decisions this plan implements (propose+confirm meetups, deferred `show_up_rate`, curated cancellation reasons, cancellation window/effects, reviews out of scope, Postgres Changes + RLS for realtime).

## Global Constraints

- Money is not involved in this phase's new tables — no centavos fields to get wrong, but the existing `listings`/`offers` money columns this phase touches (via status flips) stay `integer` centavos, never `float`.
- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully qualified identifiers (`public.table`, not `table`).
- RLS enabled at table creation, in the same migration file that creates the table. No policy added in a later migration.
- `authenticated` gets zero direct `INSERT`/`UPDATE`/`DELETE` on `meetups`, `deal_confirmations`, `offer_cancellations` — all writes through RPCs. `messages` is the one exception: a narrow column-level `INSERT` grant (`offer_id`, `sender_id`, `body` only — not `id`/`created_at`/`read_at`) authorized by RLS, no RPC, per the design's realtime architecture decision.
- `offer_status` gains `'completed'` via `alter type ... add value` — this is what actually adds it; Phase 4's migration comment claiming it was "reserved" never did.
- Meetup scheduling is propose+confirm: proposing sets the proposer's own confirmation flag `true` and resets the other party's to `false`. No counter-proposal chain.
- Completion is trigger-only: `AFTER INSERT` on `deal_confirmations`, fires at exactly 2 rows for the same `offer_id`. No client-writable path to `offers.status = 'completed'`.
- Cancellation is available only while `offers.status = 'accepted'`, by either party. Reverts `listings.status` to `'active'`. Reason is a curated code (`changed_mind` | `item_unavailable` | `unreachable` | `scheduling_conflict` | `other`) + optional free text, required when the code is `'other'`.
- `was_late` (on `offer_cancellations`) is a signal only — `true` when `now() >= meetups.scheduled_at - interval '2 hours'`, `false` otherwise including when no meetup was ever scheduled. Nothing in this phase writes `profiles.show_up_rate`.
- `reviews` table/UI: out of scope. This phase stops at `offers.status = 'completed'`.
- Every RPC error surfaces the real Postgres message to the caller (`error.message`, not a generic string) — matches `createOffer`/`counterOffer`/`claimGiveListing`'s pattern from Phase 4, not the narrower `acceptOffer`/`declineOffer`/`withdrawOffer` exception.
- No `any` anywhere — ESLint enforces this with zero tolerance.
- Zod schemas live in `lib/deals/schemas.ts` (colocated per domain, matching `lib/offers/schemas.ts`), not a flat `lib/schemas/`.
- `lib/deals/stepper.ts` and `lib/deals/ics.ts` are pure functions with their own local types (no import from `types/database.ts`) — same self-contained-module convention as `lib/offers/state-machine.ts`.

## File Map

| File                                                      | Action | Purpose                                                                                                                                                               |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260915000000_phase5_deal_room.sql` | Create | `offer_status` enum value, `meetups`/`messages`/`deal_confirmations`/`offer_cancellations`, RLS, triggers, RPCs, `notifications.kind` extension, Realtime publication |
| `supabase/seed.sql`                                       | Modify | Add `e2e-fixture-3@usa.edu.ph` — third fixture user for isolation tests                                                                                               |
| `supabase/tests/phase5_deal_room_rls.sql`                 | Create | pgTAP: privileges, propose/confirm, completion trigger, cancellation, third-party RLS                                                                                 |
| `types/database.ts`                                       | Modify | New tables/RPCs, `offer_status`/`NotificationKind` unions extended                                                                                                    |
| `lib/deals/stepper.ts`                                    | Create | Pure `dealSteps()` — status → per-step done/now/future                                                                                                                |
| `lib/deals/stepper.test.ts`                               | Create | Full status table                                                                                                                                                     |
| `lib/deals/ics.ts`                                        | Create | Pure `buildMeetupIcs()` — VEVENT text                                                                                                                                 |
| `lib/deals/ics.test.ts`                                   | Create | VEVENT correctness, UTC conversion, escaping                                                                                                                          |
| `lib/deals/schemas.ts`                                    | Create | Zod for propose/confirm/swap/cancel/message inputs                                                                                                                    |
| `lib/deals/queries.ts`                                    | Create | `getMeetup`, `getMessages`, `getDealConfirmations`, `getCancellation`                                                                                                 |
| `lib/deals/actions.ts`                                    | Create | Server Actions: `proposeMeetup`, `confirmMeetup`, `markSwapped`, `cancelDeal`                                                                                         |
| `lib/deals/realtime.ts`                                   | Create | Client-side `sendMessage()` — direct authenticated insert, no RPC                                                                                                     |
| `components/ui/Button.tsx`                                | Modify | Add `gold` variant                                                                                                                                                    |
| `components/ui/OfferRow.tsx`                              | Modify | `STATUS_STYLE['completed']` entry                                                                                                                                     |
| `components/ui/NotificationBell.tsx`                      | Modify | `KIND_COPY` entries for the 3 new notification kinds                                                                                                                  |
| `app/(app)/deals/[id]/DealStepper.tsx`                    | Create | Presentational stepper, mirrors the mockup's `.stepper`/`.st` classes inline                                                                                          |
| `app/(app)/deals/[id]/PinnedMeetupCard.tsx`               | Create | Propose/confirm form + confirmed card + calendar export                                                                                                               |
| `app/(app)/deals/[id]/DealChat.tsx`                       | Create | Message list + realtime subscription (Task 11), then composer (Task 12)                                                                                               |
| `app/(app)/deals/[id]/DealControls.tsx`                   | Create | "Mark as swapped" button                                                                                                                                              |
| `app/(app)/deals/[id]/CancelMenuButton.tsx`               | Create | Ribbon overflow button + cancellation sheet                                                                                                                           |
| `app/(app)/deals/[id]/OfferThread.tsx`                    | Modify | Wire in stepper/cancelled-stamp, meetup card, chat, controls                                                                                                          |
| `app/(app)/deals/[id]/page.tsx`                           | Modify | Fetch meetup/messages/confirmations/cancellation/spots; Ribbon `end` slot                                                                                             |
| `e2e/helpers/fixtures.ts`                                 | Modify | Add `createFixtureAcceptedOffer()`                                                                                                                                    |
| `e2e/deal-room.spec.ts`                                   | Create | Full happy path: propose → confirm → chat → both swap → completed                                                                                                     |
| `e2e/deal-room-cancellation.spec.ts`                      | Create | Cancellation + third-party page-load isolation                                                                                                                        |
| `scripts/verify-realtime-authorization.mjs`               | Create | Raw-client proof: a non-party subscription receives zero events                                                                                                       |
| `CLAUDE.md`                                               | Modify | Phase table → Phase 5 current                                                                                                                                         |

---

## Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260915000000_phase5_deal_room.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Produces: tables `meetups`, `messages`, `deal_confirmations`, `offer_cancellations`; `offer_status` enum value `'completed'`; RPCs `propose_meetup(uuid, smallint, timestamptz)`, `confirm_meetup(uuid)`, `mark_swapped(uuid)`, `cancel_deal(uuid, text, text)`; `notifications.kind` accepting `'meetup_proposed'`, `'deal_completed'`, `'deal_cancelled'`; a third fixture user `e2e-fixture-3@usa.edu.ph` (UUID `55555555-5555-5555-5555-555555555555`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260915000000_phase5_deal_room.sql
-- Phase 5: deal room — chat, meetup scheduling, two-sided completion,
-- cancellation. All tables ship with RLS enabled in this same file, per
-- project convention.

-- ═══ complete the offer_status enum ═══
-- Phase 4's migration comment claimed this was "reserved" but never
-- actually added it (create type ... as enum listed 7 values, not 8) —
-- this is what adds it for real.
alter type public.offer_status add value 'completed';

-- ═══ meetups — propose + confirm, not a negotiation chain ═══
create table public.meetups (
  offer_id      uuid primary key references public.offers on delete cascade,
  spot_id       smallint not null references public.meetup_spots,
  scheduled_at  timestamptz not null,
  proposed_by   uuid not null references public.profiles,
  confirmed_by_offerer boolean not null default false,
  confirmed_by_owner   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.meetups enable row level security;
revoke insert, update, delete on public.meetups from authenticated;

create policy "meetups visible to the two parties"
  on public.meetups for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = meetups.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ messages ═══
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references public.offers on delete cascade,
  sender_id  uuid not null references public.profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.messages (offer_id, created_at desc);
alter table public.messages enable row level security;
revoke insert, update, delete on public.messages from authenticated;

create policy "messages visible to the two parties"
  on public.messages for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = messages.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

create policy "a party can send a message while the deal is open"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.offers
      where offers.id = messages.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
        and offers.status in ('pending', 'accepted')
    )
  );

-- Column-level, not table-level: a client must not be able to backdate
-- created_at or pre-mark its own message read. read_at has no UPDATE grant
-- yet — nothing in this phase marks messages read; add a narrow grant
-- (mirrors notifications.read_at below) if read-receipts ship later.
grant insert (offer_id, sender_id, body) on public.messages to authenticated;

-- Realtime: postgres_changes only fires for tables in this publication.
-- Realtime replays only rows a subscriber's own RLS SELECT policy already
-- allows, which is what makes "a third user cannot subscribe to a deal
-- channel they aren't party to" true without a second authorization surface.
alter publication supabase_realtime add table public.messages;

-- ═══ deal_confirmations — two-sided completion ═══
create table public.deal_confirmations (
  offer_id     uuid not null references public.offers on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);
alter table public.deal_confirmations enable row level security;
revoke insert, update, delete on public.deal_confirmations from authenticated;

create policy "deal confirmations visible to the two parties"
  on public.deal_confirmations for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = deal_confirmations.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ offer_cancellations — signal only, Phase 6 turns this into show_up_rate ═══
create table public.offer_cancellations (
  offer_id     uuid primary key references public.offers on delete cascade,
  cancelled_by uuid not null references public.profiles,
  reason_code  text not null check (reason_code in
                 ('changed_mind', 'item_unavailable', 'unreachable',
                  'scheduling_conflict', 'other')),
  reason_text  text check (char_length(reason_text) <= 300),
  was_late     boolean not null,
  created_at   timestamptz not null default now()
);
alter table public.offer_cancellations enable row level security;
revoke insert, update, delete on public.offer_cancellations from authenticated;

create policy "cancellation record visible to the two parties"
  on public.offer_cancellations for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = offer_cancellations.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ extend notifications.kind for the 3 new event types ═══
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('offer_received', 'offer_countered', 'offer_accepted', 'offer_declined',
   'offer_withdrawn', 'offer_expired',
   'meetup_proposed', 'deal_completed', 'deal_cancelled'));

-- ═══ propose_meetup ═══
create or replace function public.propose_meetup(
  p_offer_id uuid,
  p_spot_id smallint,
  p_scheduled_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
  v_owner_id uuid;
  v_is_owner boolean;
begin
  select o.from_user_id, o.to_user_id, o.status, l.owner_id
    into v_from_user, v_to_user, v_status, v_owner_id
    from public.offers o
    join public.listings l on l.id = o.listing_id
    where o.id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'A meetup can only be scheduled for an accepted offer.';
  end if;
  if not exists (select 1 from public.meetup_spots where id = p_spot_id and active) then
    raise exception 'Pick a listed meetup spot.';
  end if;

  v_is_owner := v_caller = v_owner_id;

  insert into public.meetups (
    offer_id, spot_id, scheduled_at, proposed_by,
    confirmed_by_offerer, confirmed_by_owner
  ) values (
    p_offer_id, p_spot_id, p_scheduled_at, v_caller,
    not v_is_owner, v_is_owner
  )
  on conflict (offer_id) do update set
    spot_id = excluded.spot_id,
    scheduled_at = excluded.scheduled_at,
    proposed_by = excluded.proposed_by,
    confirmed_by_offerer = excluded.confirmed_by_offerer,
    confirmed_by_owner = excluded.confirmed_by_owner,
    updated_at = now();

  insert into public.notifications (user_id, offer_id, kind)
  values (case when v_caller = v_from_user then v_to_user else v_from_user end, p_offer_id, 'meetup_proposed');
end;
$$;

grant execute on function public.propose_meetup(uuid, smallint, timestamptz) to authenticated;

-- ═══ confirm_meetup ═══
create or replace function public.confirm_meetup(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
  v_owner_id uuid;
  v_is_owner boolean;
begin
  select o.from_user_id, o.to_user_id, o.status, l.owner_id
    into v_from_user, v_to_user, v_status, v_owner_id
    from public.offers o
    join public.listings l on l.id = o.listing_id
    where o.id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'This deal is no longer active.';
  end if;
  if not exists (select 1 from public.meetups where offer_id = p_offer_id) then
    raise exception 'No meetup has been proposed yet.';
  end if;

  v_is_owner := v_caller = v_owner_id;

  update public.meetups
  set confirmed_by_offerer = case when v_is_owner then confirmed_by_offerer else true end,
      confirmed_by_owner   = case when v_is_owner then true else confirmed_by_owner end,
      updated_at = now()
  where offer_id = p_offer_id;
end;
$$;

grant execute on function public.confirm_meetup(uuid) to authenticated;

-- ═══ mark_swapped ═══
create or replace function public.mark_swapped(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_from_user uuid;
  v_to_user uuid;
  v_status public.offer_status;
begin
  select from_user_id, to_user_id, status into v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'This deal is no longer active.';
  end if;

  insert into public.deal_confirmations (offer_id, user_id)
  values (p_offer_id, v_caller)
  on conflict (offer_id, user_id) do nothing;
end;
$$;

grant execute on function public.mark_swapped(uuid) to authenticated;

-- ═══ completion trigger — the only path to offers.status = 'completed' ═══
create or replace function public.complete_deal_on_double_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirm_count integer;
  v_listing_id uuid;
begin
  select count(*) into v_confirm_count
    from public.deal_confirmations where offer_id = new.offer_id;

  if v_confirm_count >= 2 then
    select listing_id into v_listing_id from public.offers where id = new.offer_id;

    update public.offers set status = 'completed' where id = new.offer_id and status = 'accepted';
    update public.listings set status = 'completed' where id = v_listing_id;

    -- Both parties get the receipt, not just "the other one" — unlike
    -- accept/decline/counter, both sides already actively participated in
    -- reaching this state, so there's no single "other party" to notify.
    insert into public.notifications (user_id, offer_id, kind)
    select unnest(array[o.from_user_id, o.to_user_id]), new.offer_id, 'deal_completed'
    from public.offers o where o.id = new.offer_id;
  end if;

  return new;
end;
$$;

create trigger complete_deal_after_second_confirmation
  after insert on public.deal_confirmations
  for each row execute function public.complete_deal_on_double_confirmation();

-- ═══ cancel_deal ═══
create or replace function public.cancel_deal(
  p_offer_id uuid,
  p_reason_code text,
  p_reason_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_from_user uuid;
  v_to_user uuid;
  v_listing_id uuid;
  v_status public.offer_status;
  v_scheduled_at timestamptz;
  v_was_late boolean;
begin
  select o.from_user_id, o.to_user_id, o.listing_id, o.status
    into v_from_user, v_to_user, v_listing_id, v_status
    from public.offers o where o.id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'Only an accepted deal that has not yet been swapped or cancelled can be cancelled.';
  end if;
  if p_reason_code not in ('changed_mind', 'item_unavailable', 'unreachable', 'scheduling_conflict', 'other') then
    raise exception 'Pick a valid cancellation reason.';
  end if;

  select scheduled_at into v_scheduled_at from public.meetups where offer_id = p_offer_id;
  v_was_late := v_scheduled_at is not null and now() >= v_scheduled_at - interval '2 hours';

  update public.offers set status = 'cancelled', responded_at = now() where id = p_offer_id;
  update public.listings set status = 'active' where id = v_listing_id;

  insert into public.offer_cancellations (offer_id, cancelled_by, reason_code, reason_text, was_late)
  values (p_offer_id, v_caller, p_reason_code, nullif(p_reason_text, ''), coalesce(v_was_late, false));

  insert into public.notifications (user_id, offer_id, kind)
  values (case when v_caller = v_from_user then v_to_user else v_from_user end, p_offer_id, 'deal_cancelled');
end;
$$;

grant execute on function public.cancel_deal(uuid, text, text) to authenticated;
```

- [ ] **Step 2: Add the third E2E fixture user**

Append to `supabase/seed.sql`:

```sql

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
```

- [ ] **Step 3: Push and verify live**

This project has no local Docker (established in Phase 4) — verify against the linked hosted project, same pattern as every migration so far.

```bash
npx supabase db push
npx supabase db query --linked "select proname from pg_proc where proname in ('propose_meetup','confirm_meetup','mark_swapped','cancel_deal','complete_deal_on_double_confirmation')" --output-format json
```

Expected: all 5 function names returned, push completes with no errors. If `alter type ... add value 'completed'` errors when referenced later in the same file (a real possibility depending on the linked project's Postgres version — flagged explicitly in the design spec), split the `alter type` statement into its own preceding migration file (e.g. `20260914000000_phase5_offer_status_completed.sql`) and re-push; do not silently work around it any other way.

Also confirm the Realtime publication took effect:

```bash
npx supabase db query --linked "select tablename from pg_publication_tables where pubname = 'supabase_realtime'" --output-format json
```

Expected: `messages` appears in the result (alongside whatever else may already be there).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000000_phase5_deal_room.sql supabase/seed.sql
git commit -m "feat: Phase 5 database migration — meetups, messages, deal_confirmations, offer_cancellations, RPCs, Realtime publication"
```

---

## Task 2: pgTAP tests

**Files:**

- Create: `supabase/tests/phase5_deal_room_rls.sql`

**Interfaces:**

- Consumes: Task 1's tables/RPCs; `supabase/seed.sql` profiles `11111111-...` and `22222222-...`; the unseeded third-party UUID `33333333-...` (same convention as `phase4_offers_rls.sql`).

- [ ] **Step 1: Write the test file**

```sql
-- supabase/tests/phase5_deal_room_rls.sql
begin;
select plan(38);

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
select throws_like(
  $$ select public.cancel_deal('99999999-9999-9999-9999-999999999802'::uuid, 'changed_mind', null) $$,
  '%longer%',
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
```

- [ ] **Step 2: Verify live** (no local Docker, same pattern as every pgTAP file so far)

```bash
npx supabase db query --linked --file supabase/tests/phase5_deal_room_rls.sql --output-format json
```

The tool only surfaces the last statement's resultset — if that final line isn't clearly `ok 38 - ...`, or if you need full per-assertion visibility, use the same temp-table-capturing debug harness technique documented in this project's history for `phase4_offers_rls.sql` (wrap each `select <assertion>(...)` in `insert into a temp table`, `select string_agg(...)` once at the end, never committed). Confirm all 38 assertions read `ok`, zero `not ok`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase5_deal_room_rls.sql
git commit -m "test: Phase 5 pgTAP — privileges, propose/confirm, completion trigger, cancellation, third-party RLS"
```

---

## Task 3: Types

**Files:**

- Modify: `types/database.ts`

**Interfaces:**

- Consumes: Task 1's schema.
- Produces: `OfferStatus` including `'completed'`; `NotificationKind` including the 3 new kinds; `MeetupRow`, `MessageRow`, `DealConfirmationRow`, `OfferCancellationRow` type aliases; `Database['public']['Functions']` entries for the 4 new RPCs.

- [ ] **Step 1: Add the new table types**

In `types/database.ts`, inside `Database['public']['Tables']`, after the `notifications` entry (before the closing brace at line 353):

```typescript
      meetups: {
        Row: {
          offer_id: string
          spot_id: number
          scheduled_at: string
          proposed_by: string
          confirmed_by_offerer: boolean
          confirmed_by_owner: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          offer_id: string
          spot_id: number
          scheduled_at: string
          proposed_by: string
          confirmed_by_offerer?: boolean
          confirmed_by_owner?: boolean
          created_at?: string
          updated_at?: string
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
      messages: {
        Row: {
          id: string
          offer_id: string
          sender_id: string
          body: string
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          offer_id: string
          sender_id: string
          body: string
          created_at?: string
          read_at?: string | null
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
      deal_confirmations: {
        Row: {
          offer_id: string
          user_id: string
          confirmed_at: string
        }
        Insert: {
          offer_id: string
          user_id: string
          confirmed_at?: string
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
      offer_cancellations: {
        Row: {
          offer_id: string
          cancelled_by: string
          reason_code: string
          reason_text: string | null
          was_late: boolean
          created_at: string
        }
        Insert: {
          offer_id: string
          cancelled_by: string
          reason_code: string
          reason_text?: string | null
          was_late: boolean
          created_at?: string
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
```

- [ ] **Step 2: Add the new RPC function types**

Inside `Database['public']['Functions']`, after the `get_offer_thread` entry (before the closing brace at line 453):

```typescript
propose_meetup: {
  Args: {
    p_offer_id: string
    p_spot_id: number
    p_scheduled_at: string
  }
  Returns: undefined
}
confirm_meetup: {
  Args: {
    p_offer_id: string
  }
  Returns: undefined
}
mark_swapped: {
  Args: {
    p_offer_id: string
  }
  Returns: undefined
}
cancel_deal: {
  Args: {
    p_offer_id: string
    p_reason_code: string
    p_reason_text: string | null
  }
  Returns: undefined
}
```

- [ ] **Step 3: Extend the `OfferStatus` and `NotificationKind` unions**

Replace lines 464-473:

```typescript
export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'countered'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'completed'
export type CashDirection = 'from_offerer' | 'to_offerer'
export type NotificationKind =
  | 'offer_received'
  | 'offer_countered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_withdrawn'
  | 'offer_expired'
  | 'meetup_proposed'
  | 'deal_completed'
  | 'deal_cancelled'
```

- [ ] **Step 4: Add the new row type aliases**

After line 484 (`export type NotificationRow = ...`):

```typescript
export type MeetupRow = Database['public']['Tables']['meetups']['Row']
export type MessageRow = Database['public']['Tables']['messages']['Row']
export type DealConfirmationRow = Database['public']['Tables']['deal_confirmations']['Row']
export type OfferCancellationRow = Database['public']['Tables']['offer_cancellations']['Row']
```

- [ ] **Step 5: Type-check**

This step will show errors in `components/ui/OfferRow.tsx` (`STATUS_STYLE` is no longer exhaustive over `OfferStatus`) and `components/ui/NotificationBell.tsx` (`KIND_COPY` is no longer exhaustive over `NotificationKind`) — expected, fixed in Task 9.

```bash
npx tsc --noEmit
```

Expected: errors only in those two files, both about missing Record keys.

- [ ] **Step 6: Commit**

```bash
git add types/database.ts
git commit -m "feat: Phase 5 types — meetups/messages/deal_confirmations/offer_cancellations, completed status, new notification kinds"
```

---

## Task 4: `lib/deals/stepper.ts`

**Files:**

- Create: `lib/deals/stepper.ts`
- Test: `lib/deals/stepper.test.ts`

**Interfaces:**

- Consumes: nothing (self-contained, own local `OfferStatus` type — same convention as `lib/offers/state-machine.ts`).
- Produces: `dealSteps(offer: { status: OfferStatus }): DealSteps`, types `StepState`, `DealSteps`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/deals/stepper.test.ts
import { describe, expect, it } from 'vitest'
import { dealSteps, type OfferStatus } from './stepper'

describe('dealSteps', () => {
  it('pending: only Offered is current', () => {
    expect(dealSteps({ status: 'pending' })).toEqual({
      offered: 'now',
      accepted: 'future',
      meetup: 'future',
      swapped: 'future',
      cancelled: false,
    })
  })

  it('accepted: Offered and Accepted done, Meetup current', () => {
    expect(dealSteps({ status: 'accepted' })).toEqual({
      offered: 'done',
      accepted: 'done',
      meetup: 'now',
      swapped: 'future',
      cancelled: false,
    })
  })

  it('completed: everything done through Swapped current', () => {
    expect(dealSteps({ status: 'completed' })).toEqual({
      offered: 'done',
      accepted: 'done',
      meetup: 'done',
      swapped: 'now',
      cancelled: false,
    })
  })

  it('cancelled: cancelled flag set, steps still reflect having reached accepted', () => {
    expect(dealSteps({ status: 'cancelled' })).toEqual({
      offered: 'done',
      accepted: 'done',
      meetup: 'done',
      swapped: 'future',
      cancelled: true,
    })
  })

  const deadEndStatuses: OfferStatus[] = ['declined', 'countered', 'withdrawn', 'expired']
  for (const status of deadEndStatuses) {
    it(`${status}: same as pending (deal room only mounts the stepper once accepted+)`, () => {
      expect(dealSteps({ status })).toEqual({
        offered: 'now',
        accepted: 'future',
        meetup: 'future',
        swapped: 'future',
        cancelled: false,
      })
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/deals/stepper.test.ts`
Expected: FAIL — `./stepper` module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/deals/stepper.ts
export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'countered'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'completed'

export type StepState = 'done' | 'now' | 'future'

export interface DealSteps {
  offered: StepState
  accepted: StepState
  meetup: StepState
  swapped: StepState
  cancelled: boolean
}

const PENDING_STATE: DealSteps = {
  offered: 'now',
  accepted: 'future',
  meetup: 'future',
  swapped: 'future',
  cancelled: false,
}

/**
 * Pure mapping from offers.status to the deal room's 4-step stepper —
 * no new stored state. Cancellation can only happen from 'accepted'
 * (see cancel_deal's own guard), so a cancelled deal is rendered as having
 * reached "Meetup" before the cancelled flag takes over the display —
 * callers show a Stamp instead of the stepper when cancelled is true.
 */
export function dealSteps(offer: { status: OfferStatus }): DealSteps {
  switch (offer.status) {
    case 'accepted':
      return {
        offered: 'done',
        accepted: 'done',
        meetup: 'now',
        swapped: 'future',
        cancelled: false,
      }
    case 'completed':
      return { offered: 'done', accepted: 'done', meetup: 'done', swapped: 'now', cancelled: false }
    case 'cancelled':
      return {
        offered: 'done',
        accepted: 'done',
        meetup: 'done',
        swapped: 'future',
        cancelled: true,
      }
    case 'pending':
    case 'declined':
    case 'countered':
    case 'withdrawn':
    case 'expired':
      return PENDING_STATE
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/deals/stepper.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/deals/stepper.ts lib/deals/stepper.test.ts
git commit -m "feat: Phase 5 deal stepper — pure status-to-step mapping"
```

---

## Task 5: `lib/deals/ics.ts`

**Files:**

- Create: `lib/deals/ics.ts`
- Test: `lib/deals/ics.test.ts`

**Interfaces:**

- Consumes: nothing (pure, no dependencies).
- Produces: `buildMeetupIcs(input: MeetupIcsInput): string`, type `MeetupIcsInput`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/deals/ics.test.ts
import { describe, expect, it } from 'vitest'
import { buildMeetupIcs } from './ics'

describe('buildMeetupIcs', () => {
  it('converts a +08:00 local time to a Z-suffixed UTC DTSTART', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: 'Ground floor, beside the guard desk',
      scheduledAt: '2026-09-20T10:30:00+08:00',
    })
    expect(ics).toContain('DTSTART:20260920T023000Z')
  })

  it('sets DTEND 30 minutes after DTSTART', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00+08:00',
    })
    expect(ics).toContain('DTEND:20260920T030000Z')
  })

  it('escapes commas and semicolons in the location hint', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: 'Ground floor, beside the guard desk; ask for room 3',
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('DESCRIPTION:Ground floor\\, beside the guard desk\\; ask for room 3')
  })

  it('falls back to a generic description when no hint is set', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('DESCRIPTION:Campus safe spot meetup.')
  })

  it('includes the spot name in both SUMMARY and LOCATION', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('SUMMARY:Baylo Agustino meetup — Library lobby')
    expect(ics).toContain('LOCATION:Library lobby')
  })

  it('derives a stable UID from the offer id', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('UID:abc-123@baylo-agustino')
  })

  it('wraps the event in a valid VCALENDAR/VEVENT block', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/deals/ics.test.ts`
Expected: FAIL — `./ics` module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/deals/ics.ts
export interface MeetupIcsInput {
  offerId: string
  spotName: string
  spotHint: string | null
  scheduledAt: string
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function toIcsUtc(iso: string): string {
  const isoNoMillis = new Date(iso).toISOString().split('.')[0]
  return `${isoNoMillis!.replace(/[-:]/g, '')}Z`
}

/**
 * A minimal, hand-written VEVENT block — no ics library, the format is
 * simple enough to produce directly and this avoids a new dependency for
 * one small feature. Times are emitted in plain UTC (Z suffix), which every
 * calendar app converts to local time on import — no VTIMEZONE needed.
 */
export function buildMeetupIcs(input: MeetupIcsInput): string {
  const start = toIcsUtc(input.scheduledAt)
  const end = toIcsUtc(new Date(new Date(input.scheduledAt).getTime() + 30 * 60_000).toISOString())
  const summary = escapeIcsText(`Baylo Agustino meetup — ${input.spotName}`)
  const location = escapeIcsText(input.spotName)
  const description = escapeIcsText(input.spotHint ?? 'Campus safe spot meetup.')
  const uid = `${input.offerId}@baylo-agustino`

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Baylo Agustino//Deal Room//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/deals/ics.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/deals/ics.ts lib/deals/ics.test.ts
git commit -m "feat: Phase 5 .ics builder — pure VEVENT text generation"
```

---

## Task 6: Zod schemas

**Files:**

- Create: `lib/deals/schemas.ts`

**Interfaces:**

- Consumes: `offerIdSchema` from `lib/offers/schemas.ts` (reused, not duplicated).
- Produces: `proposeMeetupSchema`, `cancelReasonCodeSchema`, `cancelDealSchema`, `sendMessageSchema`, and their inferred `*Input` types.

- [ ] **Step 1: Write the schemas**

```typescript
// lib/deals/schemas.ts
import { z } from 'zod'

export const proposeMeetupSchema = z.object({
  offerId: z.string().uuid(),
  spotId: z.coerce.number().int().positive(),
  scheduledAt: z.string().datetime(),
})
export type ProposeMeetupInput = z.infer<typeof proposeMeetupSchema>

export const cancelReasonCodeSchema = z.enum([
  'changed_mind',
  'item_unavailable',
  'unreachable',
  'scheduling_conflict',
  'other',
])

export const cancelDealSchema = z
  .object({
    offerId: z.string().uuid(),
    reasonCode: cancelReasonCodeSchema,
    reasonText: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.reasonCode !== 'other' || !!v.reasonText, {
    message: 'Tell us a bit more.',
    path: ['reasonText'],
  })
export type CancelDealInput = z.infer<typeof cancelDealSchema>

export const sendMessageSchema = z.object({
  offerId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
})
export type SendMessageInput = z.infer<typeof sendMessageSchema>
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean (this file has no consumers yet, but must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/deals/schemas.ts
git commit -m "feat: Phase 5 Zod schemas — propose meetup, cancel deal, send message"
```

---

## Task 7: Queries

**Files:**

- Create: `lib/deals/queries.ts`

**Interfaces:**

- Consumes: `createClient` from `lib/supabase/server`; `MeetupRow`/`MessageRow`/`DealConfirmationRow`/`OfferCancellationRow` from `types/database.ts` (Task 3); `MeetupSpotRow` (already exists).
- Produces: `getMeetup(offerId)`, `getMessages(offerId)`, `getDealConfirmations(offerId)`, `getCancellation(offerId)`.

- [ ] **Step 1: Write the queries**

```typescript
// lib/deals/queries.ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type {
  DealConfirmationRow,
  MeetupRow,
  MessageRow,
  OfferCancellationRow,
} from '@/types/database'

export interface MeetupWithSpot extends MeetupRow {
  spot: { id: number; name: string; hint: string | null }
}

export async function getMeetup(offerId: string): Promise<MeetupWithSpot | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('meetups')
    .select('*, spot:meetup_spots(id, name, hint)')
    .eq('offer_id', offerId)
    .maybeSingle()
  return (data ?? null) as unknown as MeetupWithSpot | null
}

export async function getMessages(offerId: string): Promise<MessageRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getDealConfirmations(offerId: string): Promise<DealConfirmationRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('deal_confirmations').select('*').eq('offer_id', offerId)
  return data ?? []
}

export async function getCancellation(offerId: string): Promise<OfferCancellationRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offer_cancellations')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle()
  return data ?? null
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/deals/queries.ts
git commit -m "feat: Phase 5 queries — meetup, messages, deal confirmations, cancellation"
```

---

## Task 8: Server Actions

**Files:**

- Create: `lib/deals/actions.ts`

**Interfaces:**

- Consumes: `createClient` from `lib/supabase/server`; `offerIdSchema` from `lib/offers/schemas.ts`; schemas from Task 6.
- Produces: `proposeMeetup`, `confirmMeetup`, `markSwapped`, `cancelDeal`, type `DealActionResult`.

- [ ] **Step 1: Write the actions**

```typescript
// lib/deals/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { offerIdSchema } from '@/lib/offers/schemas'
import {
  proposeMeetupSchema,
  cancelDealSchema,
  type ProposeMeetupInput,
  type CancelDealInput,
} from '@/lib/deals/schemas'

export interface DealActionResult {
  error?: string
}

export async function proposeMeetup(raw: ProposeMeetupInput): Promise<DealActionResult> {
  const result = proposeMeetupSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check the meetup details.' }
  }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('propose_meetup', {
    p_offer_id: input.offerId,
    p_spot_id: input.spotId,
    p_scheduled_at: input.scheduledAt,
  })
  if (error) return { error: error.message }
  return {}
}

export async function confirmMeetup(offerId: string): Promise<DealActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_meetup', { p_offer_id: offerId })
  if (error) return { error: error.message }
  return {}
}

export async function markSwapped(offerId: string): Promise<DealActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_swapped', { p_offer_id: offerId })
  if (error) return { error: error.message }
  return {}
}

export async function cancelDeal(raw: CancelDealInput): Promise<DealActionResult> {
  const result = cancelDealSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check the cancellation details.' }
  }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('cancel_deal', {
    p_offer_id: input.offerId,
    p_reason_code: input.reasonCode,
    p_reason_text: input.reasonText ?? null,
  })
  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 2: Also write the client-side message sender** (not a Server Action — a plain authenticated insert from the browser client, per the design's realtime architecture)

```typescript
// lib/deals/realtime.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMessageSchema, type SendMessageInput } from '@/lib/deals/schemas'
import type { Database } from '@/types/database'

export async function sendMessage(
  supabase: SupabaseClient<Database>,
  currentUserId: string,
  raw: SendMessageInput,
): Promise<{ error?: string }> {
  const result = sendMessageSchema.safeParse(raw)
  if (!result.success) return { error: result.error.errors[0]?.message ?? 'Check your message.' }

  const { error } = await supabase.from('messages').insert({
    offer_id: result.data.offerId,
    sender_id: currentUserId,
    body: result.data.body,
  })
  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/deals/actions.ts lib/deals/realtime.ts
git commit -m "feat: Phase 5 Server Actions + client-side message send"
```

---

## Task 9: Shared component updates

**Files:**

- Modify: `components/ui/Button.tsx`
- Modify: `components/ui/OfferRow.tsx`
- Modify: `components/ui/NotificationBell.tsx`

**Interfaces:**

- Consumes: Task 3's extended `OfferStatus`/`NotificationKind`.
- Produces: `Button`'s `variant` prop accepting `'gold'`; `OfferRow`/`NotificationBell` exhaustive over the new union members.

- [ ] **Step 1: Add the `gold` Button variant**

In `components/ui/Button.tsx`, change:

```typescript
type ButtonVariant = 'primary' | 'secondary' | 'ghost'
```

to:

```typescript
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold'
```

and change:

```typescript
const VARIANT_STYLES: Record<ButtonVariant, { bg: string; color: string }> = {
  primary: { bg: 'var(--crimson)', color: 'var(--card)' },
  secondary: { bg: 'var(--paper)', color: 'var(--ink)' },
  ghost: { bg: 'transparent', color: 'var(--ink)' },
}
```

to:

```typescript
const VARIANT_STYLES: Record<ButtonVariant, { bg: string; color: string }> = {
  primary: { bg: 'var(--crimson)', color: 'var(--card)' },
  secondary: { bg: 'var(--paper)', color: 'var(--ink)' },
  ghost: { bg: 'transparent', color: 'var(--ink)' },
  gold: { bg: 'var(--gold)', color: 'var(--ink)' },
}
```

- [ ] **Step 2: Add the `completed` status style to `OfferRow`**

In `components/ui/OfferRow.tsx`, change:

```typescript
const STATUS_STYLE: Record<OfferStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'PENDING', bg: 'var(--gold)', color: 'var(--ink)' },
  accepted: { label: 'ACCEPTED', bg: 'var(--crimson)', color: 'var(--card)' },
  declined: { label: 'DECLINED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  withdrawn: { label: 'WITHDRAWN', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  expired: { label: 'EXPIRED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  cancelled: { label: 'CANCELLED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  countered: { label: 'COUNTERED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
}
```

to:

```typescript
const STATUS_STYLE: Record<OfferStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'PENDING', bg: 'var(--gold)', color: 'var(--ink)' },
  accepted: { label: 'ACCEPTED', bg: 'var(--crimson)', color: 'var(--card)' },
  declined: { label: 'DECLINED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  withdrawn: { label: 'WITHDRAWN', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  expired: { label: 'EXPIRED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  cancelled: { label: 'CANCELLED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  countered: { label: 'COUNTERED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  completed: { label: 'SWAPPED', bg: 'var(--gold)', color: 'var(--ink)' },
}
```

- [ ] **Step 3: Add the 3 new notification kinds to `NotificationBell`**

In `components/ui/NotificationBell.tsx`, change:

```typescript
const KIND_COPY: Record<NotificationRow['kind'], string> = {
  offer_received: 'sent you an offer',
  offer_countered: 'countered your offer',
  offer_accepted: 'accepted your offer',
  offer_declined: 'declined your offer',
  offer_withdrawn: 'withdrew their offer',
  offer_expired: 'your offer expired',
}
```

to:

```typescript
const KIND_COPY: Record<NotificationRow['kind'], string> = {
  offer_received: 'sent you an offer',
  offer_countered: 'countered your offer',
  offer_accepted: 'accepted your offer',
  offer_declined: 'declined your offer',
  offer_withdrawn: 'withdrew their offer',
  offer_expired: 'your offer expired',
  meetup_proposed: 'proposed a meetup time',
  deal_completed: 'the deal is complete',
  deal_cancelled: 'cancelled the deal',
}
```

- [ ] **Step 4: Type-check and lint**

```bash
npx tsc --noEmit
npx eslint components/ui/Button.tsx components/ui/OfferRow.tsx components/ui/NotificationBell.tsx --max-warnings 0
```

Expected: both clean — this closes out the two exhaustiveness errors from Task 3, Step 5.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Button.tsx components/ui/OfferRow.tsx components/ui/NotificationBell.tsx
git commit -m "feat: Phase 5 — gold Button variant, completed OfferRow status, new notification copy"
```

---

## Task 10: `PinnedMeetupCard` component

**Files:**

- Create: `app/(app)/deals/[id]/PinnedMeetupCard.tsx`

**Interfaces:**

- Consumes: `Button`, `Panel` from `components/ui`; `proposeMeetup`, `confirmMeetup` from `lib/deals/actions`; `buildMeetupIcs` from `lib/deals/ics`; `MeetupWithSpot` from `lib/deals/queries`; `MeetupSpotRow` from `types/database`.
- Produces: `<PinnedMeetupCard offerId meetup meetupSpots currentUserId ownerId />`.

- [ ] **Step 1: Write the component**

```tsx
// app/(app)/deals/[id]/PinnedMeetupCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Panel } from '@/components/ui'
import { proposeMeetup, confirmMeetup } from '@/lib/deals/actions'
import { buildMeetupIcs } from '@/lib/deals/ics'
import type { MeetupWithSpot } from '@/lib/deals/queries'
import type { MeetupSpotRow } from '@/types/database'

interface PinnedMeetupCardProps {
  offerId: string
  meetup: MeetupWithSpot | null
  meetupSpots: MeetupSpotRow[]
  currentUserId: string
  ownerId: string
}

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-45)',
  display: 'block',
  marginBottom: '0.25rem',
}

const inputStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  padding: '0.625rem 0.875rem',
  border: 'var(--stroke)',
  borderRadius: 'var(--radius)',
  width: '100%',
  boxSizing: 'border-box' as const,
}

function toDatetimeLocalMin(): string {
  return new Date().toISOString().slice(0, 16)
}

export function PinnedMeetupCard({
  offerId,
  meetup,
  meetupSpots,
  currentUserId,
  ownerId,
}: PinnedMeetupCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [spotId, setSpotId] = useState<string>(meetupSpots[0]?.id.toString() ?? '')
  const [when, setWhen] = useState('')

  const isOwner = currentUserId === ownerId
  const myConfirmed = meetup
    ? isOwner
      ? meetup.confirmed_by_owner
      : meetup.confirmed_by_offerer
    : false
  const bothConfirmed = meetup ? meetup.confirmed_by_offerer && meetup.confirmed_by_owner : false

  function handlePropose() {
    if (!spotId || !when) return
    setError(null)
    startTransition(async () => {
      const res = await proposeMeetup({
        offerId,
        spotId: Number(spotId),
        scheduledAt: new Date(when).toISOString(),
      })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await confirmMeetup(offerId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleDownloadIcs() {
    if (!meetup) return
    const ics = buildMeetupIcs({
      offerId,
      spotName: meetup.spot.name,
      spotHint: meetup.spot.hint,
      scheduledAt: meetup.scheduled_at,
    })
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'baylo-agustino-meetup.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel>
      {error && (
        <p
          role="alert"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)', marginTop: 0 }}
        >
          {error}
        </p>
      )}

      {!meetup ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            Pick a time and place
          </p>
          <div>
            <label htmlFor="meetup-spot" style={labelStyle}>
              Meetup spot
            </label>
            <select
              id="meetup-spot"
              value={spotId}
              onChange={(e) => setSpotId(e.target.value)}
              style={inputStyle}
            >
              {meetupSpots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="meetup-when" style={labelStyle}>
              When
            </label>
            <input
              id="meetup-when"
              type="datetime-local"
              min={toDatetimeLocalMin()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={inputStyle}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending || !spotId || !when}
            onClick={handlePropose}
          >
            Propose
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            {new Intl.DateTimeFormat('en-PH', {
              timeZone: 'Asia/Manila',
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date(meetup.scheduled_at))}
          </p>
          <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
            {meetup.spot.name}
          </h4>
          {meetup.spot.hint && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--ink-70)',
                margin: 0,
              }}
            >
              {meetup.spot.hint}
            </p>
          )}

          {bothConfirmed ? (
            <Button type="button" variant="secondary" onClick={handleDownloadIcs}>
              Add to calendar
            </Button>
          ) : myConfirmed ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Waiting for the other side to confirm.
            </p>
          ) : (
            <Button type="button" variant="primary" disabled={isPending} onClick={handleConfirm}>
              Confirm
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}
```

- [ ] **Step 2: Type-check and lint**

```bash
npx tsc --noEmit
npx eslint "app/(app)/deals/[id]/PinnedMeetupCard.tsx" --max-warnings 0
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/deals/[id]/PinnedMeetupCard.tsx"
git commit -m "feat: Phase 5 pinned meetup card — propose/confirm, calendar export"
```

---

## Task 11: `DealChat` — message list + realtime subscription

**Files:**

- Create: `app/(app)/deals/[id]/DealChat.tsx`

**Interfaces:**

- Consumes: `createClient` from `lib/supabase/client`; `MessageRow` from `types/database`; `formatRelativeTime` from `lib/listings/format`.
- Produces: `<DealChat offerId initialMessages currentUserId />` (read-only in this task — the composer is added in Task 12).

- [ ] **Step 1: Write the component**

```tsx
// app/(app)/deals/[id]/DealChat.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MessageRow } from '@/types/database'
import { formatRelativeTime } from '@/lib/listings/format'

interface DealChatProps {
  offerId: string
  initialMessages: MessageRow[]
  currentUserId: string
}

export function DealChat({ offerId, initialMessages, currentUserId }: DealChatProps) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting'>('connected')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages-offer-${offerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `offer_id=eq.${offerId}` },
        (payload) => {
          const row = payload.new as MessageRow
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionState('reconnecting')
        if (status === 'SUBSCRIBED') setConnectionState('connected')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [offerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {connectionState === 'reconnecting' && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-45)',
            margin: 0,
          }}
        >
          Reconnecting…
        </p>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '18rem',
          overflowY: 'auto',
        }}
      >
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: mine ? 'var(--crimson)' : 'var(--card)',
                color: mine ? 'var(--card)' : 'var(--ink)',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                padding: '0.5rem 0.75rem',
              }}
            >
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: 0 }}>
                {m.body}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  opacity: 0.7,
                  margin: '0.25rem 0 0',
                }}
              >
                {formatRelativeTime(m.created_at)}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and lint**

```bash
npx tsc --noEmit
npx eslint "app/(app)/deals/[id]/DealChat.tsx" --max-warnings 0
```

Expected: both clean.

- [ ] **Step 3: Manual verification** (this repo has no component-level test harness — `lib/*.test.ts` covers pure functions, Playwright covers full flows; a mid-build UI increment like this one is checked by hand, same as Phase 4's `BalanceBeam`/`OfferComposer` were)

Run `npm run dev`, open `/deals/[id]` for an accepted offer in two browser windows (or use the Supabase dashboard's SQL editor to insert a row into `messages` directly for that `offer_id` while a page is open), confirm the new message appears in the open browser tab without a reload.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/deals/[id]/DealChat.tsx"
git commit -m "feat: Phase 5 deal chat — message list with realtime subscription"
```

---

## Task 12: `DealChat` — composer with optimistic send + offline queue

**Files:**

- Modify: `app/(app)/deals/[id]/DealChat.tsx`

**Interfaces:**

- Consumes: `sendMessage` from `lib/deals/realtime`; `Button` from `components/ui`.
- Produces: `<DealChat offerId initialMessages currentUserId canSend />` — `canSend` is new, gates whether the composer renders at all.

- [ ] **Step 1: Replace the file with the composer-extended version**

```tsx
// app/(app)/deals/[id]/DealChat.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/lib/deals/realtime'
import { Button } from '@/components/ui'
import type { MessageRow } from '@/types/database'
import { formatRelativeTime } from '@/lib/listings/format'

type ChatMessage = MessageRow & { pending?: boolean }

interface DealChatProps {
  offerId: string
  initialMessages: MessageRow[]
  currentUserId: string
  canSend: boolean
}

export function DealChat({ offerId, initialMessages, currentUserId, canSend }: DealChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting'>('connected')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const queueRef = useRef<ChatMessage[]>([])
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const channel = supabase
      .channel(`messages-offer-${offerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `offer_id=eq.${offerId}` },
        (payload) => {
          const row = payload.new as MessageRow
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            const withoutOptimistic = prev.filter(
              (m) => !(m.pending && m.sender_id === row.sender_id && m.body === row.body),
            )
            return [...withoutOptimistic, row]
          })
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionState('reconnecting')
        if (status === 'SUBSCRIBED') setConnectionState('connected')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [offerId, supabase])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function deliver(message: ChatMessage) {
    const res = await sendMessage(supabase, currentUserId, { offerId, body: message.body })
    if (res.error) {
      queueRef.current.push(message)
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, pending: false } : m)))
  }

  useEffect(() => {
    function flushQueue() {
      const queued = queueRef.current
      queueRef.current = []
      for (const message of queued) {
        void deliver(message)
      }
    }
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
    // deliver is stable across renders in practice (closes only over
    // supabase/currentUserId/offerId, all stable for this component's
    // lifetime) — re-subscribing this listener on every render would be
    // wasteful with no behavioral benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSend() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    setSending(true)

    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      offer_id: offerId,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      queueRef.current.push(optimistic)
    } else {
      await deliver(optimistic)
    }
    setSending(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {connectionState === 'reconnecting' && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-45)',
            margin: 0,
          }}
        >
          Reconnecting…
        </p>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '18rem',
          overflowY: 'auto',
        }}
      >
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                opacity: m.pending ? 0.6 : 1,
                backgroundColor: mine ? 'var(--crimson)' : 'var(--card)',
                color: mine ? 'var(--card)' : 'var(--ink)',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                padding: '0.5rem 0.75rem',
              }}
            >
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: 0 }}>
                {m.body}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  opacity: 0.7,
                  margin: '0.25rem 0 0',
                }}
              >
                {m.pending ? 'Sending…' : formatRelativeTime(m.created_at)}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {canSend && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSend()
            }}
            placeholder="Write a message…"
            maxLength={1000}
            style={{
              flex: 1,
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              padding: '0.625rem 0.875rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
            }}
          />
          <Button
            type="button"
            variant="primary"
            disabled={sending || !draft.trim()}
            onClick={() => void handleSend()}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check and lint**

```bash
npx tsc --noEmit
npx eslint "app/(app)/deals/[id]/DealChat.tsx" --max-warnings 0
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/deals/[id]/DealChat.tsx"
git commit -m "feat: Phase 5 deal chat — composer with optimistic send and offline queue"
```

---

## Task 13: Stepper, controls, cancel sheet — wired into the deal room

**Files:**

- Create: `app/(app)/deals/[id]/DealStepper.tsx`
- Create: `app/(app)/deals/[id]/DealControls.tsx`
- Create: `app/(app)/deals/[id]/CancelMenuButton.tsx`
- Modify: `app/(app)/deals/[id]/OfferThread.tsx`
- Modify: `app/(app)/deals/[id]/page.tsx`

**Interfaces:**

- Consumes: `dealSteps` from `lib/deals/stepper`; `markSwapped`, `cancelDeal` from `lib/deals/actions`; `getMeetup`, `getMessages`, `getDealConfirmations`, `getCancellation` from `lib/deals/queries`; `getMeetupSpots` from `lib/listings/queries`; `Stamp`, `Button`, `Sheet` from `components/ui`; `PinnedMeetupCard` (Task 10), `DealChat` (Task 12).
- Produces: fully wired `/deals/[id]` — this is the task where everything built so far becomes visible in the app.

- [ ] **Step 1: Write `DealStepper.tsx`**

```tsx
// app/(app)/deals/[id]/DealStepper.tsx
import type { CSSProperties } from 'react'
import type { DealSteps, StepState } from '@/lib/deals/stepper'

const LABELS: Array<{ key: keyof Omit<DealSteps, 'cancelled'>; label: string }> = [
  { key: 'offered', label: 'Offered' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'meetup', label: 'Meetup' },
  { key: 'swapped', label: 'Swapped' },
]

function dotStyle(state: StepState): CSSProperties {
  if (state === 'done') return { backgroundColor: 'var(--crimson)', border: 'var(--stroke)' }
  if (state === 'now')
    return {
      backgroundColor: 'var(--gold)',
      border: 'var(--stroke)',
      boxShadow: '0 0 0 3px rgba(255,204,0,0.32)',
    }
  return { backgroundColor: 'var(--card)', border: 'var(--stroke)' }
}

export function DealStepper(steps: DealSteps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0 4px' }}>
      {LABELS.map(({ key, label }, i) => {
        const state = steps[key]
        return (
          <div key={key} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
            {i > 0 && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '7px',
                  left: '-50%',
                  width: '100%',
                  height: '1.5px',
                  backgroundColor: 'var(--ink)',
                  opacity: 0.3,
                }}
              />
            )}
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                position: 'relative',
                zIndex: 1,
                ...dotStyle(state),
              }}
            />
            <span
              style={{
                display: 'block',
                marginTop: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '8.5px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: state === 'now' ? 'var(--ink)' : 'var(--ink-45)',
                fontWeight: state === 'now' ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write `DealControls.tsx`** ("Mark as swapped")

```tsx
// app/(app)/deals/[id]/DealControls.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { markSwapped } from '@/lib/deals/actions'
import type { OfferStatus } from '@/types/database'

interface DealControlsProps {
  offerId: string
  status: OfferStatus
  hasConfirmedSwap: boolean
}

export function DealControls({ offerId, status, hasConfirmedSwap }: DealControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status !== 'accepted') return null

  function handleMarkSwapped() {
    setError(null)
    startTransition(async () => {
      const res = await markSwapped(offerId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="gold"
        fullWidth
        disabled={isPending || hasConfirmedSwap}
        onClick={handleMarkSwapped}
      >
        {hasConfirmedSwap ? 'Waiting for the other side to confirm' : 'Mark as swapped'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Write `CancelMenuButton.tsx`** (Ribbon overflow slot)

```tsx
// app/(app)/deals/[id]/CancelMenuButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { cancelDeal } from '@/lib/deals/actions'
import { cancelReasonCodeSchema } from '@/lib/deals/schemas'
import type { z } from 'zod'

type ReasonCode = z.infer<typeof cancelReasonCodeSchema>

const REASON_LABEL: Record<ReasonCode, string> = {
  changed_mind: 'Changed my mind',
  item_unavailable: 'Item no longer available',
  unreachable: 'Other person unreachable',
  scheduling_conflict: 'Scheduling conflict',
  other: 'Other',
}

interface CancelMenuButtonProps {
  offerId: string
}

export function CancelMenuButton({ offerId }: CancelMenuButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleConfirmCancel() {
    if (!reasonCode) return
    setError(null)
    startTransition(async () => {
      const res = await cancelDeal({ offerId, reasonCode, reasonText: reasonText || undefined })
      if (res.error) setError(res.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cancel this deal"
        onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <circle cx="12" cy="5" r="1.4" fill="#fff" />
          <circle cx="12" cy="12" r="1.4" fill="#fff" />
          <circle cx="12" cy="19" r="1.4" fill="#fff" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Cancel this deal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {error && (
            <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
              {error}
            </p>
          )}
          <div
            role="group"
            aria-label="Cancellation reason"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}
          >
            {(Object.keys(REASON_LABEL) as ReasonCode[]).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={reasonCode === code}
                onClick={() => setReasonCode(code)}
                style={{
                  padding: '0.375rem 0.625rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: reasonCode === code ? 'var(--crimson)' : 'var(--card)',
                  color: reasonCode === code ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {REASON_LABEL[code]}
              </button>
            ))}
          </div>
          {reasonCode === 'other' && (
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Tell us a bit more…"
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
          )}
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending || !reasonCode || (reasonCode === 'other' && !reasonText.trim())}
            onClick={handleConfirmCancel}
          >
            {isPending ? 'Cancelling…' : 'Confirm cancellation'}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 4: Wire everything into `OfferThread.tsx`**

Add these imports at the top (alongside the existing ones):

```typescript
import { DealStepper } from './DealStepper'
import { DealControls } from './DealControls'
import { PinnedMeetupCard } from './PinnedMeetupCard'
import { DealChat } from './DealChat'
import { dealSteps } from '@/lib/deals/stepper'
import { Stamp } from '@/components/ui'
import type { MeetupWithSpot } from '@/lib/deals/queries'
import type { MeetupSpotRow, MessageRow, OfferCancellationRow } from '@/types/database'
```

Extend `OfferThreadProps`:

```typescript
interface OfferThreadProps {
  thread: OfferThreadRow[]
  listing: ThreadListing
  items: (ThreadItem | null)[]
  currentUserId: string
  meetup: MeetupWithSpot | null
  meetupSpots: MeetupSpotRow[]
  messages: MessageRow[]
  hasConfirmedSwap: boolean
  cancellation: OfferCancellationRow | null
}
```

Update the component signature and body — after the existing `<OfferActions offer={leaf} role={role} isOwner={isOwner} />` line, add the new deal-room block:

```tsx
export function OfferThread({
  thread,
  listing,
  items,
  currentUserId,
  meetup,
  meetupSpots,
  messages,
  hasConfirmedSwap,
  cancellation,
}: OfferThreadProps) {
  const leaf = thread[thread.length - 1]
  if (!leaf) return null

  const role = leaf.from_user_id === currentUserId ? 'offerer' : 'recipient'
  const isOwner = currentUserId === listing.owner_id
  const steps = dealSteps({ status: leaf.status })

  // ... existing balanceRead/displayBalanceRead logic unchanged ...

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* ... existing Panel/BalanceBeam/items/chain history blocks unchanged ... */}

      {steps.cancelled ? (
        <Panel>
          <Stamp label="Cancelled" variant="crimson" rotate={-6} />
          {cancellation && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-70)',
                margin: '0.5rem 0 0',
              }}
            >
              {cancellation.reason_text || 'No additional details given.'}
            </p>
          )}
        </Panel>
      ) : (
        (leaf.status === 'accepted' || leaf.status === 'completed') && (
          <Panel>
            <DealStepper {...steps} />
          </Panel>
        )
      )}

      {leaf.status === 'accepted' && (
        <PinnedMeetupCard
          offerId={leaf.id}
          meetup={meetup}
          meetupSpots={meetupSpots}
          currentUserId={currentUserId}
          ownerId={listing.owner_id}
        />
      )}

      {(leaf.status === 'pending' || leaf.status === 'accepted' || leaf.status === 'completed') && (
        <Panel>
          <DealChat
            offerId={leaf.id}
            initialMessages={messages}
            currentUserId={currentUserId}
            canSend={leaf.status === 'pending' || leaf.status === 'accepted'}
          />
        </Panel>
      )}

      <OfferActions offer={leaf} role={role} isOwner={isOwner} />
      <DealControls offerId={leaf.id} status={leaf.status} hasConfirmedSwap={hasConfirmedSwap} />
    </div>
  )
}
```

- [ ] **Step 5: Wire the fetches and Ribbon slot into `page.tsx`**

Replace the full file:

```tsx
// app/(app)/deals/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { getOfferThread } from '@/lib/offers/queries'
import { getMeetup, getMessages, getDealConfirmations, getCancellation } from '@/lib/deals/queries'
import { getMeetupSpots } from '@/lib/listings/queries'
import { createClient } from '@/lib/supabase/server'
import { Ribbon } from '@/components/ui'
import { OfferThread, type ThreadListing, type ThreadItem } from './OfferThread'
import { CancelMenuButton } from './CancelMenuButton'

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const thread = await getOfferThread(id)
  if (thread.length === 0) notFound()

  const first = thread[0]
  if (!first || (first.from_user_id !== user.id && first.to_user_id !== user.id)) notFound()
  const leaf = thread[thread.length - 1]
  if (!leaf) notFound()

  const supabase = await createClient()
  const { data: listing } = await supabase
    .from('listings')
    .select('id, code, title, intent, ask_centavos, estimated_value_centavos, owner_id')
    .eq('id', first.listing_id)
    .maybeSingle()
  if (!listing) notFound()

  const { data: itemRows } = await supabase
    .from('offer_items')
    .select('listings(id, code, title, intent, ask_centavos, estimated_value_centavos)')
    .eq('root_offer_id', first.root_offer_id)
  const ownItems = ((itemRows ?? []) as unknown as Array<{ listings: ThreadItem | null }>).map(
    (r) => r.listings,
  )

  const [meetup, messages, confirmations, cancellation, meetupSpots] = await Promise.all([
    getMeetup(leaf.id),
    getMessages(leaf.id),
    getDealConfirmations(leaf.id),
    getCancellation(leaf.id),
    getMeetupSpots(),
  ])
  const hasConfirmedSwap = confirmations.some((c) => c.user_id === user.id)

  return (
    <>
      <header>
        <Ribbon
          end={leaf.status === 'accepted' ? <CancelMenuButton offerId={leaf.id} /> : undefined}
        >
          Offer
        </Ribbon>
      </header>
      <OfferThread
        thread={thread}
        listing={listing as unknown as ThreadListing}
        items={ownItems}
        currentUserId={user.id}
        meetup={meetup}
        meetupSpots={meetupSpots}
        messages={messages}
        hasConfirmedSwap={hasConfirmedSwap}
        cancellation={cancellation}
      />
    </>
  )
}
```

- [ ] **Step 6: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint app lib components e2e types --max-warnings 0
npm run build
```

Expected: all clean, `/deals/[id]` still in the route manifest.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/deals/[id]/DealStepper.tsx" "app/(app)/deals/[id]/DealControls.tsx" "app/(app)/deals/[id]/CancelMenuButton.tsx" "app/(app)/deals/[id]/OfferThread.tsx" "app/(app)/deals/[id]/page.tsx"
git commit -m "feat: Phase 5 — wire stepper, meetup card, chat, mark-as-swapped, cancel into the deal room"
```

---

## Task 14: E2E — full happy path

**Files:**

- Modify: `e2e/helpers/fixtures.ts`
- Create: `e2e/deal-room.spec.ts`

**Interfaces:**

- Consumes: `signInAsFixtureUser` from `e2e/helpers/auth`; existing `createFixtureListing` pattern.
- Produces: `createFixtureAcceptedOffer()`.

- [ ] **Step 1: Add the accepted-offer fixture helper**

Append to `e2e/helpers/fixtures.ts`:

```typescript
/**
 * Creates a listing + an already-accepted offer between two fixture users,
 * entirely via direct RPC calls (bypassing the negotiation UI, which is
 * already covered by offer-negotiation.spec.ts). Uses a 'give' listing to
 * keep the fixture minimal — Phase 5 tests care about deal-room mechanics,
 * not offer contents.
 */
export async function createFixtureAcceptedOffer(options: {
  ownerEmail: string
  offererEmail: string
  listingTitle: string
}): Promise<{ listingId: string; listingCode: string; offerId: string }> {
  const ownerClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: ownerAuthError } = await ownerClient.auth.signInWithPassword({
    email: options.ownerEmail,
    password: 'not-a-real-password',
  })
  if (ownerAuthError) throw new Error(`Could not sign in owner: ${ownerAuthError.message}`)

  const { data: categories } = await ownerClient.from('categories').select('id').limit(1)
  const { data: spots } = await ownerClient.from('meetup_spots').select('id').limit(1)

  const { data: listingRows, error: listingError } = await ownerClient.rpc('create_listing', {
    p_id: crypto.randomUUID(),
    p_intent: 'give',
    p_title: options.listingTitle,
    p_description: null,
    p_category_id: categories?.[0]?.id ?? null,
    p_condition: 'good',
    p_ask_centavos: null,
    p_accepts_cash: false,
    p_meetup_spot_id: spots?.[0]?.id ?? null,
    p_wants: null,
    p_image_paths: null,
    p_estimated_value_centavos: null,
  })
  if (listingError || !listingRows?.[0]) {
    throw new Error(`Could not create fixture listing: ${listingError?.message}`)
  }
  const listing = listingRows[0]

  const offererClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: offererAuthError } = await offererClient.auth.signInWithPassword({
    email: options.offererEmail,
    password: 'not-a-real-password',
  })
  if (offererAuthError) throw new Error(`Could not sign in offerer: ${offererAuthError.message}`)

  const { data: offerId, error: offerError } = await offererClient.rpc('create_offer', {
    p_listing_id: listing.id,
    p_item_listing_ids: null,
    p_cash_centavos: 0,
    p_cash_direction: 'from_offerer',
    p_note: null,
  })
  if (offerError || !offerId)
    throw new Error(`Could not create fixture offer: ${offerError?.message}`)

  const { error: acceptError } = await ownerClient.rpc('accept_offer', { p_offer_id: offerId })
  if (acceptError) throw new Error(`Could not accept fixture offer: ${acceptError.message}`)

  return { listingId: listing.id, listingCode: listing.code, offerId }
}
```

- [ ] **Step 2: Write the E2E spec**

```typescript
// e2e/deal-room.spec.ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureAcceptedOffer } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'

test('accepted deal: propose meetup, confirm, chat live, both mark swapped completes it', async ({
  browser,
}) => {
  const { listingCode, offerId } = await createFixtureAcceptedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Deal Room Fixture',
  })
  void listingCode

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signInAsFixtureUser(ownerPage, OWNER_EMAIL)

  const offererContext = await browser.newContext()
  const offererPage = await offererContext.newPage()
  await signInAsFixtureUser(offererPage, OFFERER_EMAIL)

  // Offerer proposes a meetup.
  await offererPage.goto(`/deals/${offerId}`)
  await offererPage.getByLabel('Meetup spot').selectOption({ index: 0 })
  await offererPage.getByLabel('When').fill('2030-01-15T10:30')
  await Promise.all([
    offererPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === offererPage.url(),
    ),
    offererPage.getByRole('button', { name: 'Propose' }).click(),
  ])
  await offererPage.reload()
  await expect(offererPage.getByText('Waiting for the other side')).toBeVisible()

  // Owner confirms it.
  await ownerPage.goto(`/deals/${offerId}`)
  await expect(ownerPage.getByText('E2E Deal Room Fixture', { exact: false })).toBeVisible()
  await Promise.all([
    ownerPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === ownerPage.url(),
    ),
    ownerPage.getByRole('button', { name: 'Confirm' }).click(),
  ])
  await ownerPage.reload()
  await expect(ownerPage.getByText('Add to calendar')).toBeVisible()

  // Owner sends a chat message; the offerer's already-open page sees it
  // arrive live over Realtime, no reload — proves message delivery works
  // end to end, not just that the raw-client script's isolation check passes.
  await ownerPage.getByPlaceholder('Write a message…').fill('Sige, see you there!')
  await ownerPage.getByRole('button', { name: 'Send' }).click()
  await expect(offererPage.getByText('Sige, see you there!')).toBeVisible({ timeout: 5000 })

  // Both mark swapped.
  await offererPage.reload()
  await Promise.all([
    offererPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === offererPage.url(),
    ),
    offererPage.getByRole('button', { name: 'Mark as swapped' }).click(),
  ])
  await ownerPage.reload()
  await Promise.all([
    ownerPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === ownerPage.url(),
    ),
    ownerPage.getByRole('button', { name: 'Mark as swapped' }).click(),
  ])

  await ownerPage.reload()
  await expect(ownerPage.getByText('Swapped')).toBeVisible()
})
```

- [ ] **Step 3: Run it**

```bash
npx playwright test e2e/deal-room.spec.ts
```

Expected: PASS. This exercises the app against the live linked Supabase project (same as `offer-negotiation.spec.ts`), so it needs `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` set, matching the existing E2E setup.

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/fixtures.ts e2e/deal-room.spec.ts
git commit -m "test: Phase 5 E2E — full deal room happy path"
```

---

## Task 15: E2E — cancellation + third-party isolation

**Files:**

- Create: `e2e/deal-room-cancellation.spec.ts`

**Interfaces:**

- Consumes: `createFixtureAcceptedOffer` (Task 14), `signInAsFixtureUser`.

- [ ] **Step 1: Write the spec**

```typescript
// e2e/deal-room-cancellation.spec.ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureAcceptedOffer } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'
const THIRD_PARTY_EMAIL = 'e2e-fixture-3@usa.edu.ph'

test('cancelling an accepted deal reverts the listing and shows the cancelled stamp', async ({
  browser,
}) => {
  const { listingCode, offerId } = await createFixtureAcceptedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Cancellation Fixture',
  })

  const context = await browser.newContext()
  const page = await context.newPage()
  await signInAsFixtureUser(page, OFFERER_EMAIL)

  await page.goto(`/deals/${offerId}`)
  await page.getByRole('button', { name: 'Cancel this deal' }).click()
  await page.getByRole('button', { name: 'Changed my mind' }).click()
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'POST' && res.url() === page.url()),
    page.getByRole('button', { name: 'Confirm cancellation' }).click(),
  ])

  await page.reload()
  await expect(page.getByText('Cancelled')).toBeVisible()

  await page.goto(`/l/${listingCode}`)
  await expect(page.getByText('RESERVED', { exact: false })).not.toBeVisible()
})

test('a third party cannot open a deal room they are not party to', async ({ browser }) => {
  const { offerId } = await createFixtureAcceptedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Third Party Fixture',
  })

  const context = await browser.newContext()
  const page = await context.newPage()
  await signInAsFixtureUser(page, THIRD_PARTY_EMAIL)

  const response = await page.goto(`/deals/${offerId}`)
  expect(response?.status()).toBe(404)
})
```

- [ ] **Step 2: Run it**

```bash
npx playwright test e2e/deal-room-cancellation.spec.ts
```

Expected: PASS, 2 tests. If the third-party test fails because Next.js's dev `notFound()` doesn't surface as an HTTP 404 in this setup, replace the assertion with `await expect(page.getByText('This page could not be found', { exact: false })).toBeVisible()` instead of checking `response.status()` — verify which behavior actually occurs before deciding, don't guess.

- [ ] **Step 3: Commit**

```bash
git add e2e/deal-room-cancellation.spec.ts
git commit -m "test: Phase 5 E2E — cancellation flow and third-party page-load isolation"
```

---

## Task 16: Realtime authorization — raw-client script

**Files:**

- Create: `scripts/verify-realtime-authorization.mjs`

**Interfaces:**

- Consumes: `@supabase/supabase-js` (already a dependency); `e2e-fixture@usa.edu.ph`, `e2e-fixture-2@usa.edu.ph`, `e2e-fixture-3@usa.edu.ph` (seed.sql, Task 1).

- [ ] **Step 1: Write the script**

```javascript
// scripts/verify-realtime-authorization.mjs
/**
 * Raw-client proof that Realtime respects RLS on `messages`: a third party
 * subscribed to postgres_changes for an offer they aren't a party to must
 * receive zero events when one of the two real parties sends a message.
 *
 * Not run in CI — a manual verification script for the Phase 5 "a third
 * user cannot subscribe to a deal channel they aren't party to" acceptance
 * criterion, since neither pgTAP (server-side SQL) nor Playwright (browser
 * automation, not a "raw client") can exercise Realtime's own authorization
 * layer directly.
 *
 * Usage: node scripts/verify-realtime-authorization.mjs
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.')
  process.exit(1)
}

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'
const THIRD_PARTY_EMAIL = 'e2e-fixture-3@usa.edu.ph'
const PASSWORD = 'not-a-real-password'

async function signedInClient(email) {
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`)
  return client
}

const owner = await signedInClient(OWNER_EMAIL)
const offerer = await signedInClient(OFFERER_EMAIL)
const thirdParty = await signedInClient(THIRD_PARTY_EMAIL)

const { data: categories } = await owner.from('categories').select('id').limit(1)
const { data: listingRows, error: listingError } = await owner.rpc('create_listing', {
  p_id: randomUUID(),
  p_intent: 'give',
  p_title: 'Realtime auth probe fixture',
  p_description: null,
  p_category_id: categories?.[0]?.id ?? null,
  p_condition: 'good',
  p_ask_centavos: null,
  p_accepts_cash: false,
  p_meetup_spot_id: null,
  p_wants: null,
  p_image_paths: null,
  p_estimated_value_centavos: null,
})
if (listingError || !listingRows?.[0]) {
  throw new Error(`Could not create fixture listing: ${listingError?.message}`)
}

const { data: offerId, error: offerError } = await offerer.rpc('create_offer', {
  p_listing_id: listingRows[0].id,
  p_item_listing_ids: null,
  p_cash_centavos: 0,
  p_cash_direction: 'from_offerer',
  p_note: null,
})
if (offerError || !offerId) {
  throw new Error(`Could not create fixture offer: ${offerError?.message}`)
}

let received = 0
const channel = thirdParty
  .channel(`verify-offer-${offerId}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `offer_id=eq.${offerId}` },
    () => {
      received += 1
    },
  )

await new Promise((resolve, reject) => {
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') resolve()
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      reject(new Error(`Subscribe failed: ${status}`))
    }
  })
})

const { data: senderUser } = await offerer.auth.getUser()
const { error: insertError } = await offerer
  .from('messages')
  .insert({ offer_id: offerId, sender_id: senderUser.user.id, body: 'realtime auth probe' })
if (insertError) throw new Error(`Could not send probe message: ${insertError.message}`)

await new Promise((resolve) => setTimeout(resolve, 3000))
await thirdParty.removeChannel(channel)

if (received === 0) {
  console.log('PASS: third party received 0 events for a deal they are not party to.')
  process.exit(0)
} else {
  console.error(
    `FAIL: third party received ${received} event(s) — Realtime is leaking rows past RLS.`,
  )
  process.exit(1)
}
```

- [ ] **Step 2: Run it**

```bash
node scripts/verify-realtime-authorization.mjs
```

Expected: `PASS: third party received 0 events for a deal they are not party to.`, exit code 0. If it fails, this is a real Realtime/RLS gap — do not proceed to the next task until it passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-realtime-authorization.mjs
git commit -m "test: Phase 5 raw-client script — proves Realtime enforces RLS for a non-party subscriber"
```

---

## Task 17: CLAUDE.md reconciliation

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Move the current-phase marker**

Change:

```markdown
- **Phase 4** — Offer engine ★ (highest risk, budget accordingly) (current)
- **Phase 5** — Deal room
```

to:

```markdown
- **Phase 4** — Offer engine ★ (highest risk, budget accordingly)
- **Phase 5** — Deal room (current)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Phase 5 current"
```

---

## Acceptance Criteria Checklist

| Build-spec "Done when"                                                                 | How it's proven                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Messages arrive in under 1s between two devices                                        | Task 14: two browser contexts, message sent in one observed in the other without reload           |
| A third user cannot subscribe to a deal channel they aren't party to (raw-client test) | Task 16's script; Task 15's third-party page-load test                                            |
| Completion cannot be self-declared by one side                                         | Task 2 pgTAP: trigger fires only at 2 `deal_confirmations` rows; Task 1 RLS forbids direct writes |
| TypeScript clean                                                                       | `npx tsc --noEmit`, checked after every task                                                      |
| ESLint clean                                                                           | `npx eslint app lib components e2e types --max-warnings 0`                                        |
| Build clean                                                                            | `npm run build`; `/deals/[id]` renders the new stepper/meetup card/chat                           |

## Verification (end-to-end, after all tasks)

```bash
npx tsc --noEmit
npx eslint app lib components e2e types --max-warnings 0
npx vitest run --exclude 'e2e/**' --exclude 'node_modules/**' --exclude '.claude/**'
npm run build
npx supabase db query --linked --file supabase/tests/phase5_deal_room_rls.sql --output-format json
npx playwright test e2e/deal-room.spec.ts e2e/deal-room-cancellation.spec.ts e2e/offer-negotiation.spec.ts
node scripts/verify-realtime-authorization.mjs
```

Expected: all green. The `--exclude` flags on `vitest run` match the ones needed in this working directory setup (a nested `.claude/worktrees/` directory shadows the default `node_modules/**` exclude) — check whether that's still the case in whatever environment implements this plan, and drop them if not.
