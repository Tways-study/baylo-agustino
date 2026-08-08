# Phase 8 — Hardening & Launch Progress Report

**Status:** In progress, paused mid-implementation. 1 of 11 planned work items complete.

**Full engineering plan:** see "Approved plan" section below (mirrored from the Claude Code plan file used to scope this work, since that file lives outside the repo).

---

## Scope note

`baylo-agustino-build-spec.md` §6 defines Phase 8 broadly: RLS audit, E2E coverage, a performance pass, an accessibility pass, legal/institutional docs, real-listing seeding, and physical launch logistics (QR posters, pilot rollout). The last three (pilot-cohort seeding, poster printing, university crest legal clearance) are the founder's own real-world follow-ups, not code, and are out of scope for this engineering plan. Four engineering-buildable areas were scoped with the founder instead — see below.

Four open implementation decisions were resolved with the founder before work began (all "recommended" defaults accepted):

1. **Account deletion** → self-serve delete flow (not email-to-admin)
2. **E2E signup simulation** → generalized magic-link helper (not real OTP entry via Inbucket)
3. **Login rate-limit key** → email-only (not email+IP)
4. **Storage RLS proof** → rely on existing E2E coverage (not new pgTAP for `storage.objects`)

Two verify-during-implementation notes (not decisions, just things to check when picking this back up):

- Whether `supabase/config.toml`'s existing `[auth.rate_limit]` block is actually applied to the **hosted** Supabase project (not just local dev) — check before assuming the new app-level throttle below is the only backstop.
- Whether Next 15's app-router hydration payload requires `'unsafe-inline'`/a nonce in `script-src` even after removing the one custom inline script — confirm against a real production build, not dev.

---

## What's done

### ✅ Area 1a — RLS audit backfill (Task 1/11, complete)

`phase1_rls.sql`, `phase2_listings_rls.sql`, and `phase3_discovery_rls.sql` predated the two-identity functional-proof convention established from `phase4_offers_rls.sql` onward (`set_config('role','authenticated',true)` + `set_config('request.jwt.claims', ...)` to simulate a real caller, then query/insert as that identity — see `phase6_trust_safety.sql` for the clearest example). All three files only proved grants and policy _existence_, never a real cross-user query. Appended functional assertions to each (no new files created, consistent with the "one file per phase" convention):

| File                                      | Before → After          | What was added                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/tests/phase1_rls.sql`           | `plan(15)` → `plan(25)` | `blocks` own-insert/cross-insert-rejected/select-isolation; `policy_acceptances` same shape; `profiles` — real query proof that a block hides the blocker's profile from the blocked party in one direction only (blocker keeps visibility into the blocked user) |
| `supabase/tests/phase2_listings_rls.sql`  | `plan(22)` → `plan(28)` | draft-listing visibility (owner sees it, non-owner doesn't); `listing_images`/`listing_wants` following the parent listing's visibility; a real block hiding an otherwise-active listing (previously only proven via a regex match on `pg_policies.qual`)         |
| `supabase/tests/phase3_discovery_rls.sql` | `plan(9)` → `plan(17)`  | `saved_listings` and `search_events` — own-insert succeeds, cross-user insert rejected by `with check`, cross-user select returns 0                                                                                                                               |

All three files were statically reviewed (signatures, FK requirements, enum/check-constraint values, exact assertion counts vs. `plan(N)`) but **not executed** — this environment has no Docker, so `supabase test db` could not be run. This is the same caveat noted for `phase6_trust_safety.sql` earlier in the Phase 6 work.

**Not yet done in this file's scope:** the auth-rate-limiting pgTAP additions to `phase8_auth_helpers.sql` (Task 2, not started) and the E2E happy-path spec (Task 11, not started).

---

## What's remaining (10 of 11 tasks)

### Area 1 — Security & reliability hardening

- [ ] **Task 2 — Auth rate-limiting migration + wiring.** New migration `supabase/migrations/<ts>_phase8_auth_rate_limiting.sql`: `email_send_attempts`/`login_attempts` tables (RLS enabled, zero policies — deny-all, SECURITY DEFINER RPC is the only door) + `check_and_log_email_send`/`check_login_rate_limit`/`record_login_attempt` RPCs, following the exact hand-rolled-per-RPC pattern already used for listings (10/day) and reports (10/24h). Email-only key (5/hour for OTP+password-reset sends, 5 failures/15min for login). Wire into `lib/auth/actions.ts`'s `sendOtp()`, `sendPasswordReset()`, `signInWithPassword()` — call `record_login_attempt` _before_ any `redirect()` since `redirect()` throws internally in Next.js. Extend `supabase/tests/phase8_auth_helpers.sql` (currently `plan(5)`) with grant checks + functional throttle-trips-at-N tests.
- [ ] **Task 3 — reset-password session guard.** `app/(auth)/reset-password/page.tsx` renders the password form unconditionally today. Add a mount-time check (`onAuthStateChange` for `PASSWORD_RECOVERY`, or `getSession()`) gated behind a loading state; show an `EmptyState`-style "This link has expired or was already used." + link to `/login` when there's no valid recovery session.
- [ ] **Task 4 — Root error/not-found boundaries.** `app/global-error.tsx` (self-contained `<html>`/`<body>`, inline hex colors — same documented exception as `app/api/og/[code]/route.tsx`), `app/error.tsx` (`'use client'`, `EmptyState`-styled, "Try again" calling `reset()`), `app/not-found.tsx` (`EmptyState`-styled). Root-level only, no route-group-scoped variants.
- [ ] **Task 5 — Security headers + externalize SW registration.** Extend `next.config.ts`'s `headers()` with a global entry: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (deny camera/geolocation/microphone), `X-Frame-Options: DENY`, and a CSP built from `NEXT_PUBLIC_SUPABASE_URL` at build time. `style-src 'unsafe-inline'` required (inline styles are pervasive; framer-motion writes inline styles at runtime) — document as a deliberate trade-off. Move `app/layout.tsx`'s inline `<script dangerouslySetInnerHTML>` SW registration into a new `app/ServiceWorkerRegistration.tsx` client component so `script-src 'self'` needs no `unsafe-inline`/hash.

### Area 2 — E2E happy-path coverage

- [ ] **Task 11 — `e2e/happy-path.spec.ts`.** New `signUpNewUser(page, email)` helper in `e2e/helpers/auth.ts` (generalizes `signInAsFixtureUser()`'s magic-link mechanics to a brand-new email). Full journey: fresh user signs up → real 6-step onboarding wizard → posts a listing via real `/post` UI → fixture user B offers → counter → counter → accept (reusing `offer-negotiation.spec.ts`'s two-context pattern) → deal room: propose meetup → confirm → live chat → both mark swapped → assert both `offers.status`/`listings.status` are `completed`.

### Area 3 — Accessibility & performance pass

- [ ] **Task 6 — Focus rings + reduced-motion.** Remove `outline-none` from the 3 text inputs in `app/(app)/hanap/PostHanapSheet.tsx` (the global crimson `:focus-visible` rule in `app/globals.css` already exists and works everywhere else). Add a global `@media (prefers-reduced-motion: reduce)` CSS rule (also neutralizes `BalanceBeam`'s inline CSS transition via `!important` cascade — satisfies the build-spec's "balance beam settles instantly" requirement with zero BalanceBeam-specific code). Add `app/MotionProvider.tsx` (`'use client'`, wraps `{children}` in `app/layout.tsx` with framer-motion's `<MotionConfig reducedMotion="user">`) to cover `Sheet.tsx`'s JS-driven spring animations, which the CSS rule alone can't reach.
- [ ] **Task 7 — `loading.tsx` boundaries.** `app/(app)/loading.tsx` and `app/(app)/hanap/loading.tsx` reusing `components/ui/ChitSkeleton.tsx` directly; `app/(app)/l/[code]/loading.tsx` needs a new, simple hero-image-block + text-lines skeleton (no existing component covers that shape).
- [ ] **Task 8 — PWA manifest/icons.** Generate PNG icons (192×192, 512×512 `purpose:"any"`, a padded-safe-zone 512 `purpose:"maskable"` variant, 180×180 apple-touch-icon) from the existing SVG source, add to `public/icons/`, update `manifest.json`'s `icons` array. Fix `app/layout.tsx`'s `<link rel="apple-touch-icon" href="/icons/icon-192.svg">` — **this is a real defect, not just an enhancement**: Safari does not support SVG apple-touch-icons at all, so "Add to Home Screen" is silently broken on iOS today. (`metadata.manifest` and `viewport.themeColor` are already correctly set in `app/layout.tsx` — no change needed there.)

### Area 4 — Legal/content pages + account deletion

- [ ] **Task 9 — Legal pages.** New `app/legal/` route segment (plain segment, not a parenthesized route group — needs to be reachable both pre-auth and post-auth): `app/legal/layout.tsx` (minimal Ribbon-header chrome), `app/legal/privacy/page.tsx` (RA 10173-oriented draft — what's collected, why, retention, deletion path), `app/legal/terms/page.tsx` (reuse the build-spec/PRD's prohibited-listings list verbatim, suspension/dispute handling referencing Phase 6 mechanics), `app/legal/house-rules/page.tsx` (renders `HOUSE_RULES_V1` from `lib/auth/house-rules.ts` directly — single source of truth, no copy duplication). Every page needs an unmissable `[ADMIN CONTACT — TODO: name + email before launch]` placeholder, a "founder-drafted, pending real legal review" disclaimer, and a `<!-- TODO: crest usage clearance -->` note wherever a university mark would otherwise appear. Add `/legal` to `middleware.ts`'s `PUBLIC_PATHS` (one-line change). Link from `app/(auth)/login/page.tsx` footer, the onboarding house-rules step, and a new "Legal" block in `app/(app)/profile/page.tsx`.
- [ ] **Task 10 — Self-serve account deletion.** New `lib/account/actions.ts` (new domain folder — doesn't fit under `lib/auth/`), server-only action using the Supabase service-role admin client (`supabase.auth.admin.deleteUser`), guarded by `import "server-only"`. Existing FK `on delete cascade` chains from `profiles`/`listings`/etc. back to `auth.users` handle the data cascade already — this action is just the confirmed, authenticated entry point. UI: "Delete my account" button in `app/(app)/profile/page.tsx`'s new Legal/account block, behind a `Sheet`-based confirmation step (check `lib/deals/actions.ts`'s cancel-deal flow for the existing confirmation-UX pattern to match).

---

## Verification checklist (once all tasks are done)

- `npm run type-check`, `npm run lint`, `npm run test` clean throughout.
- `supabase test db` against a local Docker-backed stack for every new/extended pgTAP file — **not run yet, no Docker in this environment**.
- `npm run test:e2e` (or `npx playwright test e2e/happy-path.spec.ts` in isolation) against a running dev server + local Supabase stack.
- Security headers: verify on a production build (`npm run build && npm start`) that the SW still registers, Supabase auth redirects still complete, and no CSP violations appear in console — this is also where the hydration-payload `script-src` caveat gets resolved for real.
- Manifest/icons: Chrome DevTools Application panel + an actual "Add to Home Screen" on iOS for the apple-touch-icon fix.
- Reduced-motion: macOS System Settings > Accessibility toggle — confirm BalanceBeam settles instantly and Sheet's slide-in has no spring bounce.
- Account deletion: manually verify session invalidation + cascade deletion against a local/staging project, **never production data**, until confident.

---

## How to resume

1. Read this file for context (decisions already made, don't re-ask).
2. Pick up at **Task 2 — Auth rate-limiting migration + wiring** (next in the planned order).
3. The rest of the task list, in planned order: 3 (reset-password guard) → 4 (error boundaries) → 5 (security headers) → 6 (a11y) → 7 (loading states) → 8 (PWA icons) → 9 (legal pages) → 10 (account deletion) → 11 (E2E happy path, last — it exercises the full app so it's most useful once everything else has settled).
