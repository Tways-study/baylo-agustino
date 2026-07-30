# Phase 1 — Identity & Verification Design

**Date:** 2026-07-31
**Status:** Approved
**Scope:** Only Agustinians get in.

---

## Context

Phase 0 shipped the visual shell. Phase 1 makes it a real app: only students with a `@usa.edu.ph` address can create an account. The enforcement is two-layered (Server Action + database trigger) so the gate cannot be bypassed by calling the API directly. Onboarding collects the minimum profile data needed to make a listing trustworthy (name, program, year, avatar, house rules acceptance).

---

## Route Structure

```
app/
  (auth)/
    layout.tsx              — no BottomNav; centered single-column layout
    login/
      page.tsx              — email input → OTP input (inline state, single URL)
    onboarding/
      page.tsx              — 5-step wizard, multi-step single page
    suspended/
      page.tsx              — suspension interstitial
  (app)/
    layout.tsx              — BottomNav, ribbon header slot (existing shell)
    page.tsx                — Baylohan (existing)
    ...                     — future protected routes
middleware.ts               — route protection for the whole app
```

---

## Auth Flow — `/login`

Single page, two inline states: **email state** and **OTP state**.

### Email state

- Wordmark + tagline at top
- Email input (`type="email"`, `inputmode="email"`, `autocomplete="email"`)
- "Send code" button (crimson primary)
- Server Action `sendOtp(email)`:
  1. Zod validates format
  2. Checks `email.endsWith('@usa.edu.ph')` — returns `{ error: 'Only @usa.edu.ph addresses can join.' }` if not
  3. Calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
- On success: fade out email state, fade in OTP state (CSS transition, no navigation)

### OTP state

- "Check your inbox" headline
- Masked email shown (e.g. `t***@usa.edu.ph`)
- 6-digit OTP input (single `<input type="text" inputmode="numeric" maxlength="6">` — do NOT use 6 separate inputs; they are inaccessible and fragile on Android)
- Auto-submit when 6 digits are entered
- Server Action `verifyOtp(email, token)`:
  1. Calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`
  2. On error: inline error message, clear input
  3. On success: middleware picks up the new session and redirects
- "Resend code" link (rate-limited: disabled for 60s after send)

### After OTP verification

Middleware redirects:

- No profile row → `/onboarding`
- Profile exists and `verified_at` is set → `/` (Baylohan)

---

## Middleware — `middleware.ts`

Runs on every request to `/(app)/**` routes.

```
Request comes in
  → createServerClient, getUser()
  → No session? → redirect /login
  → Has session:
      → query profiles where id = auth.uid()
      → No profile row OR verified_at IS NULL? → redirect /onboarding
      → is_suspended = true? → redirect /suspended
      → Pass through
```

Matcher config:

```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)'],
}
```

Auth routes (`/login`, `/onboarding`, `/suspended`) are excluded from protection but redirect to `/` if already authenticated and verified.

---

## Onboarding Flow — `/onboarding`

Multi-step wizard, single `/onboarding` URL, step state in React (`useState`). No routing between steps — no back/forward browser issues.

Progress indicator: step dots (1–5) at top, current step highlighted in crimson.

### Step 1 — Display name

- Label: "What should we call you?"
- Input: text, 2–40 chars, Zod validates on submit
- Hint: "This is what other Agustinians see. Real names build trust."

### Step 2 — Program

- Label: "What are you studying?"
- Input: text, free-form (e.g. `BSIT`, `BSA`, `BS Nursing`)
- Hint: "Abbreviation is fine."
- Optional but encouraged; can be skipped

### Step 3 — Year level

- Label: "What year are you in?"
- Control: segmented buttons 1–6, single-select
- Optional; can be skipped

### Step 4 — Avatar

- Label: "Add a photo so people know it's you."
- Tap area: outlined square with camera icon, shows preview after pick
- Pipeline: `<input type="file" accept="image/*" capture="user">` → `browser-image-compression` (maxSizeMB: 0.2, maxWidthOrHeight: 400, useWebWorker: true, fileType: 'image/webp') → strips EXIF automatically → upload to `avatars/{user_id}/avatar.webp`
- Optional; shows initials fallback if skipped
- Upload happens on step submit (not on file pick), with progress indicator

### Step 5 — House rules

- Label: "The rules of the floor."
- Scrollable list of house rules (sourced from `HOUSE_RULES_V1` constant in `lib/auth/house-rules.ts`)
- Checkbox: "I've read these and I'm in."
- On submit:
  1. Upsert `profiles` row with all collected data, set `verified_at = now()`
  2. Insert `policy_acceptances` row (`user_id`, `policy_version = 1`, `accepted_at = now()`)
  3. Redirect to `/` (Baylohan)

### Server Action `completeOnboarding(data)`

- Zod schema validates all fields
- Single DB transaction: upsert profile + insert policy_acceptance
- Returns error if profile already exists with `verified_at` set (replay attack guard)

---

## Suspended Interstitial — `/suspended`

Simple screen:

- Stamp component with "Suspended" label
- Headline: "Your account has been suspended."
- Body: explains what to do (contact the admin, cite the rule violated if known)
- No BottomNav, no other actions

Middleware redirects here if `profiles.is_suspended = true`. The user cannot navigate past this screen until suspension is lifted by an admin (Phase 6).

---

## Database Migration

Single file: `supabase/migrations/20260731000000_phase1_identity.sql`

Table + RLS + triggers in one file. No split.

### Tables

```sql
-- meetup_spots placeholder (needed for FK in listings, Phase 2)
create table public.meetup_spots (
  id smallint primary key,
  name text not null,
  hint text,
  is_camera_covered boolean not null default false,
  active boolean not null default true
);
alter table public.meetup_spots enable row level security;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  program text,
  year_level smallint check (year_level between 1 and 6),
  avatar_url text,
  bio text check (char_length(bio) <= 160),
  verified_at timestamptz,
  trust_score numeric(3,2) not null default 0,
  show_up_rate numeric(4,3),
  completed_deals integer not null default 0,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- policy_acceptances
create table public.policy_acceptances (
  id bigserial primary key,
  user_id uuid not null references public.profiles on delete cascade,
  policy_version integer not null,
  accepted_at timestamptz not null default now()
);
alter table public.policy_acceptances enable row level security;
```

### Column-level security

Revoke write access on sensitive columns from the `authenticated` role:

```sql
revoke update (verified_at, trust_score, show_up_rate, is_suspended, completed_deals)
  on public.profiles from authenticated;
```

### RLS policies

```sql
-- profiles: readable by verified members who haven't blocked you
create policy "profiles readable by verified members"
  on public.profiles for select
  using (
    auth.uid() is not null
    and not exists (
      select 1 from public.blocks
      where blocker_id = profiles.id and blocked_id = auth.uid()
    )
  );

-- profiles: own row insert during onboarding
create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- profiles: own row update (restricted columns enforced by column-level revoke)
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- policy_acceptances: users insert their own
create policy "users insert own acceptance"
  on public.policy_acceptances for insert
  with check (auth.uid() = user_id);

-- policy_acceptances: users read their own
create policy "users read own acceptance"
  on public.policy_acceptances for select
  using (auth.uid() = user_id);

-- meetup_spots: readable by all authenticated users
create policy "meetup spots readable by authenticated"
  on public.meetup_spots for select
  using (auth.uid() is not null);
```

### Domain gate trigger

```sql
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (new.email like '%@usa.edu.ph') then
    raise exception 'Only @usa.edu.ph addresses are allowed.';
  end if;
  return new;
end;
$$;

create trigger enforce_email_domain_on_insert
  before insert on auth.users
  for each row execute function public.enforce_email_domain();
```

Note: `SECURITY DEFINER` with `SET search_path = ''` — required by engineering rules.

### Blocks table placeholder (needed for profiles RLS policy)

```sql
create table public.blocks (
  blocker_id uuid references public.profiles on delete cascade,
  blocked_id uuid references public.profiles on delete cascade,
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;

create policy "users manage own blocks"
  on public.blocks for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);
```

---

## Storage

New bucket: `avatars`

```sql
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false);

create policy "users upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar readable by authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
```

---

## pgTAP Tests

File: `supabase/tests/phase1_rls.sql`

Tests to prove:

1. `@gmail.com` email triggers the domain gate and raises an exception
2. `authenticated` user cannot UPDATE another user's profile row
3. `authenticated` user cannot write `verified_at` (column-level revoke)
4. `authenticated` user cannot write `is_suspended`
5. User can INSERT their own profile row
6. User can read any profile (that hasn't blocked them)

---

## Server-Side Helpers

```
lib/
  supabase/
    client.ts        — existing (browser)
    server.ts        — existing (server)
  auth/
    actions.ts       — sendOtp(), verifyOtp(), completeOnboarding() Server Actions
    schemas.ts       — Zod schemas for all auth inputs
    session.ts       — getAuthUser() server helper (typed, throws if no session)
    house-rules.ts   — HOUSE_RULES_V1 constant (array of rule strings, versioned)
```

---

## Env Variables Added

```
ALLOWED_EMAIL_DOMAIN=usa.edu.ph
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Acceptance Criteria

| Criterion                                         | Proof                                             |
| ------------------------------------------------- | ------------------------------------------------- |
| `@gmail.com` blocked even via direct API          | pgTAP test passes                                 |
| User cannot UPDATE another user's profile         | pgTAP test passes                                 |
| `verified_at` cannot be set by authenticated role | pgTAP test passes                                 |
| Onboarding < 60s on mid-range Android             | Manual timing on dev build                        |
| Middleware redirects unauthed to `/login`         | `curl` or Playwright check                        |
| Suspended user sees interstitial                  | Manual test with `is_suspended = true` via Studio |
| TypeScript clean                                  | `tsc --noEmit` exits 0                            |
| ESLint clean                                      | `eslint . --max-warnings 0` exits 0               |
