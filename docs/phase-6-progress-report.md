# Phase 6 (Trust & Safety) — Progress Report

_As of 2026-08-04_

## Status: paused mid-Task 1 fix loop, 1 of 18 plan tasks landed (with open findings)

## Where things live

- **Design spec:** `docs/superpowers/specs/2026-08-04-phase-6-trust-safety-design.md` (approved, committed)
- **Implementation plan:** `docs/superpowers/plans/2026-08-04-phase-6-trust-safety.md` (18 tasks, approved, committed)
- **Worktree:** `.worktrees/phase-6-trust-safety` on branch `phase-6-trust-safety`, pushed to `origin/phase-6-trust-safety`
- **SDD ledger/workspace:** `.worktrees/phase-6-trust-safety/.superpowers/sdd/2026-08-04-phase-6-trust-safety/` (gitignored — briefs, reports, review packages for this run)
- **`main`** is up to date with `origin/main` (pushed), currently at the plan+spec commit — no Phase 6 code has merged to `main` yet.

## What's done

**Task 1 — Database migration** (`supabase/migrations/20260917000000_phase6_trust_safety.sql`, commit `02a6d65` on `phase-6-trust-safety`):

- New tables: `reviews`, `user_roles`, `reports`, `audit_log`, `app_settings`
- `profiles.review_count` added
- `notifications` extended (`offer_id` now nullable, new `listing_id`/`reason` columns, widened `kind` check for `listing_removed`/`account_suspended`)
- New RPCs: `is_admin`, `submit_review`, `submit_report`, `admin_take_down_listing`, `admin_suspend_user`, `admin_unsuspend_user`, `admin_dismiss_report`, `admin_upsert_meetup_spot`, `admin_bump_policy_version`
- `complete_onboarding` corrected to a 4-arg signature reading `policy_version` from `app_settings` instead of a client-supplied argument; old 5-arg overload explicitly dropped
- **Applied live** to the linked hosted Supabase project ("Baylo Agustino") and verified: RPC count check, single `complete_onboarding` overload confirmed, `e2e-fixture-3` granted admin via `user_roles`
- A real bug was caught and fixed during this task: `is_admin()` (a `language sql` function) originally referenced `user_roles` before that table was created in the migration — `language sql` functions are validated against the catalog at `CREATE FUNCTION` time (unlike `plpgsql`), so the first push attempt failed. Fixed by reordering; the plan doc was updated to match.

## What's open (blocking Task 1 completion)

The task reviewer found **2 Important findings**, both real, verified violations of this project's own stated security constraints — not yet fixed on disk:

1. **`complete_onboarding` is missing the `auth.uid() is null` guard** that every other `SECURITY DEFINER` function in this migration has. Not currently exploitable (a null `auth.uid()` just hits a NOT NULL PK violation on insert), but it's the exact bug class ("NULL-swallowing auth check") that has shipped live twice already in this project, so the plan treats it as non-negotiable.
2. **`submit_review` relies solely on the DB's `unique (offer_id, reviewer_id)` constraint** to block duplicate reviews, rather than an explicit inline check — contradicting the plan's own Global Constraint that this must be "enforced inside `submit_review`, not just by the DB constraint." (Functionally it still blocks duplicates; the gap is a raw Postgres error message instead of a controlled one.)

A fix-round was dispatched to the original Task 1 implementer agent with exact SQL for both fixes, plus a matching one-line update to Task 2's not-yet-written pgTAP test (which currently expects the old raw `%duplicate key%` message and needs to expect `%already reviewed%` instead once the inline check ships). **That agent run failed mid-response with a connection error before writing anything to disk** — the worktree is still exactly at commit `02a6d65`, nothing lost, nothing corrupted. The fix has not yet been re-attempted.

## What's not started

Tasks 2–18 of the plan (pgTAP tests, types, `lib/trust/stamps.ts`, Zod schemas, queries, Server Actions, middleware admin guard, shared component fixes, `ReviewPrompt`, `ReportSheet`, Ako stamps display, the 3-page `/admin` console, E2E reviews + admin-moderation specs, `CLAUDE.md` reconciliation) — none dispatched yet.

## Next step when resuming

Re-dispatch (or resume) the Task 1 implementer with the same fix instructions — `complete_onboarding`'s missing auth guard, `submit_review`'s missing inline duplicate check, and the matching plan-doc test-message edit — then re-review, then continue to Task 2 and onward per the plan's task order.
