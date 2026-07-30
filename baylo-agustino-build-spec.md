# Baylo Agustino — Build Spec

**Campus-only trading floor for University of San Agustin, Iloilo City.**
Swap, sell, or hand down items between verified Agustinians. Discovery and coordination live in the app; the handover happens face to face on campus.

| | |
|---|---|
| **Owner** | TWICECODED |
| **Spec version** | 1.0 |
| **Target** | Installable PWA, mobile-first (320px → desktop) |
| **Primary users** | USA undergraduates, 18–22, mid-range Android, campus Wi-Fi + mobile data |
| **Companion artifact** | `baylo-agustino-mockup.html` — visual source of truth |

---

## 1. Product thesis

Campus buy-and-sell already happens, badly, in Facebook groups: posts get buried, no identity guarantee, no way to express *"I don't want your money, I want a Rizal book."* Marketplace apps model **price**. Barter is not about price — it's about **fit and fairness**. Two students with mismatched surplus and need.

Three consequences that drive every decision below:

1. **Intent is the primary axis, not category.** A listing is a `swap`, a `sale`, or a `give` before it is a "book". The UI encodes this first, every time.
2. **The offer is the core object, not the listing.** Most of the engineering complexity is in the offer/counter-offer state machine (Phase 4), not in the CRUD around listings.
3. **Trust is the moat, and the failure mode is a no-show — not fraud.** Nobody is wiring money. Someone doesn't show up at the library at 10:30. So the trust metric that matters is **show-up rate**, ranked above star ratings.

### Explicit non-goals for v1

- No in-app payments, escrow, or wallet. Cash is handed over in person. (Payments pull in BSP/e-money regulatory questions and fraud liability that a student project must not own.)
- No shipping or delivery. Campus meetups only.
- No off-campus users. Verification gate is the product.
- No native app store distribution. PWA, installed from a QR code.

---

## 2. Tech stack — decisions and rejected alternatives

| Layer | Choice | Why this, not that |
|---|---|---|
| **Framework** | Next.js 15 (App Router), React 19, TypeScript strict | Server Components keep the feed payload small on 3G. Server Actions remove a whole API layer. Already the team's strongest stack. |
| **Distribution** | Installable PWA (`next-pwa` / custom SW) | **Rejected: React Native / Expo.** Store review, an Apple developer account, and update latency buy nothing for a single-campus audience reachable by QR code. Revisit only if push reliability on iOS blocks retention. |
| **Styling** | Tailwind CSS v4 + CSS variables + `shadcn/ui` (heavily restyled) | Tokens live in CSS vars so the design system is portable; shadcn primitives are unstyled scaffolding, **not** the visual language. Default shadcn look is a lint failure. |
| **Motion** | Framer Motion, used narrowly | Only for the balance beam, offer state transitions, and sheet presentation. Everything else is CSS. |
| **Database / Auth / Storage / Realtime** | Supabase (Postgres 15, RLS, Storage, Realtime) | One vendor, one auth token, RLS enforced at the row level so a leaked anon key isn't a data breach. Postgres FTS removes the need for a search vendor. |
| **Validation** | Zod v3, shared schemas in `lib/schemas/` | One schema per boundary, inferred types flow to both client form and server action. No unvalidated input reaches business logic. |
| **Forms** | React Hook Form + `zodResolver` | |
| **Images** | `browser-image-compression` client-side → WebP → Supabase Storage → `next/image` | Compress and **strip EXIF before upload** — phone photos carry GPS. Non-negotiable safety requirement. |
| **Push** | Web Push (VAPID) + Supabase Edge Function | iOS Safari 16.4+ supports it for installed PWAs. Fallback: in-app badge + email digest. |
| **Email** | Resend (or MailerSend, already integrated in prior work) | OTP delivery + offer digests. |
| **Hosting** | Vercel (app) + Supabase (data), region `ap-southeast-1` | Singapore is the lowest-latency Supabase region for Iloilo. |
| **Testing** | Vitest (unit), Playwright (E2E), pgTAP (RLS policies) | RLS gets tested as code. A policy without a test is an assumption. |
| **Observability** | Sentry + Vercel Analytics + a `audit_log` table | |

### Standing engineering rules

- `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`.
- **No service role key ever reaches the client.** It exists only in Edge Functions and server-only modules guarded by `import "server-only"`.
- Every `SECURITY DEFINER` function declares `SET search_path = ''` and fully qualifies identifiers. *(This class of bug has bitten this codebase's predecessor — treat any `SECURITY DEFINER` without it as a blocking review comment.)*
- Every table has RLS enabled at creation time, in the same migration. No "we'll add policies later."
- Money is `integer` centavos. Never `float`.
- All timestamps `timestamptz`, stored UTC, rendered in `Asia/Manila`.

---

## 3. Design system

The mockup file is the contract. Read it before writing CSS.

**Direction: "Stamped Heraldry."** The crest is drawn with heavy black outlines over flat crimson and gold — so the interface is too. Manila-envelope paper, hard offset shadows, ticket-stub cards. It reads as *institutional but hand-made*, which is exactly what a student barter board is.

### Tokens

```css
--ink:#131010; --ink-70:#4A4340; --ink-45:#7C7370;
--crimson:#CC0000;      /* sampled from the crest */
--crimson-deep:#7E0B16;
--gold:#FFCC00;         /* sampled from the crest */
--gold-deep:#B98B00;
--paper:#EDE3D0; --paper-dim:#E2D6BE; --card:#FBF7EF;
--radius:4px;
--stroke:1.5px solid var(--ink);
--shadow-hard:3px 3px 0 var(--ink);
```

**Semantics, enforced:** crimson = actions and money. Gold = swaps and anything earned. Ink = structure. Every surface is *outlined*, never softly shadowed.

### Type

| Role | Face | Use |
|---|---|---|
| Display | **Bricolage Grotesque** 700/800, `letter-spacing:-.03em` | Item titles, headings, big numbers |
| Body | **Plus Jakarta Sans** 400/500/700 | All prose and controls |
| Utility | **IBM Plex Mono** 500/600, `letter-spacing:.1em+`, uppercase | Item codes, prices, timestamps, ribbon labels, stat readouts |

### Signature elements

1. **The Swap Chit** — every listing card is a ticket stub: perforated divider, punched notches, vertical item code on the stub. Physical-barter metaphor, and it makes the feed unmistakable in a screenshot.
2. **The Balance Beam** — the offer composer renders the trade as a scale that settles into a tilt, with a plain-language read ("Close enough — send it"). It answers barter's actual question instead of showing two prices.
3. **The Ribbon header** — crimson band with swallow-tail clipped ends, echoing the VIRTUS / SCIENTIA scrolls, carrying mono small-caps labels.

### Banned in this codebase

Inter · Roboto · system-ui as a primary face · purple-on-white gradients · blurred drop shadows · generic 2-up card grids · unstyled shadcn defaults · emoji as UI iconography · placeholder lorem text in any committed screen.

### Voice

Sentence case. Active verbs. Local register where it's natural — **Baylohan** (the feed), **Hanap** (wanted posts), **Ako** (profile), and Hiligaynon/Taglish in sample content — but never forced onto system messages. Errors state what happened and what to do. Empty screens are invitations: *"Nothing on the floor yet. Post the thing you're not using."*

---

## 4. Data model

Written as Phase-0 reference; each phase below ships only its slice.

```sql
-- ═══ identity ═══
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 40),
  program       text,                        -- 'BSIT'
  year_level     smallint check (year_level between 1 and 6),
  avatar_url    text,
  bio           text check (char_length(bio) <= 160),
  verified_at   timestamptz,                 -- set only by the verification flow
  trust_score   numeric(3,2) default 0,      -- derived, written by trigger
  show_up_rate  numeric(4,3),                -- derived
  completed_deals int not null default 0,
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ═══ supply ═══
create type listing_intent as enum ('swap','sale','give');
create type listing_status as enum ('draft','active','reserved','completed','archived','removed');

create table listings (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,          -- 'BA-0431', generated
  owner_id     uuid not null references profiles on delete cascade,
  intent       listing_intent not null,
  title        text not null check (char_length(title) between 3 and 80),
  description  text check (char_length(description) <= 1200),
  category_id  smallint references categories,
  condition    text check (condition in ('new','like_new','good','fair','worn')),
  ask_centavos integer check (ask_centavos >= 0),      -- null for pure swap/give
  accepts_cash boolean not null default false,
  status       listing_status not null default 'draft',
  meetup_spot_id smallint references meetup_spots,
  search_tsv   tsvector generated always as (
                 to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))
               ) stored,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  bumped_at    timestamptz not null default now(),   -- feed ordering
  expires_at   timestamptz not null default now() + interval '30 days'
);
create index on listings using gin (search_tsv);
create index on listings (status, bumped_at desc);

create table listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  storage_path text not null,
  position smallint not null default 0,
  unique (listing_id, position)
);

-- what the owner will accept back (swap listings)
create table listing_wants (
  id bigserial primary key,
  listing_id uuid not null references listings on delete cascade,
  label text not null check (char_length(label) <= 80),
  position smallint not null default 0
);

-- ═══ demand ═══ ("Hanap" — wanted posts, Phase 7)
create table wants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  details text,
  budget_centavos integer,
  offering text,                             -- what they'd swap
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- ═══ the offer engine ═══
create type offer_status as enum
  ('pending','accepted','declined','countered','withdrawn','expired','cancelled','completed');

create table offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listings on delete cascade,
  from_user_id    uuid not null references profiles on delete cascade,
  to_user_id      uuid not null references profiles on delete cascade,
  parent_offer_id uuid references offers,     -- set when this is a counter
  cash_centavos   integer not null default 0 check (cash_centavos >= 0),
  cash_direction  text not null default 'from_offerer'
                    check (cash_direction in ('from_offerer','to_offerer')),
  note            text check (char_length(note) <= 500),
  status          offer_status not null default 'pending',
  expires_at      timestamptz not null default now() + interval '48 hours',
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  check (from_user_id <> to_user_id)
);
create unique index one_live_offer_per_pair
  on offers (listing_id, from_user_id) where status = 'pending';

-- items the offerer is putting on the table
create table offer_items (
  offer_id   uuid references offers on delete cascade,
  listing_id uuid references listings on delete cascade,   -- must be owned by from_user
  primary key (offer_id, listing_id)
);

-- ═══ the handover ═══
create table meetups (
  offer_id     uuid primary key references offers on delete cascade,
  spot_id      smallint not null references meetup_spots,
  scheduled_at timestamptz not null,
  confirmed_by_offerer boolean not null default false,
  confirmed_by_owner   boolean not null default false
);

create table meetup_spots (              -- admin-curated, never free text
  id smallint primary key,
  name text not null,                    -- 'Library lobby'
  hint text,                             -- 'Ground floor, beside the guard desk'
  is_camera_covered boolean not null default false,
  active boolean not null default true
);

create table deal_confirmations (        -- two-sided completion
  offer_id uuid references offers on delete cascade,
  user_id  uuid references profiles on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);

-- ═══ comms ═══
create table messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers on delete cascade,
  sender_id uuid not null references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on messages (offer_id, created_at desc);

-- ═══ trust ═══
create table reviews (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers on delete cascade,
  reviewer_id uuid not null references profiles on delete cascade,
  reviewee_id uuid not null references profiles on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  showed_up boolean not null,
  comment text check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (offer_id, reviewer_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles,
  subject_type text not null check (subject_type in ('listing','profile','message')),
  subject_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open',
  resolved_by uuid references profiles,
  created_at timestamptz not null default now()
);

create table blocks (
  blocker_id uuid references profiles on delete cascade,
  blocked_id uuid references profiles on delete cascade,
  primary key (blocker_id, blocked_id)
);
```

### Offer state machine

```
                    ┌─── withdrawn  (offerer pulls out)
                    ├─── expired    (48h cron)
  pending ──────────┼─── declined   (owner says no)
     │              └─── countered  (owner sends new offer; parent_offer_id set)
     │                        │
     │                        └──> new offers row, status='pending', roles swapped
     ▼
  accepted ──> meetup scheduled ──> both confirm ──> completed ──> reviews unlock
     │                                   │
     └─── cancelled (either side, logged; counts against show-up rate if < 2h before)
```

**Invariants — enforce in the database, not the UI:**

- A listing can have many `pending` offers but only one `accepted` at a time. Accepting sets `listings.status = 'reserved'` and auto-declines nothing (the owner may still fall back if the deal cancels).
- Countering is **immutable**: it never mutates the parent, it inserts a child and marks the parent `countered`. Full negotiation history is auditable.
- `completed` is set by a trigger only when `deal_confirmations` holds two rows. No client can write it.
- Every item in `offer_items` must be `owned by from_user_id` and `status = 'active'` — enforced by a `BEFORE INSERT` trigger, not by trusting the client.

---

## 5. Trust, safety & policy

This is a system built for minors-adjacent users under a university's name. Treat the policy layer as a Phase-1 feature, not a Phase-8 afterthought.

### Prohibited listings — blocked at post time

| Category | Rationale |
|---|---|
| Exam papers, answer keys, completed assignments, theses for sale | **Academic integrity.** This is the single risk that gets the app banned by the administration. Keyword auto-flag + hard block on category. |
| Prescription and OTC medicines, supplements, medical devices | Unlicensed dispensing. FDA/RA 9711 exposure. Non-negotiable. |
| Alcohol, tobacco, vapes | |
| Weapons, including replicas and utility knives | |
| Live animals | |
| School IDs, other people's uniforms with name tags, official documents | Identity fraud |
| Cash lending, `sangla`/pawn arrangements, crypto | Financial harm; out of scope |
| Event ticket resale above face value | |

Post-time flow: Zod schema → banned-keyword matcher (Hiligaynon + Tagalog + English list) → soft warning for grey terms, hard block with a plain explanation for prohibited ones, and a route to appeal. The block message names the rule; it never just says "not allowed."

### Safety by design

- **Verification gate:** only a valid university email domain can create an account. Domain is config (`ALLOWED_EMAIL_DOMAIN`), verified against the university's actual student mail domain before launch.
- **EXIF stripped client-side** before any upload. Photos carry GPS.
- **No exact locations.** Meetups are limited to admin-curated campus spots; students cannot type an address.
- **Chat opens only after an offer.** No cold DMs — this removes the most common harassment vector on campus marketplaces in one line of policy.
- **Block and report on every surface** — listing, profile, message.
- **Rate limits:** 10 listings/day, 20 offers/day, 30 messages/minute, enforced server-side.
- **Minor accounts:** any profile whose verified record indicates under 18 gets no display of year/section and a stricter report threshold.

---

## 6. Delivery phases

Ship in order. Each phase ends with a demoable slice on production URL and a green test suite. Do not start a phase until the prior phase's acceptance criteria pass.

---

### Phase 0 — Foundations & design system
**~3 days · Goal: an empty app that already looks like Baylo Agustino**

**Scope**
- `create-next-app` (TS, App Router, Tailwind v4), ESLint + Prettier, strict tsconfig, Husky pre-commit.
- `app/globals.css` with the full token block from §3. Fonts self-hosted via `next/font/google` (subset `latin`, `display: swap`).
- Primitive components, styled to the direction, in `components/ui/`: `Chit`, `Ribbon`, `IntentTag`, `Chip`, `Button`, `Panel`, `Stamp`, `Sheet`, `BottomNav`, `EmptyState`.
- App shell: bottom nav (Baylohan / Hanap / Post / Deals / Ako), safe-area insets, ribbon header slot.
- PWA manifest, icons generated from the crest mark, service worker registered with a network-first strategy for API and cache-first for static.
- Supabase project (`ap-southeast-1`), local dev via `supabase start`, migration workflow committed.
- `CLAUDE.md` at repo root encoding §3 (tokens, banned patterns, voice) so every later agent run inherits it.

**Done when** — Lighthouse mobile ≥ 90 on an empty shell; app installs to an Android home screen; a Storybook-or-equivalent page renders every primitive; no default shadcn styling survives.

---

### Phase 1 — Identity & verification
**~4 days · Goal: only Agustinians get in**

**Scope**
- Supabase Auth, email OTP only. Server-side check rejecting any address outside `ALLOWED_EMAIL_DOMAIN` **in a database trigger on `auth.users`**, not just in the UI.
- Onboarding: display name → program → year level → avatar → house rules acceptance (versioned; store `accepted_policy_version`).
- `profiles` table + RLS. Public read of a **view** exposing safe columns only; `update` restricted to `auth.uid() = id`.
- Session handling with `@supabase/ssr`, middleware route protection, typed `getSession()` server helper.
- Suspended-account interstitial.

**Schema:** `profiles`, `policy_acceptances`.

**RLS sample**
```sql
alter table profiles enable row level security;

create policy "profiles are readable by verified members"
  on profiles for select
  using (
    auth.uid() is not null
    and not exists (select 1 from blocks
                    where blocker_id = profiles.id and blocked_id = auth.uid())
  );

create policy "users update only themselves"
  on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
```
Note: `verified_at`, `trust_score`, `is_suspended` are revoked from the `authenticated` role at column level — they are written only by triggers and service-role functions.

**Done when** — a `@gmail.com` address cannot create a profile even by calling the API directly; pgTAP proves a user cannot update another user's row; onboarding completes in under 60 seconds on a mid-range Android.

---

### Phase 2 — Listings
**~5 days · Goal: post the thing you're not using**

**Scope**
- Post flow as a 3-step sheet: **intent → photos → details.** Intent first, always.
- Image pipeline: pick up to 4 → compress to ≤ 400KB WebP → strip EXIF → upload to `listing-images/{user_id}/{listing_id}/{uuid}.webp` → optimistic thumbnails.
- Conditional fields by intent: `swap` requires ≥ 1 `listing_wants` row; `sale` requires `ask_centavos`; `give` suppresses price entirely.
- Banned-keyword matcher + policy block screen (§5).
- Human-readable `code` generation (`BA-0431`) via a Postgres sequence + formatter.
- Listing detail, owner edit, archive, and 30-day expiry with a "bump" action (rate-limited to once per 72h).
- My-listings management screen.

**Schema:** `listings`, `listing_images`, `listing_wants`, `categories`, `meetup_spots` (seeded).

**Storage policy**
```sql
create policy "users write only into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

**Done when** — a listing posts end to end on a 3G-throttled Android in under 45 seconds; uploaded images provably carry no EXIF; a `swap` listing cannot be published without at least one want; an exam-key listing is blocked with a readable explanation.

---

### Phase 3 — Discovery
**~4 days · Goal: find the calculator**

**Scope**
- Baylohan feed: server-rendered first page, cursor pagination on `bumped_at`, infinite scroll with skeleton chits.
- Filters: intent, category, condition, price band, "has photos". Filter state in the URL so a feed is shareable.
- Search over `search_tsv` with `pg_trgm` fuzzy fallback for misspellings; per-user recent searches.
- Saved listings ("Bantayan") and a save toggle on the chit.
- Empty and zero-result states with a real next action (post a Hanap).

**Schema:** `saved_listings`, `search_events` (for later ranking work).

**Done when** — feed TTI < 2.5s on throttled 3G; searching `calcu`, `casio`, and `calculator` all surface the same listing; filters survive a refresh and a share.

---

### Phase 4 — The offer engine ★
**~7 days · Goal: the thing that makes this not a Facebook group**

This is the highest-risk phase. Budget accordingly and write the state transitions as pure, unit-tested functions before touching UI.

**Scope**
- Offer composer: pick your items (multi-select from your active listings), add cash either direction, note, then **the balance beam**.
- Balance heuristic — deliberately soft, never a hard valuation. Compare offered items' implied value + cash against the listing ask/estimate, then map the ratio to one of five plain-language reads: *heavily in their favor · slightly in their favor · close enough · slightly in your favor · heavily in your favor.* Show the read, never a number. The heuristic must be a single pure function in `lib/offers/balance.ts` with a test table.
- Offer inbox: received / sent, grouped by status, sorted by expiry.
- Accept, decline, withdraw, and **counter** (inserts a child offer, marks parent `countered`).
- 48-hour expiry via `pg_cron` + an Edge Function.
- Push and in-app notification on every state change.

**Schema:** `offers`, `offer_items`, plus triggers enforcing the §4 invariants.

**RLS sample**
```sql
create policy "offers visible only to the two parties"
  on offers for select
  using (auth.uid() in (from_user_id, to_user_id));

create policy "only the owner responds"
  on offers for update
  using (auth.uid() = to_user_id and status = 'pending')
  with check (status in ('accepted','declined','countered'));
```

**Done when** — a full negotiation (offer → counter → counter → accept) produces a correct, immutable chain queryable in one recursive CTE; a user cannot offer an item they don't own even via direct API call; expiry fires reliably; every transition has a unit test including the illegal ones.

---

### Phase 5 — Deal room
**~5 days · Goal: agree on a time and place, then close it out**

**Scope**
- Chat unlocked by an accepted-or-pending offer only. Supabase Realtime subscription scoped to `offer_id`, with optimistic sends and an offline queue.
- Pinned meetup card: pick a curated spot + time; both sides confirm; calendar `.ics` export.
- Deal stepper — Offered → Accepted → Meetup → Swapped — as real sequence state read from the database.
- Two-sided "Mark as swapped" writing `deal_confirmations`; trigger flips the offer to `completed`, sets both listings to `completed`, and unlocks reviews.
- Cancellation flow with reason capture; cancels inside 2 hours of a scheduled meetup count against show-up rate.

**Schema:** `messages`, `meetups`, `deal_confirmations`.

**Done when** — messages arrive in under 1s between two devices; a third user cannot subscribe to a deal channel they aren't party to (test it explicitly with a raw client); completion cannot be self-declared by one side.

---

### Phase 6 — Trust & safety
**~5 days · Goal: make the honest students visible**

**Scope**
- Post-completion review prompt: 1–5 stars + **"Did they show up?"** as a separate required boolean.
- Derived `trust_score` and `show_up_rate`, recomputed by trigger. Profile displays show-up rate with equal weight to stars.
- Earned stamps: Fair trader, Always on time, First baylo, Ten baylos.
- Report flow on listing / profile / message, with reason taxonomy.
- Admin moderation console (route-guarded by a `role` claim): report queue, listing takedown with reason, account suspension, meetup-spot management, policy-version bump.
- `audit_log` for every moderation action.

**Schema:** `reviews`, `reports`, `blocks`, `audit_log`, `user_roles`.

**Done when** — a takedown notifies the owner with the specific rule cited; a suspended user's listings disappear from the feed within one page load; no moderation action is possible without an audit row.

---

### Phase 7 — Social layer
**~5 days · Goal: the feed has a pulse even when you're not shopping**

**Scope**
- **Hanap** — wanted posts. The inverse of a listing: "looking for a Chem lab manual, can swap a lab gown." Matching notification when a listing appears that hits a Hanap's keywords.
- Follow a seller; "New from people you follow" feed section.
- Campus pulse strip: swaps completed this week, most-wanted item, most-active program — light social proof computed by a nightly materialized view.
- Share-to-story image generator: renders a listing as a branded chit card PNG via `@vercel/og`, sized for Facebook/IG stories. This is the growth loop — the chit design is the ad.

**Schema:** `wants`, `follows`, `pulse_stats` (matview).

**Done when** — a new listing matching an open Hanap notifies within 60 seconds; the generated share card renders correct type and colors at 1080×1920.

---

### Phase 8 — Hardening & launch
**~5 days**

**Scope**
- Full RLS audit: for every table, prove read/write isolation with pgTAP. Sign off table by table.
- Playwright E2E across the five critical journeys: sign up → post → offer → counter → complete.
- Performance pass: bundle analysis, image sizing, `loading="lazy"` audit, Lighthouse ≥ 90 on all four categories, tested on a real mid-range Android over campus Wi-Fi.
- Accessibility: keyboard traversal, visible focus rings in crimson, contrast check (gold-on-white **fails** — gold is only ever used on ink or with an ink outline), `prefers-reduced-motion` honored, screen-reader pass on the offer flow.
- Legal and institutional: privacy notice (RA 10173 Data Privacy Act — collection, retention, deletion path), terms, house rules, **written clearance for crest usage from the university**, named admin contact.
- Seeding: 30 real listings from a pilot cohort before opening. An empty marketplace is a dead marketplace.
- Launch: QR posters at the library, canteen, and college lobbies. Pilot with two colleges before campus-wide.

---

## 7. Success metrics

| Metric | Definition | v1 target |
|---|---|---|
| Verified activation | Verified sign-ups ÷ landing visits | ≥ 35% |
| Supply density | Active listings per active user | ≥ 1.5 |
| **Offer conversion** | Offers reaching `completed` | ≥ 25% |
| **Show-up rate** | Confirmed meetups ÷ scheduled | ≥ 85% |
| Time to first offer | Median, per new listing | < 12 hours |
| Week-4 retention | | ≥ 30% |

Offer conversion and show-up rate are the two that matter. Everything else is vanity.

---

## 8. Working with Claude Code

### Repo conventions to set up first

Create `CLAUDE.md` at the root before Phase 0 work begins, containing: §3 in full (tokens, type roles, banned patterns, voice), the standing engineering rules from §2, and this instruction — *"Read `/baylo-agustino-mockup.html` before writing any UI. It is the visual contract, not a suggestion."*

### Skills to invoke

| Situation | Skill |
|---|---|
| Any UI phase (0, 2, 3, 4, 5, 7) | `frontend-design` — invoke **before** writing CSS, and re-read the direction in §3 rather than defaulting |
| Proposal or defense deck for this project | `capstone-deck` |
| Written documentation deliverables | `master-grammarian` for the final pass |

### Phase prompts

Give Claude Code one phase at a time. Each prompt should follow this shape:

> Read `CLAUDE.md` and `baylo-agustino-build-spec.md`, then implement **Phase N** only.
> Before writing code: list the files you will create or modify, the migration you will write, and the RLS policies with their pgTAP tests. Wait for my approval on that plan.
> Constraints: do not touch anything outside Phase N's scope; every new table ships with RLS enabled in the same migration; every external input passes a Zod schema; no `any`.
> Finish with the phase's acceptance criteria from §6 checked off, each with the command or test that proves it.

Two rules that save the most time in practice:

1. **Never let an agent generate a migration and its RLS policy in separate turns.** They drift.
2. **Make it write the failing test first for anything in the offer engine.** State machines are where plausible-looking generated code quietly breaks.

---

## 9. Open questions to close before Phase 1

1. **Exact student email domain** for the verification gate — confirm with the IT office, and whether alumni and faculty addresses share it.
2. **Crest usage clearance.** Get it in writing from the university's communications office; have a fallback wordmark-only lockup designed in case it's denied.
3. **Institutional sponsor.** Which office owns moderation escalation when a report involves harassment? The app needs a named human, not a queue.
4. **Meetup spot list** — validate the curated spots with campus security, especially camera coverage claims.
5. **Faculty and staff participation** — in or out? Changes the trust model and the power dynamics of a trade.

---

*Baylo · Bakal · Hatag — sa sulod lang sang campus.*
