# Phase 8 — Hardening & Launch Progress Report

**Status:** All 11 planned engineering tasks complete. `type-check`, `lint`, unit tests (112/112), and a full production `next build` are all green. Not yet run: `supabase test db` (no Docker in the environment this work was done in) or `npm run test:e2e` against a live stack.

---

## Scope note

`baylo-agustino-build-spec.md` §6 defines Phase 8 broadly: RLS audit, E2E coverage, a performance pass, an accessibility pass, legal/institutional docs, real-listing seeding, and physical launch logistics (QR posters, pilot rollout). The last three (pilot-cohort seeding, poster printing, university crest legal clearance) are the founder's own real-world follow-ups, not code, and stay out of scope here. Four engineering-buildable areas were scoped with the founder — all four are now built.

Decisions resolved with the founder before work began (all "recommended" defaults accepted): self-serve account deletion, generalized-magic-link E2E signup, email-only login rate-limiting, and deferring `storage.objects` RLS proof to existing E2E coverage rather than new pgTAP.

---

## What was built

### Area 1 — Security & reliability hardening

- **RLS audit backfill** — `phase1_rls.sql` (15→25 assertions), `phase2_listings_rls.sql` (22→28), `phase3_discovery_rls.sql` (9→17) now have real two-identity functional proofs (not just grant/policy-existence checks) for `blocks`, `policy_acceptances`, `profiles` block-visibility, draft-listing visibility, `listing_images`/`listing_wants`, `saved_listings`, `search_events`. `phase6_trust_safety.sql` (the previously-missing Phase 6 pgTAP file) was also added — 83 assertions.
- **Auth rate limiting** — new migration `20261015000000_phase8_auth_rate_limiting.sql`: `email_send_attempts`/`login_attempts` tables (RLS enabled, zero policies — deny-all) + `check_and_log_email_send`/`check_login_rate_limit`/`record_login_attempt` RPCs (5/hour email sends, 5 failures/15min login lockout, email-only key). Wired into `lib/auth/actions.ts`'s `sendOtp`, `sendPasswordReset`, `signInWithPassword`. `phase8_auth_helpers.sql` extended 5→26 assertions.
- **reset-password session guard** — `app/(auth)/reset-password/page.tsx` now checks for a valid recovery session on mount (`getSession()` + `onAuthStateChange('PASSWORD_RECOVERY')`) before rendering the form; shows an expired-link `EmptyState` otherwise.
- **Error boundaries** — `app/error.tsx`, `app/not-found.tsx` (both `EmptyState`-styled), `app/global-error.tsx` (self-contained `<html>`/`<body>`, inline hex — same approved exception as the OG route).
- **Security headers** — `middleware.ts` now sets CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` on every response. **Deviated from the original plan**: a nonce-based `script-src` was tried first (Next's documented App Router pattern), but a real `next build && next start` showed Next's own RSC-streaming inline scripts ship with no `nonce` attribute in this Next.js version — verified by inspecting actual response HTML, not assumed. Shipped `script-src 'self' 'unsafe-inline'` instead, the same accepted trade-off already required for `style-src`. Headers were verified present and correctly formed against a real production server on a scratch port.
- **SW registration externalized** — moved out of `app/layout.tsx`'s inline `<script>` into `app/ServiceWorkerRegistration.tsx` (a normal bundled client component), so `script-src` doesn't need to special-case it.

### Area 2 — E2E happy-path coverage

- `e2e/happy-path.spec.ts` — full journey: real signup via a new `signUpNewUser()` helper (`e2e/helpers/auth.ts`) → 6-step onboarding wizard → post a swap listing via the real `/post` UI → fixture user offers → counter → counter → accept → deal room (propose meetup → confirm → live chat → both mark swapped) → completion asserted at the DB level. **Not executed** — no dev server / local Supabase stack in this environment. Written by close reading of the onboarding wizard's source and mirroring the exact selector patterns already proven in `post-flow.spec.ts`, `offer-negotiation.spec.ts`, and `deal-room.spec.ts`, but this is the least-verified piece of the whole batch — run it first when picking this back up.

### Area 3 — Accessibility & performance pass

- **Focus rings** — removed `outline-none` from the 3 inputs in `app/(app)/hanap/PostHanapSheet.tsx` that were defeating the existing global crimson `:focus-visible` rule. Confirmed via repo-wide grep this was the only offender.
- **Reduced motion** — global `@media (prefers-reduced-motion: reduce)` rule in `app/globals.css` (also neutralizes `BalanceBeam`'s inline CSS transition via the `!important` cascade). New `app/MotionProvider.tsx` wraps the app in framer-motion's `<MotionConfig reducedMotion="user">` for `Sheet.tsx`'s JS-driven spring animations, which the CSS rule can't reach.
- **`loading.tsx` boundaries** — `app/(app)/loading.tsx` (generic — it's the fallback for every route under `(app)` that lacks its own, not just `/`, so it's deliberately unlabeled rather than saying "Feed" while navigating to `/profile`), `app/(app)/hanap/loading.tsx`, `app/(app)/l/[code]/loading.tsx` (new skeleton shape).
- **PWA icons** — rasterized the existing SVG source with `sharp` into `icon-192.png`, `icon-512.png`, a new padded `icon-512-maskable.svg`/`.png` (safe-zone-scaled per W3C maskable guidance), and `apple-touch-icon.png` (180×180). Fixed a real bug: `app/layout.tsx` was pointing `apple-touch-icon` at an SVG, which Safari doesn't support at all — "Add to Home Screen" was silently broken on iOS.

### Area 4 — Legal pages + account deletion

- New `app/legal/` route segment: `privacy/`, `terms/`, `house-rules/` pages, shared `LegalFooterNote.tsx` (admin-contact placeholder + crest-clearance TODO + legal-review disclaimer, single source so it can't drift across pages). `house-rules/page.tsx` renders `HOUSE_RULES_V1` directly — no copy duplication. Linked from the login footer, the onboarding house-rules step, and a new `LegalSection` on the profile page. `/legal` added to `middleware.ts`'s `PUBLIC_PATHS`.
- **Self-serve account deletion** — `lib/account/actions.ts`'s `deleteAccount()` (service-role `admin.deleteUser()`, guarded by being a `'use server'`-only function — the service-role key is never bundled to the client). UI: "Delete my account" + `Sheet` confirmation in `LegalSection.tsx`.
- **Real bug found and fixed during this work**: four columns referenced `profiles` without `on delete cascade` — `meetups.proposed_by`, `offer_cancellations.cancelled_by`, `reports.resolved_by`, `audit_log.actor_id`. Without a fix, `admin.deleteUser()` would have failed with a foreign-key violation for any user who ever proposed a meetup, cancelled a deal, resolved a report, or triggered an audit-log entry — a large fraction of active users, silently breaking the entire delete-account feature for them. Fixed in a new migration, `20261020000000_phase8_deletable_profiles.sql` (switches those four to `ON DELETE SET NULL` — the historical row survives, just anonymized). New pgTAP file `phase8_deletable_profiles.sql` (6 assertions) proves the fix: a full `auth.users` deletion with all four history rows attached now succeeds and each survives with its actor column nulled. `types/database.ts` updated to match the new nullability.

---

## Verification status

| Check                                                          | Status                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run type-check`                                           | ✅ Clean                                                               |
| `npm run lint`                                                 | ✅ Clean, 0 warnings                                                   |
| `npm run test` (unit)                                          | ✅ 112/112 passing                                                     |
| `npm run build`                                                | ✅ Clean production build                                              |
| Security headers on a real build                               | ✅ Verified via `next build && next start` on a scratch port + `curl`  |
| `supabase test db` (all pgTAP, incl. new phase1/2/3/6/8 files) | ❌ Not run — no Docker in this environment                             |
| `npm run test:e2e` (incl. new `happy-path.spec.ts`)            | ❌ Not run — no dev server / local Supabase stack in this environment  |
| Manifest/icons in a real browser (Add to Home Screen)          | ❌ Not run — no browser available in this environment                  |
| Reduced-motion at the OS level                                 | ❌ Not run                                                             |
| Account deletion end-to-end against a real project             | ❌ Not run — do this against local/staging only, never production data |

## Before merging

1. `supabase start && supabase db reset && supabase test db` — expect **all** pgTAP files to pass, including the newly-bumped plan counts in phase1/2/3 and the new phase6/phase8 files.
2. `npm run test:e2e` — run `happy-path.spec.ts` in isolation first (`npx playwright test e2e/happy-path.spec.ts`) since it's the newest and least-proven spec.
3. `npm run build && npm start`, then check DevTools Network tab for CSP violations and confirm the service worker still registers.
4. Confirm whether `supabase/config.toml`'s `[auth.rate_limit]` block is actually applied on the **hosted** project (not just local dev) — the new app-level throttle supplements it either way, but worth knowing.
5. Fill in the `[ADMIN CONTACT — TODO...]` placeholders across the three `/legal` pages and `LegalSection.tsx` before launch, and get the university's crest-usage clearance (still flagged with TODO comments, not built around).
