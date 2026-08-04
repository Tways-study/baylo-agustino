# Phase 6 — Trust & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the honest students visible — post-completion reviews, derived trust scoring, earned stamps, a report flow, and the app's first admin surface with a full audit trail.

**Architecture:** `trust_score`/`show_up_rate`/`review_count` are recomputed directly inside `submit_review` (no separate trigger). Stamps are computed at read time from those three numbers against fixed thresholds — no stamp storage. Admin access is a `user_roles` table checked in `middleware.ts`, the same layered-guard pattern already used for onboarding/suspension. Every `admin_*` RPC writes its own `audit_log` row in the same transaction as its action. `policy_version` moves from a hardcoded constant to a single-row `app_settings` table, read server-side only. All new RPCs ship with the explicit `auth.uid() is null` guard and `anon`/`public` EXECUTE revokes from the start — the auth-bypass class found and fixed twice in Phase 4/5 is guarded against here from day one, not retrofitted.

**Tech Stack:** Next.js 15 Server Components/Actions, Supabase (Postgres RLS), Zod, TypeScript strict.

**Design spec:** `docs/superpowers/specs/2026-08-04-phase-6-trust-safety-design.md` — read this first if anything below is ambiguous; it's the source of the six scope decisions this plan implements (independent trust signals, bidirectional one-shot reviews, stamp sample-size gating, `user_roles`-table admin access, DB-backed policy version, explicit report status).

## Global Constraints

- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully qualified identifiers, an explicit `if auth.uid() is null then raise exception 'Not authenticated.'; end if;` guard as its first statement, and `revoke execute ... from public; revoke execute ... from anon;` after its grant — no exceptions, this is non-negotiable given this exact bug class has shipped twice already in this codebase.
- RLS enabled at table creation, in the same migration file that creates the table.
- `trust_score` = average `reviews.rating` for a reviewee. `show_up_rate` = fraction of that reviewee's reviews with `showed_up = true`. Both recomputed directly inside `submit_review`, not via a trigger. Phase 5's `offer_cancellations.was_late` is NOT consumed by this phase.
- Reviews: one per `(offer_id, reviewer_id)`, only for `'completed'` offers, only between the offer's two actual parties, reviewer ≠ reviewee.
- Stamps (`lib/trust/stamps.ts`): `first_baylo` = `completed_deals >= 1`; `ten_baylos` = `completed_deals >= 10`; `fair_trader` = `trust_score >= 4.0 && review_count >= 3`; `always_on_time` = `show_up_rate >= 0.9 && review_count >= 3`. Pure function, no DB access.
- Admin check: `is_admin(uuid)` `SECURITY DEFINER` SQL helper (mirrors Phase 1's `is_blocked_by` pattern), used inside every `admin_*` RPC and in RLS policies that need it.
- `reports.target_id` has no FK constraint (polymorphic across `listings`/`profiles`/`messages`) — existence validated inside `submit_report` itself.
- `policy_version` lives in `app_settings` (single-row table, `id boolean primary key default true check (id)`). `lib/auth/house-rules.ts` keeps the rules _text_; the `POLICY_VERSION` numeric export is removed. `complete_onboarding` reads the current version from `app_settings` internally — it no longer takes `p_policy_version` as a parameter, and the old 5-arg overload must be explicitly dropped (`create or replace function` with a different arg list creates a new overload, it does not replace the old one — this exact trap already bit this codebase once in Phase 4's history).
- No `any` anywhere — ESLint enforces this with zero tolerance.
- Zod schemas live per domain: `lib/trust/schemas.ts`, `lib/reports/schemas.ts`, `lib/admin/schemas.ts`.

## File Map

| File                                                         | Action | Purpose                                                                                                                                                                      |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260917000000_phase6_trust_safety.sql` | Create | `reviews`, `user_roles`, `reports`, `audit_log`, `app_settings`, `profiles.review_count`, `notifications` extension, all RPCs, `complete_onboarding` fix + old-overload drop |
| `supabase/seed.sql`                                          | Modify | Grant `e2e-fixture-3` admin role for local dev parity                                                                                                                        |
| `supabase/tests/phase6_trust_safety_rls.sql`                 | Create | pgTAP: privileges, review computation, admin RPC gating, feed suspension filter, report validation                                                                           |
| `types/database.ts`                                          | Modify | New tables/RPCs; `complete_onboarding` signature change; `NotificationKind`/`profiles.review_count`                                                                          |
| `lib/trust/stamps.ts`                                        | Create | Pure `earnedStamps()` — threshold mapping                                                                                                                                    |
| `lib/trust/stamps.test.ts`                                   | Create | Full threshold/boundary table                                                                                                                                                |
| `lib/trust/schemas.ts`                                       | Create | Zod for `submit_review`                                                                                                                                                      |
| `lib/trust/queries.ts`                                       | Create | `getProfileTrustStats`, `hasReviewed`                                                                                                                                        |
| `lib/trust/actions.ts`                                       | Create | Server Action: `submitReview`                                                                                                                                                |
| `lib/reports/schemas.ts`                                     | Create | Zod for `submit_report`                                                                                                                                                      |
| `lib/reports/actions.ts`                                     | Create | Server Action: `submitReport`                                                                                                                                                |
| `lib/admin/schemas.ts`                                       | Create | Zod for all `admin_*` inputs                                                                                                                                                 |
| `lib/admin/queries.ts`                                       | Create | `isAdmin`, `getOpenReports`, `getAllUsersForAdmin`                                                                                                                           |
| `lib/admin/actions.ts`                                       | Create | Server Actions: takedown, suspend/unsuspend, dismiss report, upsert meetup spot, bump policy version                                                                         |
| `lib/auth/house-rules.ts`                                    | Modify | Remove `POLICY_VERSION` export                                                                                                                                               |
| `lib/auth/actions.ts`                                        | Modify | `completeOnboarding` stops passing `p_policy_version`                                                                                                                        |
| `middleware.ts`                                              | Modify | `/admin` route guard                                                                                                                                                         |
| `lib/discovery/queries.ts`                                   | Modify | Feed excludes suspended owners' listings                                                                                                                                     |
| `components/ui/NotificationBell.tsx`                         | Modify | Routing fix for the 2 new notification kinds + their copy                                                                                                                    |
| `components/ui/index.ts`                                     | Modify | Export new components                                                                                                                                                        |
| `components/ui/ReportSheet.tsx`                              | Create | Reusable report-reason sheet (listing/profile/message)                                                                                                                       |
| `app/(app)/deals/[id]/ReviewPrompt.tsx`                      | Create | One-time post-completion review sheet                                                                                                                                        |
| `app/(app)/deals/[id]/OfferThread.tsx`                       | Modify | Wire in `ReviewPrompt`                                                                                                                                                       |
| `app/(app)/deals/[id]/page.tsx`                              | Modify | Fetch `hasReviewed`, pass to `OfferThread`                                                                                                                                   |
| `app/(app)/deals/[id]/DealChat.tsx`                          | Modify | Per-message "Report" affordance                                                                                                                                              |
| `app/(app)/l/[code]/page.tsx`                                | Modify | Report entry points (listing + owner)                                                                                                                                        |
| `app/(app)/ako/page.tsx`                                     | Modify | Trust stats + earned stamps row                                                                                                                                              |
| `app/(admin)/layout.tsx`                                     | Create | Thin layout wrapper for the admin route group                                                                                                                                |
| `app/(admin)/admin/page.tsx`                                 | Create | Report queue + policy-version bump                                                                                                                                           |
| `app/(admin)/admin/ReportQueue.tsx`                          | Create | Client component: report list, dismiss/action buttons                                                                                                                        |
| `app/(admin)/admin/users/page.tsx`                           | Create | User search + suspend/unsuspend                                                                                                                                              |
| `app/(admin)/admin/users/UserSearch.tsx`                     | Create | Client component                                                                                                                                                             |
| `app/(admin)/admin/meetup-spots/page.tsx`                    | Create | Meetup spot list + create/edit form                                                                                                                                          |
| `app/(admin)/admin/meetup-spots/MeetupSpotForm.tsx`          | Create | Client component                                                                                                                                                             |
| `e2e/helpers/fixtures.ts`                                    | Modify | Add `createFixtureCompletedOffer()`                                                                                                                                          |
| `e2e/reviews.spec.ts`                                        | Create | Full review flow + stamp threshold                                                                                                                                           |
| `e2e/admin-moderation.spec.ts`                               | Create | Report → dismiss; report → takedown; suspend                                                                                                                                 |
| `CLAUDE.md`                                                  | Modify | Phase table → Phase 6 current                                                                                                                                                |

---

## Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260917000000_phase6_trust_safety.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Produces: tables `reviews`, `user_roles`, `reports`, `audit_log`, `app_settings`; `profiles.review_count`; `notifications.listing_id`/`notifications.reason` (nullable `offer_id`); RPCs `is_admin(uuid)`, `submit_review`, `submit_report`, `admin_take_down_listing`, `admin_suspend_user`, `admin_unsuspend_user`, `admin_dismiss_report`, `admin_upsert_meetup_spot`, `admin_bump_policy_version`; corrected `complete_onboarding(text,text,smallint,text)` (4-arg, old 5-arg dropped).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260917000000_phase6_trust_safety.sql
-- Phase 6: trust & safety — reviews, derived trust scoring, reports, admin
-- console, audit log. All tables ship with RLS enabled in this same file,
-- per project convention. Every new RPC gets an explicit auth.uid() is null
-- guard and anon/public EXECUTE revokes from the start — this bug class
-- (a NULL-swallowing `if x <> auth.uid()` check combined with a missing
-- anon revoke) has shipped live in this codebase twice already (Phase 4,
-- then Phase 5's own new RPCs), so it is not being risked a third time.

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
alter table public.reviews enable row level security;
revoke insert, update, delete on public.reviews from authenticated;

create policy "reviews are public"
  on public.reviews for select
  using (true);

-- ═══ profiles: derived review_count ═══
alter table public.profiles add column review_count integer not null default 0;

-- ═══ user_roles ═══
create table public.user_roles (
  user_id uuid not null references public.profiles on delete cascade,
  role    text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.user_roles enable row level security;
revoke insert, update, delete on public.user_roles from authenticated;

-- ═══ is_admin — SECURITY DEFINER so it can see user_roles regardless of
-- the caller's own RLS visibility (mirrors is_blocked_by's precedent:
-- a raw `exists (select ... from user_roles ...)` inside another table's
-- policy would itself be subject to user_roles' restrictive RLS and
-- silently evaluate false for non-admins). Must be created after
-- user_roles: language sql functions are parsed against the catalog at
-- CREATE FUNCTION time (unlike plpgsql), so the referenced table must
-- already exist. ═══
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  )
$$;
grant execute on function public.is_admin(uuid) to authenticated;
revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.is_admin(uuid) from anon;

create policy "admins can see role assignments"
  on public.user_roles for select
  using (public.is_admin(auth.uid()));

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
alter table public.reports enable row level security;
revoke insert, update, delete on public.reports from authenticated;

create policy "admins see all reports, reporters see their own"
  on public.reports for select
  using (public.is_admin(auth.uid()) or reporter_id = auth.uid());

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
alter table public.audit_log enable row level security;
revoke insert, update, delete on public.audit_log from authenticated;

create policy "admins see the audit log"
  on public.audit_log for select
  using (public.is_admin(auth.uid()));

-- ═══ app_settings — single-row config ═══
create table public.app_settings (
  id boolean primary key default true check (id),
  policy_version integer not null default 1
);
insert into public.app_settings (policy_version) values (1);
alter table public.app_settings enable row level security;
revoke insert, update, delete on public.app_settings from authenticated;

create policy "app settings are public"
  on public.app_settings for select
  using (true);

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

-- ═══ submit_review ═══
create or replace function public.submit_review(
  p_offer_id uuid,
  p_reviewee_id uuid,
  p_rating smallint,
  p_showed_up boolean,
  p_comment text
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
  v_other_party uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;

  select from_user_id, to_user_id, status into v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'completed' then
    raise exception 'You can only review a completed deal.';
  end if;

  v_other_party := case when v_caller = v_from_user then v_to_user else v_from_user end;
  if p_reviewee_id <> v_other_party then
    raise exception 'You can only review the other party to this deal.';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  insert into public.reviews (offer_id, reviewer_id, reviewee_id, rating, showed_up, comment)
  values (p_offer_id, v_caller, p_reviewee_id, p_rating, p_showed_up, nullif(p_comment, ''));

  update public.profiles set
    trust_score = (select avg(rating)::numeric(3,2) from public.reviews where reviewee_id = p_reviewee_id),
    show_up_rate = (select avg(showed_up::int)::numeric(4,3) from public.reviews where reviewee_id = p_reviewee_id),
    review_count = (select count(*) from public.reviews where reviewee_id = p_reviewee_id)
  where id = p_reviewee_id;
end;
$$;

grant execute on function public.submit_review(uuid, uuid, smallint, boolean, text) to authenticated;
revoke execute on function public.submit_review(uuid, uuid, smallint, boolean, text) from public;
revoke execute on function public.submit_review(uuid, uuid, smallint, boolean, text) from anon;

-- ═══ submit_report ═══
create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
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
  v_recent_count integer;
  v_exists boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if p_target_type not in ('listing', 'profile', 'message') then
    raise exception 'Invalid report target.';
  end if;
  if p_reason_code not in ('banned_item', 'misleading', 'harassment', 'no_show_scam', 'spam', 'other') then
    raise exception 'Pick a valid report reason.';
  end if;

  select count(*) into v_recent_count
    from public.reports
    where reporter_id = v_caller and created_at > now() - interval '24 hours';
  if v_recent_count >= 10 then
    raise exception 'You have reached today''s limit of 10 reports. Try again tomorrow.';
  end if;

  if p_target_type = 'listing' then
    select exists (select 1 from public.listings where id = p_target_id) into v_exists;
  elsif p_target_type = 'profile' then
    select exists (select 1 from public.profiles where id = p_target_id) into v_exists;
  else
    select exists (select 1 from public.messages where id = p_target_id) into v_exists;
  end if;
  if not v_exists then
    raise exception 'Could not find what you''re trying to report.';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason_code, reason_text)
  values (v_caller, p_target_type, p_target_id, p_reason_code, nullif(p_reason_text, ''));
end;
$$;

grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
revoke execute on function public.submit_report(text, uuid, text, text) from public;
revoke execute on function public.submit_report(text, uuid, text, text) from anon;

-- ═══ admin_take_down_listing ═══
create or replace function public.admin_take_down_listing(
  p_listing_id uuid,
  p_reason text,
  p_report_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_admin(v_caller) then
    raise exception 'Admins only.';
  end if;

  select owner_id into v_owner_id from public.listings where id = p_listing_id;
  if v_owner_id is null then
    raise exception 'Listing not found.';
  end if;

  update public.listings set status = 'removed' where id = p_listing_id;

  insert into public.notifications (user_id, listing_id, kind, reason)
  values (v_owner_id, p_listing_id, 'listing_removed', p_reason);

  if p_report_id is not null then
    update public.reports
    set status = 'actioned', resolved_by = v_caller, resolved_at = now()
    where id = p_report_id;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (v_caller, 'listing_takedown', 'listing', p_listing_id, p_reason);
end;
$$;

grant execute on function public.admin_take_down_listing(uuid, text, uuid) to authenticated;
revoke execute on function public.admin_take_down_listing(uuid, text, uuid) from public;
revoke execute on function public.admin_take_down_listing(uuid, text, uuid) from anon;

-- ═══ admin_suspend_user / admin_unsuspend_user ═══
create or replace function public.admin_suspend_user(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_admin(v_caller) then
    raise exception 'Admins only.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  update public.profiles set is_suspended = true where id = p_user_id;

  insert into public.notifications (user_id, kind, reason)
  values (p_user_id, 'account_suspended', p_reason);

  if p_report_id is not null then
    update public.reports
    set status = 'actioned', resolved_by = v_caller, resolved_at = now()
    where id = p_report_id;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (v_caller, 'account_suspend', 'profile', p_user_id, p_reason);
end;
$$;

grant execute on function public.admin_suspend_user(uuid, text, uuid) to authenticated;
revoke execute on function public.admin_suspend_user(uuid, text, uuid) from public;
revoke execute on function public.admin_suspend_user(uuid, text, uuid) from anon;

create or replace function public.admin_unsuspend_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_admin(v_caller) then
    raise exception 'Admins only.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  update public.profiles set is_suspended = false where id = p_user_id;

  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (v_caller, 'account_unsuspend', 'profile', p_user_id, null);
end;
$$;

grant execute on function public.admin_unsuspend_user(uuid) to authenticated;
revoke execute on function public.admin_unsuspend_user(uuid) from public;
revoke execute on function public.admin_unsuspend_user(uuid) from anon;

-- ═══ admin_dismiss_report ═══
create or replace function public.admin_dismiss_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_admin(v_caller) then
    raise exception 'Admins only.';
  end if;
  if not exists (select 1 from public.reports where id = p_report_id) then
    raise exception 'Report not found.';
  end if;

  update public.reports
  set status = 'dismissed', resolved_by = v_caller, resolved_at = now()
  where id = p_report_id;

  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (v_caller, 'report_dismiss', 'report', p_report_id, null);
end;
$$;

grant execute on function public.admin_dismiss_report(uuid) to authenticated;
revoke execute on function public.admin_dismiss_report(uuid) from public;
revoke execute on function public.admin_dismiss_report(uuid) from anon;

-- ═══ admin_upsert_meetup_spot ═══
create or replace function public.admin_upsert_meetup_spot(
  p_id smallint,
  p_name text,
  p_hint text,
  p_is_camera_covered boolean,
  p_active boolean
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_id smallint;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_admin(v_caller) then
    raise exception 'Admins only.';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Name is required.';
  end if;

  if p_id is null then
    insert into public.meetup_spots (name, hint, is_camera_covered, active)
    values (p_name, nullif(p_hint, ''), coalesce(p_is_camera_covered, false), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.meetup_spots
    set name = p_name, hint = nullif(p_hint, ''),
        is_camera_covered = coalesce(p_is_camera_covered, false),
        active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Meetup spot not found.';
    end if;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (v_caller, case when p_id is null then 'meetup_spot_create' else 'meetup_spot_update' end,
          'meetup_spot', null, p_name);

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_meetup_spot(smallint, text, text, boolean, boolean) to authenticated;
revoke execute on function public.admin_upsert_meetup_spot(smallint, text, text, boolean, boolean) from public;
revoke execute on function public.admin_upsert_meetup_spot(smallint, text, text, boolean, boolean) from anon;

-- ═══ admin_bump_policy_version ═══
create or replace function public.admin_bump_policy_version()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_new_version integer;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.is_admin(v_caller) then
    raise exception 'Admins only.';
  end if;

  update public.app_settings set policy_version = policy_version + 1
  where id = true
  returning policy_version into v_new_version;

  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (v_caller, 'policy_version_bump', 'app_settings', null, 'bumped to ' || v_new_version);

  return v_new_version;
end;
$$;

grant execute on function public.admin_bump_policy_version() to authenticated;
revoke execute on function public.admin_bump_policy_version() from public;
revoke execute on function public.admin_bump_policy_version() from anon;

-- ═══ complete_onboarding: read policy_version from app_settings instead of
-- a client-supplied argument. This is a NEW overload (4 args, was 5) —
-- create or replace does NOT replace a function with a different argument
-- list, it adds a second one. The old 5-arg overload must be dropped
-- explicitly or both would coexist (the exact trap documented in this
-- project's Phase 4 migration history). ═══
create or replace function public.complete_onboarding(
  p_display_name text,
  p_program text,
  p_year_level smallint,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy_version integer;
begin
  select policy_version into v_policy_version from public.app_settings where id = true;

  insert into public.profiles (
    id, display_name, program, year_level, avatar_url, verified_at
  ) values (
    auth.uid(), p_display_name, p_program, p_year_level, p_avatar_url, now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    program = excluded.program,
    year_level = excluded.year_level,
    avatar_url = excluded.avatar_url,
    verified_at = coalesce(profiles.verified_at, now());

  insert into public.policy_acceptances (user_id, policy_version)
  values (auth.uid(), v_policy_version)
  on conflict (user_id, policy_version) do nothing;
end;
$$;

grant execute on function public.complete_onboarding(text, text, smallint, text) to authenticated;
revoke execute on function public.complete_onboarding(text, text, smallint, text) from public;
revoke execute on function public.complete_onboarding(text, text, smallint, text) from anon;

drop function if exists public.complete_onboarding(text, text, smallint, text, integer);
```

- [ ] **Step 2: Grant `e2e-fixture-3` admin for local dev**

Append to `supabase/seed.sql`:

```sql

-- ═══ e2e-fixture-3 gets admin — Phase 6 admin-moderation E2E tests act as
-- this user rather than seeding a fourth account. Not used as a
-- moderation target in those specs, so this doesn't create a conflict. ═══
insert into public.user_roles (user_id, role)
values ('55555555-5555-5555-5555-555555555555', 'admin');
```

- [ ] **Step 3: Push and verify live**

No local Docker in this environment — verify against the linked hosted project, same pattern as every migration so far.

```bash
npx supabase db push
npx supabase db query --linked "select proname from pg_proc where proname like 'admin_%' or proname in ('is_admin','submit_review','submit_report','complete_onboarding')" --output-format json
```

Expected: all new function names present, including exactly one `complete_onboarding` (confirm the old 5-arg overload is really gone: `select pg_get_function_arguments(oid) from pg_proc where proname = 'complete_onboarding'` should return exactly one row, 4 arguments).

Also grant `e2e-fixture-3` admin **live**, the same way earlier phases live-seeded fixture data (get human approval first, same precedent as every other live-DB write in this project's history):

```bash
npx supabase db query --linked "insert into public.user_roles (user_id, role) values ('55555555-5555-5555-5555-555555555555', 'admin') on conflict do nothing"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260917000000_phase6_trust_safety.sql supabase/seed.sql
git commit -m "feat: Phase 6 database migration — reviews, user_roles, reports, audit_log, app_settings, admin RPCs"
```

---

## Task 2: pgTAP tests

**Files:**

- Create: `supabase/tests/phase6_trust_safety_rls.sql`

**Interfaces:**

- Consumes: Task 1's schema/RPCs; `supabase/seed.sql` profiles `11111111-...`, `22222222-...`, `44444444-...` (admin: `55555555-...`); unseeded third-party UUID `33333333-...`.

- [ ] **Step 1: Write the test file**

```sql
-- supabase/tests/phase6_trust_safety_rls.sql
begin;
select plan(34);

-- ═══ fixtures — a completed offer between two seed profiles ═══
insert into public.listings (id, code, owner_id, intent, title, status, ask_centavos)
values
  ('88888888-8888-8888-8888-888888888a01'::uuid, 'BA-9301',
   '22222222-2222-2222-2222-222222222222'::uuid, 'give', 'Fixture listing for trust & safety', 'completed', null);

insert into public.offers (
  id, listing_id, root_offer_id, from_user_id, to_user_id,
  cash_centavos, cash_direction, status
) values (
  '99999999-9999-9999-9999-999999999a01'::uuid,
  '88888888-8888-8888-8888-888888888a01'::uuid,
  '99999999-9999-9999-9999-999999999a01'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  0, 'from_offerer', 'completed'
);

-- A second, pending listing/offer to exercise takedown/report against.
insert into public.listings (id, code, owner_id, intent, title, status, ask_centavos)
values
  ('88888888-8888-8888-8888-888888888a02'::uuid, 'BA-9302',
   '44444444-4444-4444-4444-444444444444'::uuid, 'sale', 'Reportable fixture listing', 'active', 5000);

-- ═══ privileges ═══
select ok(not has_table_privilege('authenticated', 'public.reviews', 'INSERT'), 'authenticated cannot INSERT reviews directly');
select ok(not has_table_privilege('authenticated', 'public.reports', 'INSERT'), 'authenticated cannot INSERT reports directly');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'INSERT'), 'authenticated cannot INSERT user_roles directly');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'), 'authenticated cannot INSERT audit_log directly');
select ok(not has_table_privilege('authenticated', 'public.app_settings', 'UPDATE'), 'authenticated cannot UPDATE app_settings directly');
select ok(has_function_privilege('authenticated', 'public.submit_review(uuid, uuid, smallint, boolean, text)', 'EXECUTE'), 'authenticated can call submit_review');
select ok(has_function_privilege('authenticated', 'public.submit_report(text, uuid, text, text)', 'EXECUTE'), 'authenticated can call submit_report');
select ok(not has_function_privilege('anon', 'public.submit_review(uuid, uuid, smallint, boolean, text)', 'EXECUTE'), 'anon cannot call submit_review');
select ok(not has_function_privilege('anon', 'public.admin_take_down_listing(uuid, text, uuid)', 'EXECUTE'), 'anon cannot call admin_take_down_listing');
select ok(not has_function_privilege('anon', 'public.admin_suspend_user(uuid, text, uuid)', 'EXECUTE'), 'anon cannot call admin_suspend_user');
select ok(not has_function_privilege('anon', 'public.admin_dismiss_report(uuid)', 'EXECUTE'), 'anon cannot call admin_dismiss_report');
select ok(not has_function_privilege('anon', 'public.admin_bump_policy_version()', 'EXECUTE'), 'anon cannot call admin_bump_policy_version');

-- ═══ functional: submit_review + derived trust fields ═══
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999a01'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 5, true, 'Great trade') $$,
  'a party can review the other party on a completed deal'
);
select is(
  (select trust_score from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  5.00,
  'trust_score is the average rating after the first review'
);
select is(
  (select show_up_rate from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  1.000,
  'show_up_rate is 1.0 after one showed_up=true review'
);
select is(
  (select review_count from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  1,
  'review_count increments'
);
select throws_like(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999a01'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 4, true, null) $$,
  '%duplicate key%',
  'a second review from the same reviewer on the same offer is rejected'
);
select throws_like(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999a01'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 3, false, null) $$,
  '%other party%',
  'reviewing yourself (wrong reviewee) is rejected'
);

-- ═══ functional RLS: third party cannot review ═══
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);
select throws_like(
  $$ select public.submit_review('99999999-9999-9999-9999-999999999a01'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 5, true, null) $$,
  '%not a party%',
  'a third party cannot review an offer they are not part of'
);

-- ═══ functional: submit_report ═══
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
select lives_ok(
  $$ select public.submit_report('listing', '88888888-8888-8888-8888-888888888a02'::uuid, 'misleading', 'not as described') $$,
  'a valid report against an existing listing succeeds'
);
select throws_like(
  $$ select public.submit_report('listing', gen_random_uuid(), 'spam', null) $$,
  '%Could not find%',
  'a report against a non-existent target is rejected'
);

-- ═══ functional RLS: reporter sees own report, third party does not ═══
select is(
  (select count(*)::int from public.reports where reporter_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'the reporter can see their own report'
);
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);
select is(
  (select count(*)::int from public.reports),
  0,
  'a non-admin, non-reporter cannot see any reports'
);

-- ═══ functional: admin RPCs rejected for non-admin ═══
select throws_like(
  $$ select public.admin_take_down_listing('88888888-8888-8888-8888-888888888a02'::uuid, 'test', null) $$,
  '%Admins only%',
  'a non-admin cannot take down a listing'
);
select throws_like(
  $$ select public.admin_suspend_user('44444444-4444-4444-4444-444444444444'::uuid, 'test', null) $$,
  '%Admins only%',
  'a non-admin cannot suspend a user'
);
select throws_like(
  $$ select public.admin_bump_policy_version() $$,
  '%Admins only%',
  'a non-admin cannot bump the policy version'
);

-- ═══ functional: admin RPCs succeed for an admin, write audit rows ═══
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555')::text, true);
select lives_ok(
  $$ select public.admin_take_down_listing('88888888-8888-8888-8888-888888888a02'::uuid, 'Banned item', null) $$,
  'an admin can take down a listing'
);
select is(
  (select status from public.listings where id = '88888888-8888-8888-8888-888888888a02'::uuid)::text,
  'removed',
  'the listing status flips to removed'
);
select is(
  (select count(*)::int from public.audit_log where action = 'listing_takedown' and target_id = '88888888-8888-8888-8888-888888888a02'::uuid),
  1,
  'the takedown wrote exactly one audit row'
);
select is(
  (select count(*)::int from public.notifications where kind = 'listing_removed' and listing_id = '88888888-8888-8888-8888-888888888a02'::uuid),
  1,
  'the owner was notified with the reason'
);

select lives_ok(
  $$ select public.admin_suspend_user('44444444-4444-4444-4444-444444444444'::uuid, 'No-show pattern', null) $$,
  'an admin can suspend a user'
);
select is(
  (select is_suspended from public.profiles where id = '44444444-4444-4444-4444-444444444444'::uuid),
  true,
  'the user is now suspended'
);
select is(
  (select count(*)::int from public.audit_log where action = 'account_suspend'),
  1,
  'the suspension wrote an audit row'
);

select lives_ok(
  $$ select public.admin_bump_policy_version() $$,
  'an admin can bump the policy version'
);
select is(
  (select policy_version from public.app_settings where id = true),
  2,
  'policy_version incremented from its seeded value of 1'
);

-- ═══ functional: feed excludes suspended owners (query-level, not RLS —
-- listings RLS itself already allows public read of active listings
-- regardless of owner suspension status; the exclusion lives in the
-- application's feed query, asserted here at the data level it depends on) ═══
select is(
  (select is_suspended from public.profiles where id = '44444444-4444-4444-4444-444444444444'::uuid),
  true,
  'sanity check the suspended flag the feed query filters on is really set'
);

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Verify live**

```bash
npx supabase db query --linked --file supabase/tests/phase6_trust_safety_rls.sql --output-format json
```

The tool only surfaces the last statement's resultset — use this project's established temp-table-capturing debug harness (wrap each `select <assertion>(...)` in `insert into a temp table`, `select string_agg(...)` once at the end, never committed) if you need full per-assertion visibility. Confirm all 34 assertions read `ok`, zero `not ok`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase6_trust_safety_rls.sql
git commit -m "test: Phase 6 pgTAP — privileges, review computation, admin RPC gating, takedown/suspend audit trail"
```

---

## Task 3: Types

**Files:**

- Modify: `types/database.ts`

**Interfaces:**

- Produces: `ReviewRow`, `UserRoleRow`, `ReportRow`, `AuditLogRow`, `AppSettingsRow` type aliases; `NotificationKind` extended with `'listing_removed'`, `'account_suspended'`; `profiles.review_count`; `notifications.offer_id` nullable + `listing_id`/`reason`; `complete_onboarding`'s `Args` shrink to 4 fields; new `Database['public']['Functions']` entries for all Task 1 RPCs.

- [ ] **Step 1: Extend `profiles`**

In `types/database.ts`, change the `profiles` table's `Row` and `Insert`:

```typescript
      profiles: {
        Row: {
          id: string
          display_name: string
          program: string | null
          year_level: number | null
          avatar_url: string | null
          bio: string | null
          verified_at: string | null
          trust_score: number
          show_up_rate: number | null
          completed_deals: number
          review_count: number
          is_suspended: boolean
          created_at: string
        }
        Insert: {
          id: string
          display_name: string
          program?: string | null
          year_level?: number | null
          avatar_url?: string | null
          bio?: string | null
          verified_at?: string | null
          trust_score?: number
          show_up_rate?: number | null
          completed_deals?: number
          review_count?: number
          is_suspended?: boolean
          created_at?: string
        }
```

(Leave `Update`/`Relationships` exactly as they are today — this task only adds `review_count` to `Row`/`Insert`.)

- [ ] **Step 2: Extend `notifications`**

```typescript
      notifications: {
        Row: {
          id: string
          user_id: string
          offer_id: string | null
          listing_id: string | null
          kind: NotificationKind
          reason: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          offer_id?: string | null
          listing_id?: string | null
          kind: NotificationKind
          reason?: string | null
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

- [ ] **Step 3: Add the 5 new table types**

Inside `Database['public']['Tables']`, after the `offer_cancellations` entry:

```typescript
      reviews: {
        Row: {
          id: string
          offer_id: string
          reviewer_id: string
          reviewee_id: string
          rating: number
          showed_up: boolean
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          offer_id: string
          reviewer_id: string
          reviewee_id: string
          rating: number
          showed_up: boolean
          comment?: string | null
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
      user_roles: {
        Row: {
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          user_id: string
          role: string
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
      reports: {
        Row: {
          id: string
          reporter_id: string
          target_type: string
          target_id: string
          reason_code: string
          reason_text: string | null
          status: string
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          reporter_id: string
          target_type: string
          target_id: string
          reason_code: string
          reason_text?: string | null
          status?: string
          resolved_by?: string | null
          resolved_at?: string | null
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
      audit_log: {
        Row: {
          id: string
          actor_id: string
          action: string
          target_type: string
          target_id: string | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          action: string
          target_type: string
          target_id?: string | null
          reason?: string | null
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
      app_settings: {
        Row: {
          id: boolean
          policy_version: number
        }
        Insert: {
          id?: boolean
          policy_version?: number
        }
        Update: {
          policy_version?: number
        }
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
```

- [ ] **Step 4: Update `complete_onboarding`'s Args and add the new RPC entries**

Replace the existing `complete_onboarding` entry:

```typescript
complete_onboarding: {
  Args: {
    p_display_name: string
    p_program: string | null
    p_year_level: number | null
    p_avatar_url: string | null
  }
  Returns: undefined
}
```

Add after the `cancel_deal` entry (the last one in `Functions`):

```typescript
is_admin: {
  Args: {
    p_user_id: string
  }
  Returns: boolean
}
submit_review: {
  Args: {
    p_offer_id: string
    p_reviewee_id: string
    p_rating: number
    p_showed_up: boolean
    p_comment: string | null
  }
  Returns: undefined
}
submit_report: {
  Args: {
    p_target_type: string
    p_target_id: string
    p_reason_code: string
    p_reason_text: string | null
  }
  Returns: undefined
}
admin_take_down_listing: {
  Args: {
    p_listing_id: string
    p_reason: string
    p_report_id: string | null
  }
  Returns: undefined
}
admin_suspend_user: {
  Args: {
    p_user_id: string
    p_reason: string
    p_report_id: string | null
  }
  Returns: undefined
}
admin_unsuspend_user: {
  Args: {
    p_user_id: string
  }
  Returns: undefined
}
admin_dismiss_report: {
  Args: {
    p_report_id: string
  }
  Returns: undefined
}
admin_upsert_meetup_spot: {
  Args: {
    p_id: number | null
    p_name: string
    p_hint: string | null
    p_is_camera_covered: boolean | null
    p_active: boolean | null
  }
  Returns: number
}
admin_bump_policy_version: {
  Args: Record<string, never>
  Returns: number
}
```

- [ ] **Step 5: Extend `NotificationKind` and add the 5 new row aliases**

Replace the `NotificationKind` union:

```typescript
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
  | 'listing_removed'
  | 'account_suspended'
```

After the existing `export type OfferCancellationRow = ...` line:

```typescript
export type ReviewRow = Database['public']['Tables']['reviews']['Row']
export type UserRoleRow = Database['public']['Tables']['user_roles']['Row']
export type ReportRow = Database['public']['Tables']['reports']['Row']
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row']
export type AppSettingsRow = Database['public']['Tables']['app_settings']['Row']
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors in `lib/auth/actions.ts` (still passes `p_policy_version`, fixed in Task 8) and `components/ui/NotificationBell.tsx` (its `KIND_COPY` Record is no longer exhaustive over `NotificationKind`, fixed in Task 9). No other files should error.

- [ ] **Step 7: Commit**

```bash
git add types/database.ts
git commit -m "feat: Phase 6 types — reviews/user_roles/reports/audit_log/app_settings, review_count, new notification kinds, complete_onboarding signature"
```

---

## Task 4: `lib/trust/stamps.ts`

**Files:**

- Create: `lib/trust/stamps.ts`
- Test: `lib/trust/stamps.test.ts`

**Interfaces:**

- Consumes: nothing (self-contained, own local types).
- Produces: `earnedStamps(input: StampInput): Stamp[]`, types `StampInput`, `Stamp`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/trust/stamps.test.ts
import { describe, expect, it } from 'vitest'
import { earnedStamps } from './stamps'

describe('earnedStamps', () => {
  it('no stamps for a brand-new profile', () => {
    expect(
      earnedStamps({ trust_score: 0, show_up_rate: null, completed_deals: 0, review_count: 0 }),
    ).toEqual([])
  })

  it('first_baylo at exactly 1 completed deal', () => {
    expect(
      earnedStamps({ trust_score: 0, show_up_rate: null, completed_deals: 1, review_count: 0 }),
    ).toEqual(['first_baylo'])
  })

  it('not yet ten_baylos at 9 completed deals', () => {
    const stamps = earnedStamps({
      trust_score: 0,
      show_up_rate: null,
      completed_deals: 9,
      review_count: 0,
    })
    expect(stamps).toContain('first_baylo')
    expect(stamps).not.toContain('ten_baylos')
  })

  it('ten_baylos at exactly 10 completed deals', () => {
    const stamps = earnedStamps({
      trust_score: 0,
      show_up_rate: null,
      completed_deals: 10,
      review_count: 0,
    })
    expect(stamps).toContain('first_baylo')
    expect(stamps).toContain('ten_baylos')
  })

  it('fair_trader requires trust_score >= 4.0 AND review_count >= 3', () => {
    expect(
      earnedStamps({ trust_score: 4.0, show_up_rate: null, completed_deals: 1, review_count: 2 }),
    ).not.toContain('fair_trader')
    expect(
      earnedStamps({ trust_score: 3.99, show_up_rate: null, completed_deals: 1, review_count: 3 }),
    ).not.toContain('fair_trader')
    expect(
      earnedStamps({ trust_score: 4.0, show_up_rate: null, completed_deals: 1, review_count: 3 }),
    ).toContain('fair_trader')
  })

  it('always_on_time requires show_up_rate >= 0.9 AND review_count >= 3', () => {
    expect(
      earnedStamps({ trust_score: 0, show_up_rate: 0.9, completed_deals: 1, review_count: 2 }),
    ).not.toContain('always_on_time')
    expect(
      earnedStamps({ trust_score: 0, show_up_rate: 0.89, completed_deals: 1, review_count: 3 }),
    ).not.toContain('always_on_time')
    expect(
      earnedStamps({ trust_score: 0, show_up_rate: 0.9, completed_deals: 1, review_count: 3 }),
    ).toContain('always_on_time')
  })

  it('always_on_time is never earned with a null show_up_rate', () => {
    expect(
      earnedStamps({ trust_score: 5, show_up_rate: null, completed_deals: 5, review_count: 5 }),
    ).not.toContain('always_on_time')
  })

  it('a highly active, well-reviewed profile earns all four', () => {
    const stamps = earnedStamps({
      trust_score: 4.8,
      show_up_rate: 0.95,
      completed_deals: 12,
      review_count: 10,
    })
    expect(stamps).toEqual(
      expect.arrayContaining(['first_baylo', 'ten_baylos', 'fair_trader', 'always_on_time']),
    )
    expect(stamps).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/trust/stamps.test.ts`
Expected: FAIL — `./stamps` module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/trust/stamps.ts
export interface StampInput {
  trust_score: number
  show_up_rate: number | null
  completed_deals: number
  review_count: number
}

export type Stamp = 'first_baylo' | 'ten_baylos' | 'fair_trader' | 'always_on_time'

const MIN_REVIEWS_FOR_RATE_STAMPS = 3
const FAIR_TRADER_THRESHOLD = 4.0
const ALWAYS_ON_TIME_THRESHOLD = 0.9

/**
 * Pure mapping from a profile's derived trust fields to which stamps it has
 * earned. first_baylo/ten_baylos are plain counts; fair_trader/
 * always_on_time additionally require a minimum sample size so a single
 * lucky or unlucky review can't swing a badge on or off.
 */
export function earnedStamps(input: StampInput): Stamp[] {
  const stamps: Stamp[] = []

  if (input.completed_deals >= 1) stamps.push('first_baylo')
  if (input.completed_deals >= 10) stamps.push('ten_baylos')
  if (input.review_count >= MIN_REVIEWS_FOR_RATE_STAMPS) {
    if (input.trust_score >= FAIR_TRADER_THRESHOLD) stamps.push('fair_trader')
    if (input.show_up_rate !== null && input.show_up_rate >= ALWAYS_ON_TIME_THRESHOLD) {
      stamps.push('always_on_time')
    }
  }

  return stamps
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/trust/stamps.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/trust/stamps.ts lib/trust/stamps.test.ts
git commit -m "feat: Phase 6 earned stamps — pure threshold mapping"
```

---

## Task 5: Zod schemas

**Files:**

- Create: `lib/trust/schemas.ts`
- Create: `lib/reports/schemas.ts`
- Create: `lib/admin/schemas.ts`

**Interfaces:**

- Produces: `submitReviewSchema`/`SubmitReviewInput`; `submitReportSchema`/`SubmitReportInput`, `reportTargetTypeSchema`, `reportReasonCodeSchema`; `takeDownListingSchema`, `suspendUserSchema`, `unsuspendUserSchema`, `dismissReportSchema`, `upsertMeetupSpotSchema`, and their inferred `*Input` types.

- [ ] **Step 1: `lib/trust/schemas.ts`**

```typescript
import { z } from 'zod'

export const submitReviewSchema = z.object({
  offerId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  showedUp: z.coerce.boolean(),
  comment: z.string().trim().max(500).optional(),
})
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>
```

- [ ] **Step 2: `lib/reports/schemas.ts`**

```typescript
import { z } from 'zod'

export const reportTargetTypeSchema = z.enum(['listing', 'profile', 'message'])

export const reportReasonCodeSchema = z.enum([
  'banned_item',
  'misleading',
  'harassment',
  'no_show_scam',
  'spam',
  'other',
])

export const submitReportSchema = z
  .object({
    targetType: reportTargetTypeSchema,
    targetId: z.string().uuid(),
    reasonCode: reportReasonCodeSchema,
    reasonText: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.reasonCode !== 'other' || !!v.reasonText, {
    message: 'Tell us a bit more.',
    path: ['reasonText'],
  })
export type SubmitReportInput = z.infer<typeof submitReportSchema>
```

- [ ] **Step 3: `lib/admin/schemas.ts`**

```typescript
import { z } from 'zod'

export const takeDownListingSchema = z.object({
  listingId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  reportId: z.string().uuid().optional(),
})
export type TakeDownListingInput = z.infer<typeof takeDownListingSchema>

export const suspendUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  reportId: z.string().uuid().optional(),
})
export type SuspendUserInput = z.infer<typeof suspendUserSchema>

export const unsuspendUserSchema = z.object({
  userId: z.string().uuid(),
})
export type UnsuspendUserInput = z.infer<typeof unsuspendUserSchema>

export const dismissReportSchema = z.object({
  reportId: z.string().uuid(),
})
export type DismissReportInput = z.infer<typeof dismissReportSchema>

export const upsertMeetupSpotSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  hint: z.string().trim().max(200).optional(),
  isCameraCovered: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
})
export type UpsertMeetupSpotInput = z.infer<typeof upsertMeetupSpotSchema>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: same known-pending errors as after Task 3 (`lib/auth/actions.ts`, `NotificationBell.tsx`), no new ones from these 3 files.

- [ ] **Step 5: Commit**

```bash
git add lib/trust/schemas.ts lib/reports/schemas.ts lib/admin/schemas.ts
git commit -m "feat: Phase 6 Zod schemas — reviews, reports, admin actions"
```

---

## Task 6: Queries

**Files:**

- Create: `lib/trust/queries.ts`
- Create: `lib/admin/queries.ts`

**Interfaces:**

- Consumes: `createClient` from `lib/supabase/server`; types from Task 3.
- Produces: `getProfileTrustStats(userId)`, `hasReviewed(offerId, reviewerId)`; `isAdmin(userId)`, `getOpenReports()`, `getAllUsersForAdmin()`.

- [ ] **Step 1: `lib/trust/queries.ts`**

```typescript
// lib/trust/queries.ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export interface ProfileTrustStats {
  trust_score: number
  show_up_rate: number | null
  completed_deals: number
  review_count: number
}

export async function getProfileTrustStats(userId: string): Promise<ProfileTrustStats | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('trust_score, show_up_rate, completed_deals, review_count')
    .eq('id', userId)
    .maybeSingle()
  return data
}

export async function hasReviewed(offerId: string, reviewerId: string): Promise<boolean> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('offer_id', offerId)
    .eq('reviewer_id', reviewerId)
  return (count ?? 0) > 0
}
```

- [ ] **Step 2: `lib/admin/queries.ts`**

```typescript
// lib/admin/queries.ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ReportRow } from '@/types/database'

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('is_admin', { p_user_id: userId })
  return data ?? false
}

export interface OpenReportWithTarget extends ReportRow {
  targetLabel: string
}

/**
 * Reports have no FK on target_id (polymorphic across 3 tables), so the
 * target's display label is resolved with a follow-up lookup per type
 * rather than a join. Open reports only — the admin queue doesn't need
 * dismissed/actioned history displayed inline.
 */
export async function getOpenReports(): Promise<OpenReportWithTarget[]> {
  const supabase = await createClient()
  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  const rows = reports ?? []

  const listingIds = rows.filter((r) => r.target_type === 'listing').map((r) => r.target_id)
  const profileIds = rows.filter((r) => r.target_type === 'profile').map((r) => r.target_id)
  const messageIds = rows.filter((r) => r.target_type === 'message').map((r) => r.target_id)

  const [listings, profiles, messages] = await Promise.all([
    listingIds.length
      ? supabase.from('listings').select('id, title').in('id', listingIds)
      : { data: [] },
    profileIds.length
      ? supabase.from('profiles').select('id, display_name').in('id', profileIds)
      : { data: [] },
    messageIds.length
      ? supabase.from('messages').select('id, body').in('id', messageIds)
      : { data: [] },
  ])

  const listingLabels = new Map((listings.data ?? []).map((l) => [l.id, l.title]))
  const profileLabels = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]))
  const messageLabels = new Map((messages.data ?? []).map((m) => [m.id, m.body]))

  return rows.map((r) => ({
    ...r,
    targetLabel:
      r.target_type === 'listing'
        ? (listingLabels.get(r.target_id) ?? '(listing removed)')
        : r.target_type === 'profile'
          ? (profileLabels.get(r.target_id) ?? '(profile not found)')
          : (messageLabels.get(r.target_id) ?? '(message not found)'),
  }))
}

export interface AdminUserRow {
  id: string
  display_name: string
  is_suspended: boolean
  completed_deals: number
  created_at: string
}

export async function getAllUsersForAdmin(searchQuery?: string): Promise<AdminUserRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('profiles')
    .select('id, display_name, is_suspended, completed_deals, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (searchQuery) query = query.ilike('display_name', `%${searchQuery}%`)
  const { data } = await query
  return data ?? []
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/trust/queries.ts lib/admin/queries.ts
git commit -m "feat: Phase 6 queries — trust stats, admin report queue, admin user search"
```

---

## Task 7: Server Actions

**Files:**

- Create: `lib/trust/actions.ts`
- Create: `lib/reports/actions.ts`
- Create: `lib/admin/actions.ts`

**Interfaces:**

- Consumes: `createClient` from `lib/supabase/server`; schemas from Task 5.
- Produces: `submitReview`; `submitReport`; `takeDownListing`, `suspendUser`, `unsuspendUser`, `dismissReport`, `upsertMeetupSpot`, `bumpPolicyVersion`.

- [ ] **Step 1: `lib/trust/actions.ts`**

```typescript
// lib/trust/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { submitReviewSchema, type SubmitReviewInput } from '@/lib/trust/schemas'

export interface TrustActionResult {
  error?: string
}

export async function submitReview(raw: SubmitReviewInput): Promise<TrustActionResult> {
  const result = submitReviewSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your review.' }
  }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('submit_review', {
    p_offer_id: input.offerId,
    p_reviewee_id: input.revieweeId,
    p_rating: input.rating,
    p_showed_up: input.showedUp,
    p_comment: input.comment ?? null,
  })
  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 2: `lib/reports/actions.ts`**

```typescript
// lib/reports/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { submitReportSchema, type SubmitReportInput } from '@/lib/reports/schemas'

export interface ReportActionResult {
  error?: string
}

export async function submitReport(raw: SubmitReportInput): Promise<ReportActionResult> {
  const result = submitReportSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your report.' }
  }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('submit_report', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason_code: input.reasonCode,
    p_reason_text: input.reasonText ?? null,
  })
  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 3: `lib/admin/actions.ts`**

```typescript
// lib/admin/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  takeDownListingSchema,
  suspendUserSchema,
  unsuspendUserSchema,
  dismissReportSchema,
  upsertMeetupSpotSchema,
  type TakeDownListingInput,
  type SuspendUserInput,
  type UnsuspendUserInput,
  type DismissReportInput,
  type UpsertMeetupSpotInput,
} from '@/lib/admin/schemas'

export interface AdminActionResult {
  error?: string
}

export async function takeDownListing(raw: TakeDownListingInput): Promise<AdminActionResult> {
  const result = takeDownListingSchema.safeParse(raw)
  if (!result.success) return { error: result.error.errors[0]?.message ?? 'Check the takedown.' }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('admin_take_down_listing', {
    p_listing_id: input.listingId,
    p_reason: input.reason,
    p_report_id: input.reportId ?? null,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

export async function suspendUser(raw: SuspendUserInput): Promise<AdminActionResult> {
  const result = suspendUserSchema.safeParse(raw)
  if (!result.success) return { error: result.error.errors[0]?.message ?? 'Check the suspension.' }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('admin_suspend_user', {
    p_user_id: input.userId,
    p_reason: input.reason,
    p_report_id: input.reportId ?? null,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin')
  revalidatePath('/admin/users')
  return {}
}

export async function unsuspendUser(raw: UnsuspendUserInput): Promise<AdminActionResult> {
  const result = unsuspendUserSchema.safeParse(raw)
  if (!result.success) return { error: 'Invalid user.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_unsuspend_user', { p_user_id: result.data.userId })
  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return {}
}

export async function dismissReport(raw: DismissReportInput): Promise<AdminActionResult> {
  const result = dismissReportSchema.safeParse(raw)
  if (!result.success) return { error: 'Invalid report.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_dismiss_report', {
    p_report_id: result.data.reportId,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

export async function upsertMeetupSpot(raw: UpsertMeetupSpotInput): Promise<AdminActionResult> {
  const result = upsertMeetupSpotSchema.safeParse(raw)
  if (!result.success)
    return { error: result.error.errors[0]?.message ?? 'Check the spot details.' }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('admin_upsert_meetup_spot', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_hint: input.hint ?? null,
    p_is_camera_covered: input.isCameraCovered,
    p_active: input.active,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/meetup-spots')
  return {}
}

export async function bumpPolicyVersion(): Promise<AdminActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_bump_policy_version')
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/trust/actions.ts lib/reports/actions.ts lib/admin/actions.ts
git commit -m "feat: Phase 6 Server Actions — reviews, reports, admin moderation"
```

---

## Task 8: `middleware.ts` admin guard + policy-version cleanup

**Files:**

- Modify: `middleware.ts`
- Modify: `lib/auth/actions.ts`
- Modify: `lib/auth/house-rules.ts`

**Interfaces:**

- Consumes: `is_admin` RPC (Task 1).
- Produces: `/admin/*` routes redirect non-admins to `/`; `completeOnboarding` no longer passes `p_policy_version`.

- [ ] **Step 1: Add the `/admin` guard to `middleware.ts`**

Change the final section of `middleware.ts` (after the existing `is_suspended` check, before `return response`):

```typescript
if (profile.is_suspended) {
  return NextResponse.redirect(new URL('/suspended', request.url))
}

if (pathname.startsWith('/admin')) {
  const { data: adminCheck } = await supabase.rpc('is_admin', { p_user_id: user.id })
  if (!adminCheck) {
    return NextResponse.redirect(new URL('/', request.url))
  }
}

return response
```

- [ ] **Step 2: Remove `POLICY_VERSION` from `lib/auth/house-rules.ts`**

Change:

```typescript
export const POLICY_VERSION = 1

export const HOUSE_RULES_V1: string[] = [
```

to:

```typescript
export const HOUSE_RULES_V1: string[] = [
```

- [ ] **Step 3: Stop passing `p_policy_version` in `lib/auth/actions.ts`**

Remove the import:

```typescript
import { onboardingSchema } from '@/lib/auth/schemas'
```

(was `import { sendOtpSchema, verifyOtpSchema, onboardingSchema } from '@/lib/auth/schemas'` — keep `sendOtpSchema`/`verifyOtpSchema`, only drop the `POLICY_VERSION` import line entirely: `import { POLICY_VERSION } from '@/lib/auth/house-rules'` is deleted, not modified.)

Change the `complete_onboarding` RPC call:

```typescript
const { error: profileError } = await supabase.rpc('complete_onboarding', {
  p_display_name: result.data.displayName,
  p_program: result.data.program ?? null,
  p_year_level: result.data.yearLevel ?? null,
  p_avatar_url: result.data.avatarUrl ?? null,
  p_policy_version: POLICY_VERSION,
})
```

to:

```typescript
const { error: profileError } = await supabase.rpc('complete_onboarding', {
  p_display_name: result.data.displayName,
  p_program: result.data.program ?? null,
  p_year_level: result.data.yearLevel ?? null,
  p_avatar_url: result.data.avatarUrl ?? null,
})
```

- [ ] **Step 4: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint middleware.ts lib/auth --max-warnings 0
npm run build
```

Expected: `tsc` now has ONE known-pending error left (`NotificationBell.tsx`, fixed in Task 9). `eslint`/`build` clean.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts lib/auth/actions.ts lib/auth/house-rules.ts
git commit -m "feat: Phase 6 — /admin route guard, policy_version moved to app_settings"
```

---

## Task 9: Shared component fixes

**Files:**

- Modify: `components/ui/NotificationBell.tsx`
- Modify: `lib/discovery/queries.ts`

**Interfaces:**

- Produces: `NotificationBell` correctly routes/no-ops for the 2 new kinds instead of crashing on a null `offer_id`; feed excludes suspended owners' listings.

- [ ] **Step 1: Fix `NotificationBell.tsx`'s routing and add copy for the 2 new kinds**

Change the `KIND_COPY` record:

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
  listing_removed: 'your listing was removed',
  account_suspended: 'your account was suspended',
}
```

Change `handleSelect`:

```typescript
function handleSelect(notification: NotificationRow) {
  setDismissed((prev) => [...prev, notification.id])
  setOpen(false)
  void markNotificationRead(notification.id)
  if (notification.offer_id) {
    router.push(`/deals/${notification.offer_id}`)
  } else if (notification.kind === 'listing_removed') {
    router.push('/ako')
  }
  // account_suspended: no navigation — middleware will redirect the
  // suspended user to /suspended on their very next request regardless.
}
```

- [ ] **Step 2: Exclude suspended owners' listings from the feed**

In `lib/discovery/queries.ts`, change `FEED_SELECT`/`FEED_SELECT_WITH_PHOTOS_ONLY` to use an inner join on `profiles` so `is_suspended` can be filtered, and add the filter in `runFeedQuery`:

```typescript
const FEED_SELECT =
  'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
  'listing_images(storage_path, position), ' +
  'listing_wants(label, position), ' +
  'profiles!listings_owner_id_fkey!inner(display_name, verified_at, is_suspended)'

const FEED_SELECT_WITH_PHOTOS_ONLY =
  'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
  'listing_images!inner(storage_path, position), ' +
  'listing_wants(label, position), ' +
  'profiles!listings_owner_id_fkey!inner(display_name, verified_at, is_suspended)'
```

In `runFeedQuery`, add the exclusion right after the existing `.eq('status', 'active')`/`.gt('expires_at', ...)` chain:

```typescript
let query = baseFeedQuery(supabase, filters)
  .eq('status', 'active')
  .gt('expires_at', new Date().toISOString())
  .eq('profiles.is_suspended', false)
```

`FeedListing`'s `profiles` field type (`lib/listings/queries.ts`) needs `is_suspended` added so this compiles — change:

```typescript
  profiles: { display_name: string; verified_at: string | null } | null
```

to:

```typescript
  profiles: { display_name: string; verified_at: string | null; is_suspended: boolean } | null
```

(The `is_suspended` field isn't rendered anywhere new — it exists on the type only because the `!inner` join now includes it in the selected columns; nothing in `FeedListing`'s consumers needs to read it.)

- [ ] **Step 3: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint components/ui/NotificationBell.tsx lib/discovery lib/listings --max-warnings 0
npm run build
```

Expected: both fully clean now — this closes out the last known-pending `tsc` error from Task 3.

- [ ] **Step 4: Commit**

```bash
git add components/ui/NotificationBell.tsx lib/discovery/queries.ts lib/listings/queries.ts
git commit -m "fix: Phase 6 — NotificationBell routing for new kinds, feed excludes suspended owners"
```

---

## Task 10: `ReviewPrompt` component

**Files:**

- Create: `app/(app)/deals/[id]/ReviewPrompt.tsx`
- Modify: `app/(app)/deals/[id]/OfferThread.tsx`
- Modify: `app/(app)/deals/[id]/page.tsx`

**Interfaces:**

- Consumes: `submitReview` from `lib/trust/actions`; `hasReviewed` from `lib/trust/queries`; `Sheet`, `Button` from `components/ui`.
- Produces: `<ReviewPrompt offerId revieweeId revieweeName />`, wired into `OfferThread` for `leaf.status === 'completed'`.

- [ ] **Step 1: Write `ReviewPrompt.tsx`**

```tsx
// app/(app)/deals/[id]/ReviewPrompt.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { submitReview } from '@/lib/trust/actions'

interface ReviewPromptProps {
  offerId: string
  revieweeId: string
  revieweeName: string
}

export function ReviewPrompt({ offerId, revieweeId, revieweeName }: ReviewPromptProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(true)
  const [rating, setRating] = useState(0)
  const [showedUp, setShowedUp] = useState<boolean | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (rating === 0 || showedUp === null) return
    setError(null)
    startTransition(async () => {
      const res = await submitReview({
        offerId,
        revieweeId,
        rating,
        showedUp,
        comment: comment || undefined,
      })
      if (res.error) setError(res.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={`Rate ${revieweeName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
            {error}
          </p>
        )}

        <div role="group" aria-label="Rating" style={{ display: 'flex', gap: '0.375rem' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              style={{
                width: '2.5rem',
                height: '2.5rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1.125rem',
                cursor: 'pointer',
                backgroundColor: rating >= n ? 'var(--gold)' : 'var(--card)',
                color: 'var(--ink)',
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: '0 0 0.375rem',
            }}
          >
            Did they show up?
          </p>
          <div
            role="group"
            aria-label="Did they show up?"
            style={{ display: 'flex', gap: '0.375rem' }}
          >
            <button
              type="button"
              aria-pressed={showedUp === true}
              onClick={() => setShowedUp(true)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: showedUp === true ? 'var(--crimson)' : 'var(--card)',
                color: showedUp === true ? 'var(--card)' : 'var(--ink)',
              }}
            >
              Yes
            </button>
            <button
              type="button"
              aria-pressed={showedUp === false}
              onClick={() => setShowedUp(false)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: showedUp === false ? 'var(--crimson)' : 'var(--card)',
                color: showedUp === false ? 'var(--card)' : 'var(--ink)',
              }}
            >
              No
            </button>
          </div>
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Optional comment…"
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
          disabled={isPending || rating === 0 || showedUp === null}
          onClick={handleSubmit}
        >
          {isPending ? 'Submitting…' : 'Submit review'}
        </Button>
      </div>
    </Sheet>
  )
}
```

- [ ] **Step 2: Wire into `OfferThread.tsx`**

Add the import:

```typescript
import { ReviewPrompt } from './ReviewPrompt'
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
  hasReviewed: boolean
  revieweeName: string
}
```

Update the component signature/destructuring to include `hasReviewed, revieweeName`, and add this block right after the `<OfferActions .../>`/`<DealControls .../>` lines at the end of the returned JSX:

```tsx
{
  leaf.status === 'completed' && !hasReviewed && (
    <ReviewPrompt
      offerId={leaf.id}
      revieweeId={leaf.from_user_id === currentUserId ? leaf.to_user_id : leaf.from_user_id}
      revieweeName={revieweeName}
    />
  )
}
```

- [ ] **Step 3: Fetch `hasReviewed`/`revieweeName` in `page.tsx`**

Add the import:

```typescript
import { hasReviewed as hasReviewedQuery } from '@/lib/trust/queries'
```

In the `Promise.all` that already fetches `meetup, messages, confirmations, cancellation, meetupSpots`, add a fifth call: `hasReviewedQuery(leaf.id, user.id)`. The counterparty's display name isn't fetched anywhere yet on this page — add a small inline query right after the existing `listing` fetch:

```typescript
const counterpartyId = leaf.from_user_id === user.id ? leaf.to_user_id : leaf.from_user_id
const { data: counterpartyProfile } = await supabase
  .from('profiles')
  .select('display_name')
  .eq('id', counterpartyId)
  .maybeSingle()
```

Pass both new values into `<OfferThread ... hasReviewed={reviewed} revieweeName={counterpartyProfile?.display_name ?? 'them'} />`.

- [ ] **Step 4: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint app/'(app)'/deals --max-warnings 0
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/deals/[id]/ReviewPrompt.tsx" "app/(app)/deals/[id]/OfferThread.tsx" "app/(app)/deals/[id]/page.tsx"
git commit -m "feat: Phase 6 review prompt — one-time post-completion rating + show-up sheet"
```

---

## Task 11: `ReportSheet` component + wiring

**Files:**

- Create: `components/ui/ReportSheet.tsx`
- Modify: `components/ui/index.ts`
- Modify: `app/(app)/l/[code]/page.tsx`
- Modify: `app/(app)/deals/[id]/DealChat.tsx`

**Interfaces:**

- Consumes: `submitReport` from `lib/reports/actions`; `reportReasonCodeSchema` from `lib/reports/schemas`; `Sheet`, `Button` from `components/ui`.
- Produces: `<ReportSheet targetType targetId open onClose />`, wired as a trigger button on listing detail (listing + owner) and per-message in the deal chat.

- [ ] **Step 1: Write `ReportSheet.tsx`**

```tsx
// components/ui/ReportSheet.tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { submitReport } from '@/lib/reports/actions'
import { reportReasonCodeSchema } from '@/lib/reports/schemas'
import type { z } from 'zod'

type ReasonCode = z.infer<typeof reportReasonCodeSchema>
type TargetType = 'listing' | 'profile' | 'message'

const REASON_LABEL: Record<ReasonCode, string> = {
  banned_item: 'Banned item',
  misleading: 'Misleading listing',
  harassment: 'Harassment',
  no_show_scam: 'No-show or scam behavior',
  spam: 'Spam',
  other: 'Other',
}

interface ReportSheetProps {
  open: boolean
  onClose: () => void
  targetType: TargetType
  targetId: string
}

export function ReportSheet({ open, onClose, targetType, targetId }: ReportSheetProps) {
  const [isPending, startTransition] = useTransition()
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (!reasonCode) return
    setError(null)
    startTransition(async () => {
      const res = await submitReport({
        targetType,
        targetId,
        reasonCode,
        reasonText: reasonText || undefined,
      })
      if (res.error) setError(res.error)
      else setSubmitted(true)
    })
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setSubmitted(false)
        setReasonCode(null)
        setReasonText('')
        onClose()
      }}
      title="Report this"
    >
      {submitted ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9375rem', color: 'var(--ink)' }}>
          Thanks — an admin will review this.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {error && (
            <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
              {error}
            </p>
          )}
          <div
            role="group"
            aria-label="Report reason"
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
              maxLength={500}
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
            onClick={handleSubmit}
          >
            {isPending ? 'Sending…' : 'Submit report'}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 2: Export it**

In `components/ui/index.ts`, add alongside the other exports:

```typescript
export { ReportSheet } from './ReportSheet'
```

- [ ] **Step 3: Wire into `app/(app)/l/[code]/page.tsx`**

This page is currently a Server Component with no client-side state — the report trigger needs a tiny client wrapper. Create it inline as a small new file rather than converting the whole page to a Client Component:

Add a new file `app/(app)/l/[code]/ReportTrigger.tsx`:

```tsx
// app/(app)/l/[code]/ReportTrigger.tsx
'use client'

import { useState } from 'react'
import { ReportSheet } from '@/components/ui'

interface ReportTriggerProps {
  targetType: 'listing' | 'profile'
  targetId: string
  label: string
}

export function ReportTrigger({ targetType, targetId, label }: ReportTriggerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-45)',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {label}
      </button>
      <ReportSheet
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
      />
    </>
  )
}
```

In `app/(app)/l/[code]/page.tsx`, add the import:

```typescript
import { ReportTrigger } from './ReportTrigger'
```

Inside the `{owner && (<Panel>...)}` block (the "Posted by" panel), right after the closing `{owner.verified_at && (...)}` block and before the panel's closing `</Panel>`, add — but only when the viewer isn't the owner themselves:

```tsx
{
  !isOwner && (
    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
      <ReportTrigger targetType="listing" targetId={listing.id} label="Report listing" />
      <ReportTrigger targetType="profile" targetId={listing.owner_id} label="Report user" />
    </div>
  )
}
```

- [ ] **Step 4: Wire per-message reporting into `DealChat.tsx`**

Add the import:

```typescript
import { ReportSheet } from '@/components/ui'
```

Add local state near the component's other `useState` calls:

```typescript
const [reportingMessageId, setReportingMessageId] = useState<string | null>(null)
```

In the message-bubble render (the `messages.map((m) => ...)` block), add a small "Report" link under the timestamp line, only for messages NOT sent by the current user (can't report yourself) and not `pending`/`failed` (must be a real, persisted row with a stable id):

```tsx
{
  !mine && !m.pending && !m.failed && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setReportingMessageId(m.id)
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        marginTop: '0.125rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '8px',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--ink-45)',
        cursor: 'pointer',
        textDecoration: 'underline',
      }}
    >
      Report
    </button>
  )
}
```

(Place this as a new element inside the message `<div>`, after the existing timestamp `<p>`.)

After the closing `</div>` of the scrollable message list (before the `{canSend && (...)}` composer block), add:

```tsx
<ReportSheet
  open={reportingMessageId !== null}
  onClose={() => setReportingMessageId(null)}
  targetType="message"
  targetId={reportingMessageId ?? ''}
/>
```

- [ ] **Step 5: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint components/ui "app/(app)/l/[code]" "app/(app)/deals/[id]" --max-warnings 0
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/ReportSheet.tsx components/ui/index.ts "app/(app)/l/[code]/ReportTrigger.tsx" "app/(app)/l/[code]/page.tsx" "app/(app)/deals/[id]/DealChat.tsx"
git commit -m "feat: Phase 6 report flow — reusable ReportSheet, wired into listing detail and chat messages"
```

---

## Task 12: Stamps display + Ako page

**Files:**

- Modify: `app/(app)/ako/page.tsx`

**Interfaces:**

- Consumes: `getProfileTrustStats` from `lib/trust/queries`; `earnedStamps` from `lib/trust/stamps`; `Stamp` from `components/ui`.

- [ ] **Step 1: Wire trust stats + stamps into the Ako page**

Add the imports:

```typescript
import { getProfileTrustStats } from '@/lib/trust/queries'
import { earnedStamps, type Stamp as StampType } from '@/lib/trust/stamps'
import { Stamp } from '@/components/ui'
```

Add to the existing `Promise.all` (or a parallel fetch alongside it):

```typescript
const trustStats = await getProfileTrustStats(user.id)
```

Define a small label map above the component (module scope):

```typescript
const STAMP_LABEL: Record<StampType, string> = {
  first_baylo: 'First baylo',
  ten_baylos: 'Ten baylos',
  fair_trader: 'Fair trader',
  always_on_time: 'Always on time',
}
```

Insert a new section right after the `<Ribbon>Ako</Ribbon>` header, before the existing "Your listings" section, inside `<main>`:

```tsx
{
  trustStats && (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}
    >
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.25rem',
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {trustStats.completed_deals}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            Baylos
          </p>
        </div>
        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.25rem',
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {trustStats.review_count > 0 ? trustStats.trust_score.toFixed(1) : '—'}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            Rating
          </p>
        </div>
        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.25rem',
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {trustStats.show_up_rate !== null
              ? `${Math.round(trustStats.show_up_rate * 100)}%`
              : '—'}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            Show-up
          </p>
        </div>
      </div>
      {(() => {
        const stamps = earnedStamps(trustStats)
        return stamps.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {stamps.map((s, i) => (
              <Stamp key={s} label={STAMP_LABEL[s]} rotate={i % 2 === 0 ? -2 : 1.5} />
            ))}
          </div>
        ) : null
      })()}
    </div>
  )
}
```

- [ ] **Step 2: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint "app/(app)/ako" --max-warnings 0
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/ako/page.tsx"
git commit -m "feat: Phase 6 — trust stats and earned stamps on the Ako profile page"
```

---

## Task 13: Admin dashboard (`/admin`)

**Files:**

- Create: `app/(admin)/layout.tsx`
- Create: `app/(admin)/admin/page.tsx`
- Create: `app/(admin)/admin/ReportQueue.tsx`

**Interfaces:**

- Consumes: `getOpenReports` from `lib/admin/queries`; `takeDownListing`, `suspendUser`, `dismissReport`, `bumpPolicyVersion` from `lib/admin/actions`; `Ribbon`, `Button`, `Panel` from `components/ui`.

- [ ] **Step 1: Thin layout for the admin route group**

```tsx
// app/(admin)/layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100dvh', backgroundColor: 'var(--paper)' }}>{children}</div>
}
```

(Route-level access control is already enforced by `middleware.ts` from Task 8 — this layout is purely a background/container wrapper, matching the app's `(app)`/`(auth)` layout convention. Admin screens don't use the bottom nav or the same header chrome as the consumer app — they're denser, ops-focused pages.)

- [ ] **Step 2: `app/(admin)/admin/page.tsx`**

```tsx
// app/(admin)/admin/page.tsx
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { isAdmin, getOpenReports } from '@/lib/admin/queries'
import { Ribbon } from '@/components/ui'
import { ReportQueue } from './ReportQueue'
import { PolicyVersionBumpButton } from './PolicyVersionBumpButton'

export default async function AdminPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  // middleware.ts already enforces this — defensive only, mirrors the
  // pattern already used on every other protected page in this app.
  if (!(await isAdmin(user.id))) redirect('/')

  const reports = await getOpenReports()

  return (
    <>
      <header>
        <Ribbon>Admin</Ribbon>
      </header>
      <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a
            href="/admin/users"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--crimson)' }}
          >
            Users →
          </a>
          <a
            href="/admin/meetup-spots"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--crimson)' }}
          >
            Meetup spots →
          </a>
        </div>
        <PolicyVersionBumpButton />
        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: '0 0 0.5rem',
            }}
          >
            Open reports ({reports.length})
          </p>
          <ReportQueue reports={reports} />
        </div>
      </main>
    </>
  )
}
```

- [ ] **Step 3: `app/(admin)/admin/PolicyVersionBumpButton.tsx`**

```tsx
// app/(admin)/admin/PolicyVersionBumpButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { bumpPolicyVersion } from '@/lib/admin/actions'

export function PolicyVersionBumpButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleBump() {
    if (
      !window.confirm(
        'Bump the house-rules policy version? Existing users are not forced to re-accept.',
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const res = await bumpPolicyVersion()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={isPending} onClick={handleBump}>
        {isPending ? 'Bumping…' : 'Bump policy version'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: `app/(admin)/admin/ReportQueue.tsx`**

```tsx
// app/(admin)/admin/ReportQueue.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Panel, Button } from '@/components/ui'
import { dismissReport, takeDownListing, suspendUser } from '@/lib/admin/actions'
import type { OpenReportWithTarget } from '@/lib/admin/queries'

interface ReportQueueProps {
  reports: OpenReportWithTarget[]
}

export function ReportQueue({ reports }: ReportQueueProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDismiss(reportId: string) {
    setError(null)
    startTransition(async () => {
      const res = await dismissReport({ reportId })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleTakeDownListing(reportId: string, targetId: string) {
    const reason = window.prompt('Reason for takedown (shown to the listing owner):')
    if (!reason) return
    setError(null)
    startTransition(async () => {
      const res = await takeDownListing({ listingId: targetId, reason, reportId })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleSuspendUser(reportId: string, targetId: string) {
    const reason = window.prompt('Reason for suspension (shown to the user):')
    if (!reason) return
    setError(null)
    startTransition(async () => {
      const res = await suspendUser({ userId: targetId, reason, reportId })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  if (reports.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink-45)' }}>
        No open reports.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      {reports.map((r) => (
        <Panel key={r.id}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: '0 0 0.25rem',
            }}
          >
            {r.target_type} · {r.reason_code}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              margin: '0 0 0.25rem',
            }}
          >
            {r.targetLabel}
          </p>
          {r.reason_text && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-70)',
                margin: '0 0 0.5rem',
              }}
            >
              &ldquo;{r.reason_text}&rdquo;
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => handleDismiss(r.id)}
            >
              Dismiss
            </Button>
            {r.target_type === 'listing' && (
              <Button
                type="button"
                variant="primary"
                disabled={isPending}
                onClick={() => handleTakeDownListing(r.id, r.target_id)}
              >
                Take down listing
              </Button>
            )}
            {r.target_type === 'profile' && (
              <Button
                type="button"
                variant="primary"
                disabled={isPending}
                onClick={() => handleSuspendUser(r.id, r.target_id)}
              >
                Suspend user
              </Button>
            )}
          </div>
        </Panel>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint "app/(admin)" --max-warnings 0
npm run build
```

Expected: `/admin` appears in the route manifest.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/layout.tsx" "app/(admin)/admin/page.tsx" "app/(admin)/admin/PolicyVersionBumpButton.tsx" "app/(admin)/admin/ReportQueue.tsx"
git commit -m "feat: Phase 6 admin dashboard — report queue, policy version bump"
```

---

## Task 14: Admin users page (`/admin/users`)

**Files:**

- Create: `app/(admin)/admin/users/page.tsx`
- Create: `app/(admin)/admin/users/UserSearch.tsx`

**Interfaces:**

- Consumes: `getAllUsersForAdmin` from `lib/admin/queries`; `suspendUser`, `unsuspendUser` from `lib/admin/actions`.

- [ ] **Step 1: `app/(admin)/admin/users/page.tsx`**

```tsx
// app/(admin)/admin/users/page.tsx
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { isAdmin, getAllUsersForAdmin } from '@/lib/admin/queries'
import { Ribbon } from '@/components/ui'
import { UserSearch } from './UserSearch'

export default async function AdminUsersPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!(await isAdmin(user.id))) redirect('/')

  const users = await getAllUsersForAdmin()

  return (
    <>
      <header>
        <Ribbon>Users</Ribbon>
      </header>
      <main style={{ padding: '1rem' }}>
        <UserSearch initialUsers={users} />
      </main>
    </>
  )
}
```

- [ ] **Step 2: `app/(admin)/admin/users/UserSearch.tsx`**

```tsx
// app/(admin)/admin/users/UserSearch.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Panel, Button } from '@/components/ui'
import { suspendUser, unsuspendUser } from '@/lib/admin/actions'
import type { AdminUserRow } from '@/lib/admin/queries'

interface UserSearchProps {
  initialUsers: AdminUserRow[]
}

export function UserSearch({ initialUsers }: UserSearchProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const filtered = query
    ? initialUsers.filter((u) => u.display_name.toLowerCase().includes(query.toLowerCase()))
    : initialUsers

  function handleSuspend(userId: string) {
    const reason = window.prompt('Reason for suspension (shown to the user):')
    if (!reason) return
    setError(null)
    startTransition(async () => {
      const res = await suspendUser({ userId, reason })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleUnsuspend(userId: string) {
    setError(null)
    startTransition(async () => {
      const res = await unsuspendUser({ userId })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by display name…"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          padding: '0.625rem 0.875rem',
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      {filtered.map((u) => (
        <Panel key={u.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  color: 'var(--ink)',
                  margin: 0,
                }}
              >
                {u.display_name}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--ink-45)',
                  margin: '0.125rem 0 0',
                }}
              >
                {u.completed_deals} deals · {u.is_suspended ? 'SUSPENDED' : 'active'}
              </p>
            </div>
            {u.is_suspended ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => handleUnsuspend(u.id)}
              >
                Unsuspend
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={isPending}
                onClick={() => handleSuspend(u.id)}
              >
                Suspend
              </Button>
            )}
          </div>
        </Panel>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint "app/(admin)" --max-warnings 0
npm run build
```

Expected: `/admin/users` in the route manifest.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/users/page.tsx" "app/(admin)/admin/users/UserSearch.tsx"
git commit -m "feat: Phase 6 admin users page — search, suspend, unsuspend"
```

---

## Task 15: Admin meetup-spots page (`/admin/meetup-spots`)

**Files:**

- Create: `app/(admin)/admin/meetup-spots/page.tsx`
- Create: `app/(admin)/admin/meetup-spots/MeetupSpotForm.tsx`

**Interfaces:**

- Consumes: `getMeetupSpots` from `lib/listings/queries` (existing, reused — it currently only filters `active`, this page needs all spots including inactive ones, see Step 1); `upsertMeetupSpot` from `lib/admin/actions`.

- [ ] **Step 1: Add an admin variant to `lib/listings/queries.ts`**

The existing `getMeetupSpots()` filters `.eq('active', true)` — the admin page needs to see inactive spots too, to be able to reactivate them. Add a new function right after `getMeetupSpots`:

```typescript
export async function getAllMeetupSpotsForAdmin(): Promise<MeetupSpotRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('meetup_spots').select('*').order('name')
  return data ?? []
}
```

- [ ] **Step 2: `app/(admin)/admin/meetup-spots/page.tsx`**

```tsx
// app/(admin)/admin/meetup-spots/page.tsx
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { isAdmin } from '@/lib/admin/queries'
import { getAllMeetupSpotsForAdmin } from '@/lib/listings/queries'
import { Ribbon } from '@/components/ui'
import { MeetupSpotForm } from './MeetupSpotForm'

export default async function AdminMeetupSpotsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!(await isAdmin(user.id))) redirect('/')

  const spots = await getAllMeetupSpotsForAdmin()

  return (
    <>
      <header>
        <Ribbon>Meetup spots</Ribbon>
      </header>
      <main style={{ padding: '1rem' }}>
        <MeetupSpotForm existingSpots={spots} />
      </main>
    </>
  )
}
```

- [ ] **Step 3: `app/(admin)/admin/meetup-spots/MeetupSpotForm.tsx`**

```tsx
// app/(admin)/admin/meetup-spots/MeetupSpotForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Panel, Button } from '@/components/ui'
import { upsertMeetupSpot } from '@/lib/admin/actions'
import type { MeetupSpotRow } from '@/types/database'

interface MeetupSpotFormProps {
  existingSpots: MeetupSpotRow[]
}

const emptyDraft = {
  id: undefined as number | undefined,
  name: '',
  hint: '',
  isCameraCovered: false,
  active: true,
}

export function MeetupSpotForm({ existingSpots }: MeetupSpotFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState<string | null>(null)

  function handleEdit(spot: MeetupSpotRow) {
    setDraft({
      id: spot.id,
      name: spot.name,
      hint: spot.hint ?? '',
      isCameraCovered: spot.is_camera_covered,
      active: spot.active,
    })
  }

  function handleSave() {
    if (!draft.name.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await upsertMeetupSpot({
        id: draft.id,
        name: draft.name,
        hint: draft.hint || undefined,
        isCameraCovered: draft.isCameraCovered,
        active: draft.active,
      })
      if (res.error) setError(res.error)
      else {
        setDraft(emptyDraft)
        router.refresh()
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <Panel>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-45)',
            margin: '0 0 0.5rem',
          }}
        >
          {draft.id ? `Editing spot #${draft.id}` : 'New spot'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Name (e.g. Library lobby)"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              padding: '0.625rem 0.875rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
            }}
          />
          <input
            type="text"
            value={draft.hint}
            onChange={(e) => setDraft((d) => ({ ...d, hint: e.target.value }))}
            placeholder="Hint (e.g. Ground floor, beside the guard desk)"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              padding: '0.625rem 0.875rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
            }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
            }}
          >
            <input
              type="checkbox"
              checked={draft.isCameraCovered}
              onChange={(e) => setDraft((d) => ({ ...d, isCameraCovered: e.target.checked }))}
            />
            Camera-covered
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
            }}
          >
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
            />
            Active
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="primary"
              disabled={isPending || !draft.name.trim()}
              onClick={handleSave}
            >
              {isPending ? 'Saving…' : draft.id ? 'Save changes' : 'Create spot'}
            </Button>
            {draft.id && (
              <Button type="button" variant="ghost" onClick={() => setDraft(emptyDraft)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {existingSpots.map((spot) => (
          <Panel key={spot.id} style={{ opacity: spot.active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    color: 'var(--ink)',
                    margin: 0,
                  }}
                >
                  {spot.name}
                </p>
                {spot.hint && (
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8125rem',
                      color: 'var(--ink-70)',
                      margin: '0.125rem 0 0',
                    }}
                  >
                    {spot.hint}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" onClick={() => handleEdit(spot)}>
                Edit
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check, lint, build**

```bash
npx tsc --noEmit
npx eslint "app/(admin)" lib/listings --max-warnings 0
npm run build
```

Expected: `/admin/meetup-spots` in the route manifest.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/admin/meetup-spots/page.tsx" "app/(admin)/admin/meetup-spots/MeetupSpotForm.tsx" lib/listings/queries.ts
git commit -m "feat: Phase 6 admin meetup-spots page — list, create, edit"
```

---

## Task 16: E2E — reviews flow

**Files:**

- Modify: `e2e/helpers/fixtures.ts`
- Create: `e2e/reviews.spec.ts`

**Interfaces:**

- Consumes: `signInAsFixtureUser` from `e2e/helpers/auth`; `createFixtureAcceptedOffer` (existing, from Phase 5).

- [ ] **Step 1: Add `createFixtureCompletedOffer` helper**

Append to `e2e/helpers/fixtures.ts`:

```typescript
/**
 * Extends createFixtureAcceptedOffer by having both parties mark the deal
 * swapped, reaching offers.status = 'completed' — the precondition for
 * submit_review. Bypasses the deal-room UI entirely (already covered by
 * Phase 5's e2e/deal-room.spec.ts); this is test setup, not the thing
 * under test.
 */
export async function createFixtureCompletedOffer(options: {
  ownerEmail: string
  offererEmail: string
  listingTitle: string
}): Promise<{ listingId: string; listingCode: string; offerId: string }> {
  const accepted = await createFixtureAcceptedOffer(options)

  const ownerClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  await ownerClient.auth.signInWithPassword({
    email: options.ownerEmail,
    password: 'not-a-real-password',
  })
  const offererClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  await offererClient.auth.signInWithPassword({
    email: options.offererEmail,
    password: 'not-a-real-password',
  })

  const { error: ownerSwapError } = await ownerClient.rpc('mark_swapped', {
    p_offer_id: accepted.offerId,
  })
  if (ownerSwapError) throw new Error(`Could not mark swapped (owner): ${ownerSwapError.message}`)
  const { error: offererSwapError } = await offererClient.rpc('mark_swapped', {
    p_offer_id: accepted.offerId,
  })
  if (offererSwapError) {
    throw new Error(`Could not mark swapped (offerer): ${offererSwapError.message}`)
  }

  return accepted
}
```

- [ ] **Step 2: Write the E2E spec**

```typescript
// e2e/reviews.spec.ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureCompletedOffer } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'

test('completing a deal prompts both parties to review, and stamps appear at the threshold', async ({
  browser,
}) => {
  // Reach review_count >= 3 for the owner (e2e-fixture) by completing 2
  // prior deals with the offerer reviewing each time via direct RPC —
  // only the 3rd, final review is driven through the real UI, which is
  // the actual thing under test.
  const checkClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  await checkClient.auth.signInWithPassword({
    email: OFFERER_EMAIL,
    password: 'not-a-real-password',
  })
  const { data: ownerUser } = await checkClient
    .from('profiles')
    .select('id')
    .eq('display_name', 'E2E Fixture')
    .limit(1)
    .maybeSingle()
  const ownerId = ownerUser!.id

  for (let i = 0; i < 2; i++) {
    const priorDeal = await createFixtureCompletedOffer({
      ownerEmail: OWNER_EMAIL,
      offererEmail: OFFERER_EMAIL,
      listingTitle: `E2E Prior Review Fixture ${i}`,
    })
    const { error } = await checkClient.rpc('submit_review', {
      p_offer_id: priorDeal.offerId,
      p_reviewee_id: ownerId,
      p_rating: 5,
      p_showed_up: true,
      p_comment: null,
    })
    if (error) throw new Error(`Could not seed prior review ${i}: ${error.message}`)
  }

  const { offerId } = await createFixtureCompletedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Review Fixture',
  })

  const offererContext = await browser.newContext()
  const offererPage = await offererContext.newPage()
  await signInAsFixtureUser(offererPage, OFFERER_EMAIL)

  await offererPage.goto(`/deals/${offerId}`)
  await expect(offererPage.getByText('Rate')).toBeVisible()
  await offererPage.getByRole('button', { name: '5', exact: true }).click()
  await offererPage.getByRole('button', { name: 'Yes' }).click()
  await Promise.all([
    offererPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === offererPage.url(),
    ),
    offererPage.getByRole('button', { name: 'Submit review' }).click(),
  ])

  // Confirm at the DB level: this is the review that crosses review_count
  // >= 3 for the owner, which should now also earn the fair_trader and
  // always_on_time stamps (all reviews seeded above were 5-star, showed up).
  const { data: finalProfile, error: finalProfileError } = await checkClient
    .from('profiles')
    .select('trust_score, show_up_rate, review_count')
    .eq('id', ownerId)
    .single()
  if (finalProfileError)
    throw new Error(`Could not read final profile: ${finalProfileError.message}`)
  expect(finalProfile?.review_count).toBe(3)
  expect(finalProfile?.trust_score).toBe(5)
  expect(finalProfile?.show_up_rate).toBe(1)

  // Visual confirmation: the owner's own Ako page now shows the stamps.
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signInAsFixtureUser(ownerPage, OWNER_EMAIL)
  await ownerPage.goto('/ako')
  await expect(ownerPage.getByText('Fair trader')).toBeVisible()
  await expect(ownerPage.getByText('Always on time')).toBeVisible()
})
```

- [ ] **Step 3: Run it**

```bash
set -a; source .env.local; set +a
npx playwright test e2e/reviews.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/fixtures.ts e2e/reviews.spec.ts
git commit -m "test: Phase 6 E2E — review flow and earned-stamp threshold"
```

---

## Task 17: E2E — admin moderation

**Files:**

- Create: `e2e/admin-moderation.spec.ts`

**Interfaces:**

- Consumes: `signInAsFixtureUser`; `createFixtureListing` (existing, from Phase 4); `e2e-fixture-3@usa.edu.ph` as the admin actor (granted in Task 1).

- [ ] **Step 1: Write the spec**

```typescript
// e2e/admin-moderation.spec.ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

const REPORTER_EMAIL = 'e2e-fixture-2@usa.edu.ph'
const TARGET_EMAIL = 'e2e-fixture@usa.edu.ph'
const ADMIN_EMAIL = 'e2e-fixture-3@usa.edu.ph'

test('report a listing, admin dismisses it', async ({ browser }) => {
  const listing = await createFixtureListing({
    ownerEmail: TARGET_EMAIL,
    intent: 'sale',
    title: 'E2E Report Dismiss Fixture',
  })

  const reporterClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  await reporterClient.auth.signInWithPassword({
    email: REPORTER_EMAIL,
    password: 'not-a-real-password',
  })
  const { error: reportError } = await reporterClient.rpc('submit_report', {
    p_target_type: 'listing',
    p_target_id: listing.id,
    p_reason_code: 'spam',
    p_reason_text: null,
  })
  if (reportError) throw new Error(`Could not submit report: ${reportError.message}`)

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await signInAsFixtureUser(adminPage, ADMIN_EMAIL)

  await adminPage.goto('/admin')
  await expect(adminPage.getByText('E2E Report Dismiss Fixture')).toBeVisible()

  adminPage.once('dialog', (dialog) => void dialog.accept())
  await Promise.all([
    adminPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === adminPage.url(),
    ),
    adminPage.getByRole('button', { name: 'Dismiss' }).first().click(),
  ])

  await adminPage.reload()
  await expect(adminPage.getByText('E2E Report Dismiss Fixture')).not.toBeVisible()
})

test('report a listing, admin takes it down — owner notified, listing removed', async ({
  browser,
}) => {
  const listing = await createFixtureListing({
    ownerEmail: TARGET_EMAIL,
    intent: 'sale',
    title: 'E2E Takedown Fixture',
  })

  const reporterClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  await reporterClient.auth.signInWithPassword({
    email: REPORTER_EMAIL,
    password: 'not-a-real-password',
  })
  const { error: reportError } = await reporterClient.rpc('submit_report', {
    p_target_type: 'listing',
    p_target_id: listing.id,
    p_reason_code: 'banned_item',
    p_reason_text: null,
  })
  if (reportError) throw new Error(`Could not submit report: ${reportError.message}`)

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await signInAsFixtureUser(adminPage, ADMIN_EMAIL)

  await adminPage.goto('/admin')
  await expect(adminPage.getByText('E2E Takedown Fixture')).toBeVisible()

  adminPage.once('dialog', (dialog) => void dialog.accept('Banned item per house rules'))
  await Promise.all([
    adminPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === adminPage.url(),
    ),
    adminPage.getByRole('button', { name: 'Take down listing' }).click(),
  ])

  const { data: finalListing, error: finalListingError } = await reporterClient
    .from('listings')
    .select('status')
    .eq('id', listing.id)
    .single()
  if (finalListingError)
    throw new Error(`Could not read final listing: ${finalListingError.message}`)
  expect(finalListing?.status).toBe('removed')

  const { count } = await reporterClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'listing_removed')
    .eq('listing_id', listing.id)
  expect(count).toBeGreaterThan(0)
})

test('admin suspends a user — their listings vanish from the feed', async ({ browser }) => {
  const listing = await createFixtureListing({
    ownerEmail: TARGET_EMAIL,
    intent: 'sale',
    title: 'E2E Suspend Fixture',
  })

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await signInAsFixtureUser(adminPage, ADMIN_EMAIL)
  await adminPage.goto('/admin/users')

  adminPage.once('dialog', (dialog) => void dialog.accept('No-show pattern'))
  await Promise.all([
    adminPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === adminPage.url(),
    ),
    adminPage.getByRole('button', { name: 'Suspend' }).first().click(),
  ])

  const reporterContext = await browser.newContext()
  const reporterPage = await reporterContext.newPage()
  await signInAsFixtureUser(reporterPage, REPORTER_EMAIL)
  await reporterPage.goto('/')
  await expect(reporterPage.getByText('E2E Suspend Fixture')).not.toBeVisible()

  // Cleanup: unsuspend the shared fixture account so it doesn't stay
  // suspended for every other spec in this session that depends on it.
  const targetContext = await browser.newContext()
  const targetPage = await targetContext.newPage()
  await signInAsFixtureUser(targetPage, ADMIN_EMAIL)
  const checkClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  await checkClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password: 'not-a-real-password' })
  const { data: targetUser } = await checkClient
    .from('profiles')
    .select('id')
    .eq('display_name', 'E2E Fixture')
    .limit(1)
    .maybeSingle()
  if (targetUser) {
    await checkClient.rpc('admin_unsuspend_user', { p_user_id: targetUser.id })
  }
  void listing
})
```

**Note:** the third test suspends `e2e-fixture@usa.edu.ph` — a shared fixture account every other spec in this suite depends on being active. The test explicitly unsuspends it again at the end as cleanup. If this test is ever interrupted mid-run (a crash, a manual cancel) before that cleanup executes, `e2e-fixture@usa.edu.ph` will be left suspended and every other spec will start failing at sign-in until someone runs `admin_unsuspend_user` manually against the linked project.

- [ ] **Step 2: Run it**

```bash
set -a; source .env.local; set +a
npx playwright test e2e/admin-moderation.spec.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-moderation.spec.ts
git commit -m "test: Phase 6 E2E — report dismiss, listing takedown, user suspension"
```

---

## Task 18: CLAUDE.md reconciliation

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Move the current-phase marker**

Change:

```markdown
- **Phase 5** — Deal room (current)
- **Phase 6** — Trust & safety
```

to:

```markdown
- **Phase 5** — Deal room
- **Phase 6** — Trust & safety (current)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Phase 6 current"
```

---

## Acceptance Criteria Checklist

| Build-spec "Done when"                                                   | How it's proven                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| A takedown notifies the owner with the specific rule cited               | Task 2 pgTAP; Task 17 E2E asserts the `listing_removed` notification carries the reason            |
| A suspended user's listings disappear from the feed within one page load | Task 9's feed query change; Task 17 E2E asserts the listing is gone from another user's feed       |
| No moderation action is possible without an audit row                    | Every `admin_*` RPC writes `audit_log` in the same transaction; Task 2 pgTAP asserts it after each |
| TypeScript clean                                                         | `npx tsc --noEmit`, checked after every task                                                       |
| ESLint clean                                                             | `npx eslint . --max-warnings 0`                                                                    |
| Build clean                                                              | `npm run build`; `/admin`, `/admin/users`, `/admin/meetup-spots` all appear in the route manifest  |

## Verification (end-to-end, after all tasks)

```bash
npx tsc --noEmit
npx eslint app lib components e2e types --max-warnings 0
npx vitest run --exclude 'e2e/**' --exclude 'node_modules/**' --exclude '.claude/**'
npm run build
npx supabase db query --linked --file supabase/tests/phase6_trust_safety_rls.sql --output-format json
npx playwright test e2e/reviews.spec.ts e2e/admin-moderation.spec.ts e2e/deal-room.spec.ts e2e/deal-room-cancellation.spec.ts
```

Expected: all green. Check whether this working directory still needs the `vitest`/`eslint` scoping flags from Phase 4/5's history (a nested worktree under `.claude/worktrees/` shadowing the default excludes) — drop them if the environment implementing this plan doesn't have that same nesting.
