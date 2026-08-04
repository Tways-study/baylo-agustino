# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Baylo Agustino — CLAUDE.md

Campus-only trading PWA for University of San Agustin, Iloilo City.
Owner: TWICECODED · Stack: Next.js 15, React 19, TypeScript strict, Tailwind v4, Supabase

## Commands

```bash
npm run dev          # Turbopack dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (next lint)
npm run type-check   # tsc --noEmit, no emit
npm run test         # Vitest unit tests (all *.test.ts outside e2e/)
npm run test:e2e     # Playwright E2E against running dev server
```

Run a single unit test file:

```bash
npx vitest run lib/offers/state-machine.test.ts
```

E2E tests run against `http://localhost:3000` by default; override with `PLAYWRIGHT_BASE_URL`. The `webServer` config auto-starts `npm run dev` unless an existing server is detected (`reuseExistingServer: !CI`). E2E tests run serially (`fullyParallel: false`) — listing creation touches shared rate-limit state.

---

## Architecture

### Route groups

| Group    | Path                                        | Purpose                                  |
| -------- | ------------------------------------------- | ---------------------------------------- |
| `(auth)` | `/login`, `/onboarding`, `/suspended`       | Unauthenticated / gate screens           |
| `(app)`  | `/`, `/post`, `/l/[code]`, `/deals`, `/ako` | Authenticated app shell with `BottomNav` |
| `(dev)`  | `/dev`                                      | Local design-system sandbox only         |

### Middleware (`middleware.ts`)

All requests (excluding `_next/`, `favicon.ico`, `manifest.json`, `sw.js`, `icons/`) pass through the middleware. It enforces the session → profile state machine:

1. No session → `/login`
2. Has session + on `/login` → check profile; if onboarded redirect to `/`
3. Has session + protected route → if no profile or `verified_at` is null → `/onboarding`; if `is_suspended` → `/suspended`

### `lib/` domain structure

Each domain folder owns its Zod schemas, server actions, DB queries, and utility functions. Schemas are the single source of truth — inferred types flow to both form and action.

- `lib/auth/` — OTP send/verify/onboarding actions, `getAuthUser()`, `house-rules.ts`
- `lib/listings/` — CRUD actions, banned-word filter, formatting helpers
- `lib/offers/` — Pure state-machine (`canTransition`), balance-beam logic, server actions
- `lib/deals/` — Deal-room stepper, real-time subscription helpers, ICS export
- `lib/discovery/` — Search, filter, format helpers
- `lib/media/` — Client-side EXIF-stripped image compression (via `browser-image-compression`), public URL helper
- `lib/supabase/server.ts` — Cookie-based `SupabaseClient<Database>` for Server Components / Server Actions (guarded by `import "server-only"`)
- `lib/supabase/client.ts` — Browser `SupabaseClient<Database>` for Client Components

### Supabase client pattern

Always use `lib/supabase/server.ts` in Server Actions and Server Components; `lib/supabase/client.ts` in `'use client'` components. The server client is `async`; the browser client is synchronous.

### Testing

- **Unit tests** (`*.test.ts`, Vitest, `environment: node`): pure logic only — state machines, balance calculations, format/search helpers. No DOM, no Supabase calls. Live colocated with the module they test.
- **E2E tests** (`e2e/*.spec.ts`, Playwright, `Pixel 5` viewport): full browser flows against the real dev server and real Supabase. Use `signInAsFixtureUser()` from `e2e/helpers/auth.ts` (mints a magic link via service-role admin API, navigates the real browser through it — never hand-craft cookies).

### `components/ui/`

Shared primitive components: `Button`, `Chit`, `ChitSkeleton`, `BottomNav`, `Ribbon`, `Stamp`, `BalanceBeam`, `Sheet`, `Panel`, `Chip`, `IntentTag`, `EmptyState`, `MiniListingRow`, `OfferRow`, `NotificationBell`. Import from `@/components/ui` (barrel `index.ts`).

---

**Read `/baylo-agustino-mockup.html` before writing any UI. It is the visual contract, not a suggestion.**
When the mockup file is not yet present, the tokens and direction below are the authoritative source.

---

## Design direction: Stamped Heraldry

Manila-envelope paper, heavy ink outlines, flat crimson and gold, hard offset shadows, ticket-stub cards, swallowtail ribbons. Reads as _institutional but hand-made_. Every surface is outlined, never softly shadowed.

### CSS tokens (verbatim — never deviate)

```css
--ink: #131010;
--ink-70: #4a4340;
--ink-45: #7c7370;
--crimson: #cc0000;
--crimson-deep: #7e0b16;
--gold: #ffcc00;
--gold-deep: #b98b00;
--paper: #ede3d0;
--paper-dim: #e2d6be;
--card: #fbf7ef;
--radius: 4px;
--stroke: 1.5px solid var(--ink);
--shadow-hard: 3px 3px 0 var(--ink);
```

### Semantic color rules — enforced, not suggested

- **Crimson** = actions and money (buttons, sale tags, price labels)
- **Gold** = swaps and anything earned (swap tags, trust stamps, earned badges)
- **Ink** = structure (outlines, body text, nav icons)
- Gold text on white/paper **always** requires an ink outline — gold-on-white fails contrast and is banned
- Paper (`--paper`) is the page background. Card (`--card`) is for elevated surfaces

### Type scale

| Role    | Face                    | Weight          | Tracking          |
| ------- | ----------------------- | --------------- | ----------------- |
| Display | **Bricolage Grotesque** | 700 / 800       | −0.03em           |
| Body    | **Plus Jakarta Sans**   | 400 / 500 / 700 | default           |
| Utility | **IBM Plex Mono**       | 500 / 600       | +0.1em, uppercase |

CSS variables: `--font-display`, `--font-body`, `--font-mono`

### Signature elements

1. **Swap Chit** — ticket-stub card with perforated divider, punched notches, vertical item code (`BA-0431`) in IBM Plex Mono on the left stub
2. **Balance Beam** — offer composer element; renders trade as a scale that tilts; never shows a number, shows plain-language read
3. **Ribbon header** — crimson band with swallowtail-clipped ends, mono small-caps label

### Banned in this codebase

- `Inter`, `Roboto`, `system-ui` as a primary face
- Purple-on-white gradients
- Blurred drop shadows (`box-shadow` with blur > 0 on card surfaces)
- Generic 2-up card grids without chit styling
- Unstyled shadcn defaults (blue ring, rounded-lg gray card, default focus style)
- Emoji as UI iconography
- Placeholder lorem text in any committed screen
- Hardcoded hex values — use CSS variables only

### Voice

Sentence case. Active verbs. Local register where natural — **Baylohan** (the feed), **Hanap** (wanted posts), **Ako** (profile). Hiligaynon/Taglish in sample content is welcome; never forced onto system messages. Errors state what happened and what to do. Empty screens are invitations: _"Nothing on the floor yet. Post the thing you're not using."_

---

## Standing engineering rules

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`
- No `any`. Zero tolerance. ESLint enforces this.
- Zod schemas live colocated per domain (`lib/auth/schemas.ts`, `lib/listings/schemas.ts`, …), not in one flat `lib/schemas/`. They are the single source of truth for every external boundary in that domain. Inferred types flow to both client form and server action. No unvalidated input reaches business logic.

### Security

- **No service role key ever reaches the client.** It exists only in Edge Functions and server-only modules guarded by `import "server-only"`.
- Every `SECURITY DEFINER` function declares `SET search_path = ''` and fully qualifies identifiers.
- Every table has RLS enabled at creation time, in the same migration. No "we'll add policies later."
- Money is `integer` centavos. Never `float`.
- All timestamps `timestamptz`, stored UTC, rendered in `Asia/Manila`.
- EXIF stripped client-side with `browser-image-compression` **before** any upload.

### Database

- RLS policies and the migration that creates the table go in the same `.sql` file.
- Never generate a migration and its RLS policy in separate turns — they drift.
- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully qualified identifiers.
- Test RLS with pgTAP. A policy without a test is an assumption.

### Offer engine (Phase 4+)

- Write state transitions as pure, unit-tested functions in `lib/offers/` before touching UI.
- Make it write the failing test first for anything in the offer engine.
- Countering is **immutable**: inserts a child offer, marks parent `countered`. Never mutate the parent.
- `completed` is set by a trigger only when `deal_confirmations` holds two rows. No client can write it.

---

## Project phases

Implement one phase at a time. Do not start Phase N+1 until Phase N acceptance criteria pass.

- **Phase 0** — Foundations & design system
- **Phase 1** — Identity & verification
- **Phase 2** — Listings
- **Phase 3** — Discovery
- **Phase 4** — Offer engine ★ (highest risk, budget accordingly)
- **Phase 5** — Deal room (current)
- **Phase 6** — Trust & safety
- **Phase 7** — Social layer
- **Phase 8** — Hardening & launch

Full spec: `baylo-agustino-build-spec.md`

---

## Skills to invoke

| Situation                         | Skill                                              |
| --------------------------------- | -------------------------------------------------- |
| Any UI phase (0, 2, 3, 4, 5, 7)   | `frontend-design` — invoke before writing CSS      |
| Starting any new feature or phase | `superpowers:brainstorming` — before touching code |
| Any bug or test failure           | `superpowers:systematic-debugging`                 |
| Writing new tests                 | `superpowers:test-driven-development`              |
