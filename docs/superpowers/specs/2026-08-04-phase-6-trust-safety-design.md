# Phase 6 — Trust & Safety Design

**Date:** 2026-08-04
**Status:** Approved
**Scope:** Make the honest students visible.

---

## Context

Phases 1–5 shipped identity, listings, discovery, the offer engine, and the deal room — a student can find something, negotiate for it, and close the deal. What's missing is the reputation and safety layer the design system's own voice already promises ("Trust is the product. Show-up rate carries more weight than stars, because the failure mode here is a no-show.") Phase 6 adds it: post-completion reviews, derived trust scoring, earned stamps, a report flow, and the app's first admin surface with a full audit trail.

`profiles.trust_score`, `show_up_rate`, `completed_deals`, and `is_suspended` have existed since Phase 1 but have never been written to by anything except onboarding's initial defaults. Phase 5's `offer_cancellations.was_late` was explicitly built as a raw signal for this phase — but per the scope decision below, it stays unconsumed for now; `show_up_rate` is computed from reviews alone.

Six scope decisions were made explicitly during brainstorming:

1. **Trust signals stay independent.** `trust_score` is purely the average star rating; `show_up_rate` is purely the fraction of reviews answering "did they show up?" `true`. Phase 5's `was_late` cancellation signal is not blended in — it stays a recorded-but-unconsumed data point, since blending two different write paths into one derived column would complicate the trigger for a modest accuracy gain, and reviews already require a completed deal to exist at all, which `was_late` doesn't.
2. **Reviews are bidirectional, one-shot, asymmetric.** Both parties to a completed deal can review each other, exactly once each (`unique (offer_id, reviewer_id)`), and neither review depends on the other existing.
3. **Stamp thresholds require a minimum sample size.** "Fair trader" (`trust_score >= 4.0`) and "Always on time" (`show_up_rate >= 0.9`) both additionally require `review_count >= 3`, so one lucky or unlucky review can't swing a badge on or off. "First baylo" (`completed_deals >= 1`) and "Ten baylos" (`completed_deals >= 10`) have no such gate — they're pure counts, not averages.
4. **Admin access is a `user_roles` table, not a JWT claim.** Checked in `middleware.ts` the same way onboarding/suspension already gate routes. No self-service admin signup — granted via a direct SQL insert against the linked project, same as fixture-user seeding.
5. **`policy_version` moves from a code constant to a DB-backed single-row setting**, so an admin can bump it without a deploy. House rules _text_ stays in `lib/auth/house-rules.ts`; only the version number moves. Enforcing re-acceptance on already-onboarded users after a bump is explicitly out of scope — the build spec's own "Done when" list doesn't require it, and it's meaningful additional plumbing (a middleware check comparing acceptance currency) that can be added later if needed.
6. **Reports carry an explicit status (`open`/`dismissed`/`actioned`)** rather than being a scan-only log, so the same report can't be worked twice and the queue has a real "done" state.

---

## Data Model

**Migration:** `supabase/migrations/20260917000000_phase6_trust_safety.sql` — tables, RLS, triggers, RPCs all in this one file, per project convention.

```sql
-- ═══ reviews ═══
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references public.offers on delete cascade,
  reviewer_id  uuid not null references public.profiles on delete cascade,
  reviewee_id  uuid not null references public.profiles on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  showed_up    boolean not null,
  comment      text check (char_length(comment) <= 500),
  created_at   timestamptz not null default now(),
  unique (offer_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);
create index on public.reviews (reviewee_id);

-- ═══ profiles: review_count derived column ═══
alter table public.profiles add column review_count integer not null default 0;

-- ═══ user_roles ═══
create table public.user_roles (
  user_id uuid not null references public.profiles on delete cascade,
  role    text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ═══ reports ═══
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles on delete cascade,
  target_type  text not null check (target_type in ('listing', 'profile', 'message')),
  target_id    uuid not null,
  reason_code  text not null check (reason_code in
                 ('banned_item', 'misleading', 'harassment', 'no_show_scam', 'spam', 'other')),
  reason_text  text check (char_length(reason_text) <= 500),
  status       text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  resolved_by  uuid references public.profiles,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.reports (status, created_at);

-- ═══ audit_log ═══
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references public.profiles,
  action      text not null,
  target_type text not null,
  target_id   uuid,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ═══ app_settings — single-row config ═══
create table public.app_settings (
  id boolean primary key default true check (id),
  policy_version integer not null default 1
);
insert into public.app_settings (policy_version) values (1);  -- id defaults to true

-- ═══ notifications: generalize beyond offer-only events ═══
alter table public.notifications alter column offer_id drop not null;
alter table public.notifications add column listing_id uuid references public.listings on delete cascade;
alter table public.notifications add column reason text;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('offer_received', 'offer_countered', 'offer_accepted', 'offer_declined',
   'offer_withdrawn', 'offer_expired',
   'meetup_proposed', 'deal_completed', 'deal_cancelled',
   'listing_removed', 'account_suspended'));
```

**RLS:**

- `reviews`: `SELECT` open to any authenticated user (public profile data, same visibility as `trust_score` already on listing cards). `INSERT`/`UPDATE`/`DELETE` revoked from `authenticated` — only `submit_review` writes.
- `user_roles`, `audit_log`: `SELECT` restricted to admins only, via an `is_admin(uuid)` `SECURITY DEFINER` helper (mirrors Phase 1's `is_blocked_by` pattern — a raw `exists (select 1 from user_roles where ...)` inside another policy would itself be gated by `user_roles`' own restrictive RLS and silently evaluate false for non-admins, so the check needs to run as its owner).
- `reports`: `SELECT` for admins (all rows) or the reporter (their own rows only, `reporter_id = auth.uid()`). `INSERT` only via `submit_report`.
- `app_settings`: `SELECT` open to all (onboarding needs the current `policy_version` client-side); writes only via `admin_bump_policy_version`.
- `meetup_spots`: still has no `authenticated` write grant (unchanged from Phase 1/2) — all writes now go through `admin_upsert_meetup_spot`.

**`NotificationBell.tsx` routing fix required.** Its click handler currently does `router.push(\`/deals/${notification.offer_id}\`)` unconditionally — this breaks for the two new kinds, since `offer_id` is now null for both. Needs a small branch: `offer_id` present → existing `/deals/${offer_id}`behavior;`listing_removed`→`/l/${code}`if the listing still resolves a code, else`/ako`; `account_suspended`→ no navigation, just dismiss (the suspended user is about to be redirected to`/suspended` by middleware on their next request regardless).

**Completion trigger:** none needed for `trust_score`/`show_up_rate`/`review_count` — `submit_review` recomputes all three directly in the same function as the insert, keeping the write and the derived-value update in one auditable place rather than a separate trigger.

---

## RPCs (`SECURITY DEFINER`, `SET search_path = ''`, fully qualified identifiers — matching Phase 4/5 conventions, including the explicit `auth.uid() is null` guard and `anon`/`public` EXECUTE revokes on every RPC from the start)

- **`submit_review(p_offer_id uuid, p_reviewee_id uuid, p_rating smallint, p_showed_up boolean, p_comment text)`** — caller must be a party to a `'completed'` offer; `p_reviewee_id` must be the _other_ party; inserts the review (the `unique (offer_id, reviewer_id)` constraint blocks a second review, RPC surfaces a friendly message on conflict); recomputes the reviewee's `trust_score` (`avg(rating)`), `show_up_rate` (`avg(showed_up::int)`), and `review_count` (`count(*)`) over all reviews where `reviewee_id` matches.
- **`submit_report(p_target_type text, p_target_id uuid, p_reason_code text, p_reason_text text)`** — any authenticated caller; rate-limited to 10/day per reporter (same shape as Phase 2/4's existing rate limits); validates `p_target_id` exists in the table matching `p_target_type` (`listings`/`profiles`/`messages`) before inserting.
- **`admin_take_down_listing(p_listing_id uuid, p_reason text, p_report_id uuid)`** — admin-only (`is_admin(auth.uid())`); sets `listings.status = 'removed'`; inserts a `listing_removed` notification to the owner carrying `p_reason`; if `p_report_id` is provided, flips that report to `'actioned'`; writes `audit_log`.
- **`admin_suspend_user(p_user_id uuid, p_reason text, p_report_id uuid)`** / **`admin_unsuspend_user(p_user_id uuid)`** — admin-only; flips `profiles.is_suspended`; notifies (`account_suspended`) with reason on suspend; `p_report_id` handling as above; audit row.
- **`admin_dismiss_report(p_report_id uuid)`** — admin-only; sets `status = 'dismissed'`, `resolved_by = auth.uid()`, `resolved_at = now()`; audit row.
- **`admin_upsert_meetup_spot(p_id smallint, p_name text, p_hint text, p_is_camera_covered boolean, p_active boolean)`** — admin-only; `p_id null` inserts a new spot, non-null updates; audit row.
- **`admin_bump_policy_version()`** — admin-only; increments `app_settings.policy_version`; audit row.

---

## Pure Functions

### `lib/trust/stamps.ts`

```typescript
export interface StampInput {
  trust_score: number
  show_up_rate: number | null
  completed_deals: number
  review_count: number
}
export type Stamp = 'first_baylo' | 'ten_baylos' | 'fair_trader' | 'always_on_time'

export function earnedStamps(input: StampInput): Stamp[]
```

A pure, unit-tested mapping applying the four thresholds from Decision 3 above. Tested with a full boundary table (`review_count` at 2 vs 3, scores exactly at vs. just under each threshold) the same way `lib/offers/balance.test.ts` tests every threshold boundary.

---

## Screens

### Review prompt (new, triggered from the deal room)

Once `offers.status === 'completed'`, `app/(app)/deals/[id]/OfferThread.tsx` shows a one-time prompt (reusing `Sheet`) for whichever party hasn't yet reviewed: star rating (1–5), the "Did they show up?" boolean as a separate required control, optional comment. Calls `submit_review`.

### Profile (`Ako`) — existing screen, wired up

The mockup already reserves the "Earned" stamps row (`baylo-agustino-mockup.html:769-772`) — `earnedStamps()` output renders there. `trust_score`/`show_up_rate` already display on profile/listing cards from earlier phases; no new display code needed beyond stamps.

### Report entry points

A "Report" action added to: listing detail (`app/(app)/l/[code]/page.tsx`), profile pages, and each chat message in `DealChat.tsx`. All three open the same reusable `ReportSheet` component (target type + id passed in) with the curated reason chips + conditional "Other" text field — same UI pattern as Phase 5's `CancelMenuButton`.

### `/admin` (new route group, middleware-guarded)

- **`/admin`** — report queue, grouped by `target_type`, each row linking to the actual target and offering Dismiss / Take Action. Denser data-table styling than the rest of the app — same design tokens, no chit/ribbon treatment (this is an ops screen).
- **`/admin/users`** — search, suspend/unsuspend.
- **`/admin/meetup-spots`** — list + create/edit form for the existing `meetup_spots` table.
- Policy-version bump — a single button + confirmation on the admin dashboard.

`middleware.ts` gains an `/admin` path check: authenticated + `is_admin(auth.uid())`, else redirect to `/`.

---

## Tests

### Unit

- `lib/trust/stamps.test.ts` — full threshold/boundary table for all four stamps.

### pgTAP — `supabase/tests/phase6_trust_safety_rls.sql`

- Privilege checks: `authenticated` has zero direct writes on `reviews`/`reports`/`user_roles`/`audit_log`/`app_settings`; has `EXECUTE` on `submit_review`/`submit_report`; does **not** have `EXECUTE` on any `admin_*` RPC unless granted `user_roles` admin.
- `anon` EXECUTE explicitly revoked on every new RPC (the Phase 4/5 auth-bypass class, guarded against from the start this time, not retrofitted).
- `submit_review`: correctly recomputes `trust_score`/`show_up_rate`/`review_count`; a second review from the same reviewer on the same offer is rejected; reviewing yourself is rejected.
- Every `admin_*` RPC: succeeds for a caller with a `user_roles` admin row, rejected for an authenticated non-admin caller.
- Feed query excludes a suspended user's listings (functional RLS/query test, not just a privilege check).
- `submit_report` rejects a `target_id` that doesn't exist for the given `target_type`.
- `admin_take_down_listing`/`admin_suspend_user` flip a referenced report's status to `'actioned'`.

### E2E

- `e2e/reviews.spec.ts` — complete a deal, both parties submit reviews, confirm stamps appear once `review_count >= 3` is reached (seeded with prior completed deals).
- `e2e/admin-moderation.spec.ts` — report → admin queue → dismiss; report → admin takedown → listing vanishes from feed + owner notified with reason; admin suspend → suspended user's listings vanish from another user's feed + they're redirected to `/suspended`.
- **Fixture note:** `e2e-fixture-3@usa.edu.ph` gets `user_roles` admin granted live for these tests, rather than seeding a fourth account — it isn't used as a moderation target in these specific specs.

Live verification (hosted Supabase project, `psql`/`supabase db query --linked`, no Docker) follows this project's established pattern throughout.

---

## Acceptance Criteria

| Build-spec "Done when"                                                   | How it's proven                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A takedown notifies the owner with the specific rule cited               | `admin_take_down_listing` inserts a `listing_removed` notification carrying `p_reason`; E2E asserts it              |
| A suspended user's listings disappear from the feed within one page load | Feed query excludes suspended owners; pgTAP + E2E assert a fresh feed load omits them                               |
| No moderation action is possible without an audit row                    | Every `admin_*` RPC writes `audit_log` in the same transaction as its action; pgTAP asserts a row exists after each |
| TypeScript clean                                                         | `npx tsc --noEmit`                                                                                                  |
| ESLint clean                                                             | `npx eslint . --max-warnings 0`                                                                                     |
| Build clean                                                              | `npm run build`; `/admin`, `/admin/users`, `/admin/meetup-spots` appear in the route manifest                       |

---

## Deferred Out of Phase 6 Scope

- **Blending `was_late` into `show_up_rate`** (Decision 1) — reviews-only for now.
- **Forced re-acceptance on policy-version bump** (Decision 5) — the version becomes live/admin-changeable, but nothing yet prompts an already-onboarded user to re-accept.
- **Self-service admin roles** — always a direct DB grant, no in-app role management UI.
