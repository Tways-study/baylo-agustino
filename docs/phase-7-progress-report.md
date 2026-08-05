# Phase 7 — Social Layer Progress Report

**Status:** Implementation complete, pushed to `main`. Pending: migration applied to remote + pgTAP verification.

**Last commit:** `d2b24fb` — feat: Phase 7 social layer

---

## What was built

### Database (`supabase/migrations/20261001000000_phase7_social.sql`)

- `public.wants` table with GIN tsvector index and `status='open'` RLS
- `public.follows` table (composite PK, self-follow check constraint)
- `public.pulse_stats` materialized view refreshed nightly by pg_cron at 16:00 UTC (midnight Manila)
- `notifications.want_id` column added; `notifications_kind_check` expanded to include `hanap_match`
- RPCs: `post_want`, `close_want`, `follow_user`, `unfollow_user` — all SECURITY DEFINER, `set search_path=''`, `revoke from anon`
- Trigger `tr_listings_notify_hanap_matches`: fires AFTER INSERT on listings when `status='active'`; inserts `hanap_match` notifications for open-want owners whose `search_tsv` matches the new listing title via `websearch_to_tsquery`; skips self-notification

### Application code

| File                                   | What it does                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `app/(app)/hanap/page.tsx`             | Server component — lists open wants                                                   |
| `app/(app)/hanap/HanapClientShell.tsx` | Manages sheet open state                                                              |
| `app/(app)/hanap/PostHanapSheet.tsx`   | Form sheet calling `postWant` server action                                           |
| `app/(app)/PulseStrip.tsx`             | Compact campus-stats row above SearchBar on home feed                                 |
| `app/(app)/FollowingSection.tsx`       | Horizontal Chit strip of listings from followed sellers                               |
| `app/(app)/l/[code]/ShareButton.tsx`   | Web Share API with clipboard fallback                                                 |
| `app/api/og/[code]/route.tsx`          | Edge route — 1080×1920 OG image via `next/og` (Satori)                                |
| `components/ui/FollowButton.tsx`       | Optimistic follow/unfollow toggle on listing detail                                   |
| `lib/wants/schemas.ts`                 | Zod schema for `postWant`                                                             |
| `lib/wants/actions.ts`                 | `postWant`, `closeWant` server actions                                                |
| `lib/wants/queries.ts`                 | `getOpenWants`, `getMyWants`                                                          |
| `lib/social/actions.ts`                | `followUser`, `unfollowUser` server actions                                           |
| `lib/discovery/queries.ts`             | Added `getFollowingFeedListings`, `isFollowing`, `getPulseStats`                      |
| `types/database.ts`                    | `WantRow`, `FollowRow`, `PulseStatsRow`; updated `NotificationRow`/`NotificationKind` |
| `components/ui/NotificationBell.tsx`   | `hanap_match` kind copy + `notificationHref` routing                                  |
| `components/ui/BottomNav.tsx`          | `/browse` → `/hanap`                                                                  |

### Tests (`supabase/tests/phase7_social_rls.sql`)

28 pgTAP assertions covering:

- `authenticated` blocked from direct INSERT/UPDATE/DELETE on `wants` and `follows`
- All 4 RPCs callable by `authenticated`, blocked for `anon`
- `pulse_stats` matview SELECT accessible to `authenticated`
- Wants RLS: open want visible, closed want hidden, third-party close blocked, owner close succeeds
- Follows RPC: follow works, self-follow blocked, unfollow removes row
- `hanap_match` trigger: matching listing notifies want owner; non-matching adds nothing; self-listing skips self-notification

---

## What still needs to happen before Phase 7 is closed

1. **Apply migration to remote**

   ```bash
   supabase db push --project-ref ybmzsqgfruttvqavfhsx
   ```

   Or via MCP: `mcp__supabase__apply_migration` with the contents of `20261001000000_phase7_social.sql`.

2. **Run pgTAP against local stack**

   ```bash
   supabase start
   supabase db reset   # applies all migrations + seed.sql
   supabase test db    # runs all supabase/tests/*.sql
   ```

   Expect: all 28 phase7 assertions pass alongside earlier phases.

3. **Type-check**

   ```bash
   npm run type-check
   ```

4. **Manual smoke test** (against remote or local dev server)
   - Post a Hanap → appears in `/hanap`
   - Post a matching listing → `notifications` table gets a `hanap_match` row
   - Follow a seller → their listings appear in "FROM PEOPLE YOU FOLLOW" strip on home
   - Visit `/api/og/BA-XXXX` → 1080×1920 PNG renders with branded chit design
   - Share button on listing detail → Web Share sheet opens (or clipboard fallback)

---

## Known notes / gotchas

- **OG route**: uses hardcoded hex colors (approved exception — Satori cannot resolve CSS variables). The `C` constant at the top of `app/api/og/[code]/route.tsx` is the only place in the codebase where raw hex values are permitted.
- **`notifications.offer_id`**: was made nullable in Phase 6. `hanap_match` notifications leave `offer_id` null and set `listing_id` + `want_id` instead. `NotificationBell` routes `hanap_match` to `/` (the feed) because `listing_id` is a UUID, not a code slug.
- **pg_cron schedule**: `refresh-pulse-stats` runs at UTC 16:00 = Manila midnight. The view is pre-seeded with one row at migration time so it is never empty.
- **`pulse_stats` concurrent refresh**: the migration uses a non-concurrent initial `refresh materialized view` (concurrent requires a unique index which the view doesn't have). Nightly cron also uses non-concurrent refresh for the same reason.
- **`complete_onboarding` RPC**: Phase 6 replaced the 5-arg signature with a 4-arg one (reads `policy_version` from `app_settings`). The client call in `lib/auth/actions.ts` was fixed in this session — the stale `p_policy_version` argument has been removed.

---

## Next phase

**Phase 8 — Hardening & Launch.** Full spec in `baylo-agustino-build-spec.md`.
