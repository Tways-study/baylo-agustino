# Phase 5 — Deal Room Design

**Date:** 2026-08-03
**Status:** Approved
**Scope:** Agree on a time and place, then close it out.

---

## Context

Phase 4 shipped the offer engine: negotiation, accept/decline/counter/withdraw, and a listing that flips to `reserved` on acceptance. What's missing is everything after acceptance — the two parties have a deal but no way to coordinate the handover or prove it happened. Phase 5 adds that: chat scoped to the offer, a curated-spot meetup card, a stepper showing where the deal actually is, and a two-sided "mark as swapped" that only a database trigger — never a client — can turn into `completed`.

The build spec's Phase 4 migration already reserved `'cancelled'` in `offer_status` and left a comment claiming `'completed'` was "reserved," though it was never actually added to the enum — this phase's migration is what adds it for real.

Five scope decisions were made explicitly during brainstorming:

1. **Meetup scheduling is propose+confirm, not a negotiation chain.** Unlike offers, there's no counter-proposal sequence: one side sets a spot+time (or changes it), which resets the other side's confirmation; the other side just confirms. This matches the mockup, which shows one pinned card with no counter-UI, and avoids building a second negotiation state machine for a feature that doesn't need one.
2. **`show_up_rate` is not computed in this phase.** Late cancellations write a `was_late` signal to a new `offer_cancellations` table; turning that into the actual `profiles.show_up_rate` score is Phase 6 (Trust & safety) work. Phase 5 stays scoped to deal-room mechanics, not trust scoring.
3. **Cancellation reason is a curated list + free-text "Other"**, matching the existing `meetup_spots` philosophy of curated-not-free-text choices elsewhere in this app, and giving Phase 6 structured data instead of unstructured text to work with later.
4. **Cancellation is available any time between `accepted` and `completed`, by either party.** It reverts the listing to `active` (the exact inverse of `accept_offer`'s reserve) and leaves the `meetups` row in place as history — the UI keys off `offers.status`, not `meetups` row existence, to decide whether a meetup is "live."
5. **Reviews stay out of scope.** Phase 5 stops at setting `offers.status = 'completed'`. The `reviews` table and its UI belong to Phase 6, per the phase-gating rule — Phase 5 doesn't reach ahead into it.

A sixth decision was architectural, not a scope cut: **realtime chat delivery and authorization run on Postgres Changes + RLS**, not Broadcast-from-trigger. No Realtime code exists anywhere in this codebase yet, so this sets the pattern. Clients subscribe to `postgres_changes` on `messages` filtered by `offer_id`; writes are a plain authenticated `INSERT` guarded by RLS (no RPC needed — messages have no cross-row invariant complex enough to require one, unlike Phase 4's `offer_items`). Realtime replays only rows a subscriber's own RLS `SELECT` policy already allows, which directly satisfies the build spec's "a third user cannot subscribe to a deal channel they aren't party to" requirement without a second authorization surface.

---

## Data Model

**Migration:** `supabase/migrations/20260915000000_phase5_deal_room.sql` — enum change, tables, RLS, triggers, and RPCs all in this one file, per project convention.

```sql
-- ═══ complete the offer_status enum ═══
-- The Phase 4 migration's comment claimed this was "reserved" but never
-- actually added it — this is what adds it for real. ALTER TYPE ... ADD
-- VALUE must be its own statement; nothing later in this same migration
-- file may reference 'completed' in the same transaction it's added in
-- unless the target Postgres version allows it (verify live before relying
-- on it — split into a preceding migration file if it doesn't).
alter type public.offer_status add value 'completed';

-- ═══ meetups ═══ (propose + confirm, not a negotiation chain)
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

-- ═══ deal_confirmations ═══ (two-sided completion)
create table public.deal_confirmations (
  offer_id     uuid not null references public.offers on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);

-- ═══ offer_cancellations ═══ (signal only — Phase 6 turns this into show_up_rate)
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
```

**RLS** (enabled at creation, in this same file, per CLAUDE.md):

- `meetups`, `messages`, `deal_confirmations`, `offer_cancellations`: `SELECT` restricted to the two parties on the referenced `offers` row (`auth.uid() in (from_user_id, to_user_id)`).
- `authenticated` has direct `INSERT` on `messages` only, gated by a `WITH CHECK` that the sender is a party to an offer in `('pending', 'accepted')`. No direct `UPDATE`/`DELETE`.
- `authenticated` has no direct write access to `meetups` or `deal_confirmations` — every write goes through the RPCs below (the confirmation booleans and the completion flip must never be independently settable by a client, same principle as Phase 4's `offer_items`).
- `notifications.kind` check constraint extends to include `meetup_proposed`, `deal_completed`, `deal_cancelled` (plain `text` column with a `check`, not an enum — no type migration needed, same as Phase 4's additions).

**Completion trigger:** `AFTER INSERT` on `deal_confirmations`, counts rows for `NEW.offer_id`; at exactly 2, sets `offers.status = 'completed'` and `listings.status = 'completed'`. The primary key `(offer_id, user_id)` makes a double-insert by the same user a silent no-op, so the trigger only ever fires once per offer regardless of insert order or near-simultaneous taps from both sides.

---

## RPCs (`SECURITY DEFINER`, `SET search_path = ''`, fully qualified identifiers — matching Phase 4 conventions)

- **`propose_meetup(p_offer_id uuid, p_spot_id smallint, p_scheduled_at timestamptz)`** — caller must be a party to an `accepted` offer. Upserts the `meetups` row: sets `spot_id`/`scheduled_at`/`proposed_by`, sets the caller's own confirmation flag `true`, resets the other party's to `false`, bumps `updated_at`.
- **`confirm_meetup(p_offer_id uuid)`** — flips only the caller's confirmation flag to `true`. Re-reads current server state, not anything the client might be holding stale, so a confirm against a since-changed proposal always confirms the _current_ terms.
- **`mark_swapped(p_offer_id uuid)`** — caller must be a party to an `accepted` offer; inserts `(p_offer_id, auth.uid())` into `deal_confirmations`. The completion trigger does the rest.
- **`cancel_deal(p_offer_id uuid, p_reason_code text, p_reason_text text)`** — caller must be a party to an `accepted` offer. Computes `was_late` as `true` when a confirmed or proposed `meetups.scheduled_at` exists and `now() >= scheduled_at - interval '2 hours'` (covers both last-minute cancels and no-shows, `false` otherwise including when no meetup was ever scheduled). Inserts the `offer_cancellations` row, sets `offers.status = 'cancelled'`, reverts `listings.status = 'active'`. Does not touch the `meetups` row.
- **Messages** — no RPC. A plain `insert into public.messages (...)` from the client, authorized entirely by the RLS `WITH CHECK` described above.

Each RPC that changes deal state inserts the matching `notifications` row (`meetup_proposed` on propose, `deal_completed` on the trigger's flip, `deal_cancelled` on cancel) — same "every state change notifies" pattern Phase 4 established for offers. Individual chat messages do **not** generate notifications; they're already Realtime-visible while the deal room is open, and per-message notifications would be noisy.

---

## Pure Functions

### `lib/deals/stepper.ts`

`dealStep(offer: { status: OfferStatus }) → 'offered' | 'accepted' | 'meetup' | 'swapped' | 'cancelled'`

A pure, unit-tested mapping from `offers.status` to the stepper's current position — no new stored state. `pending → 'offered'`, `accepted → 'meetup'` (there's nothing to schedule before acceptance, so `'accepted'` as a _label_ is shown as already-done alongside `'offered'` the moment status is `accepted`), `completed → 'swapped'`, `cancelled → 'cancelled'` (overrides the 4-step stepper with a stamp, same visual pattern as the existing Reserved/Expired stamps). Full table tested the same way `lib/offers/state-machine.test.ts` tests all 56 `(status, action, role)` cells.

### `lib/deals/ics.ts`

`buildMeetupIcs(meetup: { spotName, spotHint, scheduledAt }) → string`

A pure function producing a minimal `VEVENT` text block (no library — the format is simple enough to hand-write, and this avoids a new dependency for one small feature). Tested for correct `Asia/Manila` → UTC conversion and text escaping (commas/semicolons in the spot hint).

---

## Screens

### `/deals/[id]` (existing file from Phase 4, extended)

- **Chat** — visible once the offer reaches `pending` or later; writable only in `pending`/`accepted`, read-only history otherwise. Message list uses the mockup's `.bub`/`.bub.me` bubble classes. A `useEffect` subscribes to `postgres_changes` on `messages` filtered by `offer_id`, torn down on unmount. Optimistic send: a client-generated temp message appended to local state immediately, reconciled against the real row when it arrives over the subscription, dropped on send failure. Offline queue: unsent messages held per-offer, flushed on the browser's `online` event or the next successful send. On subscription error (`CHANNEL_ERROR`/`TIMED_OUT`), an inline "Reconnecting…" indicator shows and the hook resubscribes; sending is unaffected since the offline queue covers the write path independently of subscription health.
- **`PinnedMeetupCard`** (new component) — rendered once `dealStep` is `'meetup'` or later. No `meetups` row yet: a spot `<select>` (same plain pattern as `app/(app)/post/ListingDetailsFields.tsx:245-253`, fed by the same `meetupSpots` query already used at listing-creation time) plus a `datetime-local` input and a "Propose" button. Row exists, not both confirmed: the mockup's pinned-card look (date/time, spot name, spot hint) plus a "Confirm" button for whichever party hasn't confirmed yet, or a "Waiting for the other side" state for whoever just proposed. Both confirmed: same card plus an "Add to calendar" link (client-side `.ics` download via `buildMeetupIcs`).
- **Stepper** — reuses the mockup's existing `.stepper`/`.st.done`/`.st.now` CSS verbatim (`baylo-agustino-mockup.html:356-368`), driven by `dealStep`.
- **"Mark as swapped"** — gold button (`.btn.gold`), shown once `dealStep === 'meetup'`. Calls `mark_swapped`. If the viewer has already confirmed, the button becomes a disabled "Waiting for [name] to confirm" state rather than disappearing.
- **Cancel** — the Ribbon's overflow-dots icon (present in the Phase 4 deal-room ribbon markup, currently unused) opens a bottom sheet with the curated reason chips + conditional "Other" text field, then calls `cancel_deal`.

### Notification bell (`components/ui/NotificationBell.tsx`, existing, extended)

Adds copy/routing for `meetup_proposed`, `deal_completed`, `deal_cancelled` alongside the existing `offer_*` kinds. No structural change to the component.

---

## Tests

### Unit

- `lib/deals/stepper.test.ts` — full status → step table.
- `lib/deals/ics.test.ts` — VEVENT text correctness, timezone conversion, escaping.

### pgTAP — `supabase/tests/phase5_deal_room_rls.sql`

- Privilege checks: `authenticated` has `SELECT` but not direct `INSERT`/`UPDATE`/`DELETE` on `meetups`/`deal_confirmations`; has `INSERT` (not `UPDATE`/`DELETE`) on `messages`; has `EXECUTE` on `propose_meetup`/`confirm_meetup`/`mark_swapped`/`cancel_deal`.
- Functional RLS: a party to the offer can see its `meetups`/`messages`/`deal_confirmations`/`offer_cancellations` rows; a third party sees zero (same pattern as `phase4_offers_rls.sql`).
- Completion trigger fires at exactly 2 `deal_confirmations` rows, not before; a same-user double-insert is a no-op and does not double-fire.
- `cancel_deal` reverts `listings.status` to `active` and sets `offers.status` to `cancelled`.
- `was_late` boundary: cancelling at exactly `scheduled_at - 2h` is `true`; one minute before that boundary is `false`.
- `messages` insert RLS: a non-party's insert attempt is rejected; a party's insert to a `declined`/`expired`/`cancelled`/`withdrawn` offer is rejected (chat write window is `pending`/`accepted` only).

### Realtime authorization — raw client, not pgTAP or Playwright

The build spec's "Done when" list calls for this to be tested explicitly with a raw client, and pgTAP can't reach it — Realtime's enforcement of RLS on `postgres_changes` happens in the Realtime server layer, not something a SQL script exercises. A small `@supabase/supabase-js`-only script (no browser): sign in as a third fixture user, subscribe to `postgres_changes` on `messages` filtered to an offer between two _other_ fixture users, have one of those two send a message via a separate authenticated client, assert the third user's subscription receives nothing within a timeout.

### E2E (Playwright) — extends the two-fixture-user pattern from `e2e/offer-negotiation.spec.ts`

- Full happy path: accept → propose meetup → other side confirms → a chat message sent in one browser context appears in the other without a reload → both mark swapped → offer/listing flip to `completed`.
- Cancellation: accept → cancel with a reason → listing reverts to `active`, deal room shows the cancelled stamp instead of the stepper.
- Third-party page-load isolation: a third fixture user hitting `/deals/[id]` for an offer they're not party to is blocked — named explicitly in the build spec's "Done when," worth its own regression test even though existing RLS/middleware should already cover it.

Live verification (the full accept → meetup → chat → swap sequence, and the raw-client realtime-isolation script) follows this project's established pattern: hosted Supabase project, `psql`/`supabase db query --linked`, no Docker required.

---

## Acceptance Criteria

| Build-spec "Done when"                                                                 | How it's proven                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages arrive in under 1s between two devices                                        | E2E: two browser contexts, message sent in one observed in the other without a reload/poll                                                                              |
| A third user cannot subscribe to a deal channel they aren't party to (raw-client test) | Dedicated `@supabase/supabase-js` script asserting zero events received by a non-party subscription                                                                     |
| Completion cannot be self-declared by one side                                         | pgTAP: trigger fires only at 2 `deal_confirmations` rows; RLS forbids a client from writing `offers.status` or `deal_confirmations.user_id` on the other party's behalf |
| TypeScript clean                                                                       | `npx tsc --noEmit`                                                                                                                                                      |
| ESLint clean                                                                           | `npx eslint . --max-warnings 0`                                                                                                                                         |
| Build clean                                                                            | `npm run build`; `/deals/[id]` continues to render with the new stepper/meetup card/chat                                                                                |

---

## Deferred Out of Phase 5 Scope

- **`show_up_rate` computation** (Decision 2) — Phase 6 (Trust & safety) turns `offer_cancellations.was_late` and completed-deal counts into the actual score.
- **Reviews** (Decision 5) — table and UI both belong to Phase 6.
- **Web push for chat/deal-room events** — Phase 4 already deferred web push generally to Phase 8; Phase 5 follows the same in-app-only pattern via `notifications`.
- **Per-message notifications** — chat is Realtime-visible while the deal room is open; only meetup/completion/cancellation events notify.
