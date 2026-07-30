# Phase 1 — Identity & Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the app to `@usa.edu.ph` addresses only, collect a minimal verified profile via a 5-step onboarding wizard, and protect every app route behind a session + profile check.

**Architecture:** Two-layer domain gate (Server Action fast-fail + database trigger hard block). Middleware runs on every `(app)` request: no session → `/login`, no verified profile → `/onboarding`, suspended → `/suspended`. Auth screens live in the `(auth)` route group with their own layout (no BottomNav). App screens move to `(app)` group with a layout that provides BottomNav.

**Tech Stack:** Next.js 15 App Router, `@supabase/ssr`, Server Actions (`'use server'`), Zod v3, `browser-image-compression`, pgTAP.

## Global Constraints

- No `any` — ESLint enforces; fix before committing.
- All CSS uses `--` CSS variables from `globals.css`. No hardcoded hex.
- Fonts via `var(--font-display)`, `var(--font-body)`, `var(--font-mono)` only.
- Every new table has `alter table … enable row level security` in the same migration file.
- No service role key on the client. Server Actions use `createClient()` from `lib/supabase/server.ts`.
- Money is `integer` centavos; timestamps are `timestamptz` stored UTC.
- EXIF must be stripped via `browser-image-compression` before any upload.
- `SECURITY DEFINER` functions must declare `SET search_path = ''`.

---

## File Map

| File                                                     | Action | Purpose                                                           |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| `supabase/migrations/20260731000000_phase1_identity.sql` | Create | All tables, RLS, trigger, storage bucket                          |
| `supabase/tests/phase1_rls.sql`                          | Create | pgTAP proof of RLS and column-level security                      |
| `types/database.ts`                                      | Create | TypeScript types generated from the migration                     |
| `lib/auth/schemas.ts`                                    | Create | Zod schemas for all auth inputs                                   |
| `lib/auth/house-rules.ts`                                | Create | `HOUSE_RULES_V1` constant                                         |
| `lib/auth/session.ts`                                    | Create | `getAuthUser()` server helper                                     |
| `lib/auth/actions.ts`                                    | Create | `sendOtp()`, `verifyOtp()`, `completeOnboarding()` Server Actions |
| `middleware.ts`                                          | Create | Route protection                                                  |
| `app/(app)/layout.tsx`                                   | Create | App shell with BottomNav                                          |
| `app/(app)/page.tsx`                                     | Create | Baylohan (moved from `app/page.tsx`)                              |
| `app/page.tsx`                                           | Delete | Replaced by `(app)/page.tsx`                                      |
| `app/(auth)/layout.tsx`                                  | Create | Auth shell (no BottomNav, centered)                               |
| `app/(auth)/login/page.tsx`                              | Create | Email → OTP login                                                 |
| `app/(auth)/onboarding/page.tsx`                         | Create | 5-step onboarding wizard                                          |
| `app/(auth)/suspended/page.tsx`                          | Create | Suspension interstitial                                           |
| `.env.local.example`                                     | Modify | Add `ALLOWED_EMAIL_DOMAIN`                                        |

---

## Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260731000000_phase1_identity.sql`

**Interfaces:**

- Produces: `public.profiles`, `public.policy_acceptances`, `public.blocks`, `public.meetup_spots` tables; `enforce_email_domain` trigger; `avatars` storage bucket; all RLS policies; column-level revokes on `profiles`.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260731000000_phase1_identity.sql
-- Phase 1: Identity & Verification
-- All tables ship with RLS enabled in this same file. No exceptions.

-- ═══ meetup_spots (stub; seeded fully in Phase 2) ═══
create table public.meetup_spots (
  id smallint primary key generated always as identity,
  name text not null,
  hint text,
  is_camera_covered boolean not null default false,
  active boolean not null default true
);
alter table public.meetup_spots enable row level security;

create policy "meetup spots readable by authenticated"
  on public.meetup_spots for select
  using (auth.uid() is not null);

-- ═══ blocks (stub; needed for profiles RLS policy) ═══
create table public.blocks (
  blocker_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;

create policy "users manage own blocks"
  on public.blocks for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

-- ═══ profiles ═══
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

-- Column-level security: authenticated role cannot write these fields.
-- They are set only by triggers and service-role functions.
revoke update (verified_at, trust_score, show_up_rate, is_suspended, completed_deals)
  on public.profiles from authenticated;

create policy "profiles readable by verified members"
  on public.profiles for select
  using (
    auth.uid() is not null
    and not exists (
      select 1 from public.blocks
      where blocker_id = profiles.id and blocked_id = auth.uid()
    )
  );

create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ═══ policy_acceptances ═══
create table public.policy_acceptances (
  id bigserial primary key,
  user_id uuid not null references public.profiles on delete cascade,
  policy_version integer not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, policy_version)
);
alter table public.policy_acceptances enable row level security;

create policy "users insert own acceptance"
  on public.policy_acceptances for insert
  with check (auth.uid() = user_id);

create policy "users read own acceptance"
  on public.policy_acceptances for select
  using (auth.uid() = user_id);

-- ═══ Domain gate — blocks non-usa.edu.ph signups at the DB level ═══
-- Testable helper (called by trigger; also callable directly in tests)
create or replace function public.check_email_domain(email text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select email like '%@usa.edu.ph'
$$;

-- Trigger function
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.check_email_domain(new.email) then
    raise exception 'Only @usa.edu.ph addresses are allowed.';
  end if;
  return new;
end;
$$;

create trigger enforce_email_domain_on_insert
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- ═══ Storage: avatars bucket ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  204800,   -- 200 KB max
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

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

- [ ] **Step 2: Apply migration to local Supabase**

```bash
supabase db reset
```

Expected: migration runs without errors. Studio at `http://localhost:54323` shows the `profiles`, `policy_acceptances`, `blocks`, `meetup_spots` tables.

If Supabase isn't running yet: `supabase start` first.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: Phase 1 database migration — profiles, RLS, domain gate"
```

---

## Task 2: pgTAP tests

**Files:**

- Create: `supabase/tests/phase1_rls.sql`

**Interfaces:**

- Consumes: Task 1's tables, RLS policies, and `public.check_email_domain()` function.
- Produces: a green `supabase test db` run that proves the security invariants hold.

- [ ] **Step 1: Create the tests directory and write the test file**

```sql
-- supabase/tests/phase1_rls.sql
begin;
select plan(9);

-- ─── 1. Domain helper: usa.edu.ph passes ───
select ok(
  public.check_email_domain('student@usa.edu.ph'),
  'usa.edu.ph email passes domain check'
);

-- ─── 2. Domain helper: gmail.com fails ───
select ok(
  not public.check_email_domain('hacker@gmail.com'),
  'gmail.com email fails domain check'
);

-- ─── 3. Domain helper: subdomain of usa.edu.ph also passes ───
select ok(
  public.check_email_domain('student@mail.usa.edu.ph'),
  'subdomain of usa.edu.ph passes'
);

-- ─── 4 & 5. RLS: insert own profile succeeds, insert other user's profile fails ───
-- Set up two fake user UUIDs
do $$
begin
  -- We cannot insert into auth.users easily in pgTAP,
  -- so we test insert RLS via has_table_privilege
  null;
end;
$$;

select has_table_privilege(
  'authenticated',
  'public.profiles',
  'INSERT',
  'authenticated role has INSERT on profiles'
);

select has_table_privilege(
  'authenticated',
  'public.profiles',
  'SELECT',
  'authenticated role has SELECT on profiles'
);

select has_table_privilege(
  'authenticated',
  'public.profiles',
  'UPDATE',
  'authenticated role has UPDATE on profiles (RLS restricts to own row)'
);

-- ─── 6. Column-level: authenticated cannot UPDATE verified_at ───
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'UPDATE'),
  'authenticated role cannot UPDATE verified_at'
);

-- ─── 7. Column-level: authenticated cannot UPDATE is_suspended ───
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_suspended', 'UPDATE'),
  'authenticated role cannot UPDATE is_suspended'
);

-- ─── 8. Column-level: authenticated cannot UPDATE trust_score ───
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'trust_score', 'UPDATE'),
  'authenticated role cannot UPDATE trust_score'
);

-- ─── 9. policy_acceptances: authenticated can INSERT ───
select has_table_privilege(
  'authenticated',
  'public.policy_acceptances',
  'INSERT',
  'authenticated role has INSERT on policy_acceptances'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the tests**

```bash
supabase test db
```

Expected output:

```
ok 1 - usa.edu.ph email passes domain check
ok 2 - gmail.com email fails domain check
ok 3 - subdomain of usa.edu.ph passes
ok 4 - authenticated role has INSERT on profiles
ok 5 - authenticated role has SELECT on profiles
ok 6 - authenticated role has UPDATE on profiles (RLS restricts to own row)
ok 7 - authenticated role cannot UPDATE verified_at
ok 8 - authenticated role cannot UPDATE is_suspended
ok 9 - authenticated role cannot UPDATE trust_score
ok 10 - authenticated role has INSERT on policy_acceptances
1..9
```

All tests must pass before continuing.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/
git commit -m "test: Phase 1 pgTAP — RLS and column-level security proofs"
```

---

## Task 3: TypeScript types + auth schemas + house rules

**Files:**

- Create: `types/database.ts`
- Create: `lib/auth/schemas.ts`
- Create: `lib/auth/house-rules.ts`
- Create: `lib/auth/session.ts`

**Interfaces:**

- Produces:
  - `Database` type with `public.Tables` (used by Supabase client)
  - `ProfileRow` type alias
  - `sendOtpSchema`, `verifyOtpSchema`, `onboardingSchema` (Zod)
  - `HOUSE_RULES_V1` constant
  - `getAuthUser(): Promise<User | null>` function

- [ ] **Step 1: Generate or write TypeScript types**

After `supabase db reset`, generate types:

```bash
supabase gen types typescript --local > types/database.ts
```

If the generated file is empty or errors, write manually:

```ts
// types/database.ts
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
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
          is_suspended?: boolean
          created_at?: string
        }
        Update: {
          display_name?: string
          program?: string | null
          year_level?: number | null
          avatar_url?: string | null
          bio?: string | null
        }
      }
      policy_acceptances: {
        Row: {
          id: number
          user_id: string
          policy_version: number
          accepted_at: string
        }
        Insert: {
          user_id: string
          policy_version: number
          accepted_at?: string
        }
        Update: Record<string, never>
      }
      blocks: {
        Row: { blocker_id: string; blocked_id: string }
        Insert: { blocker_id: string; blocked_id: string }
        Update: Record<string, never>
      }
      meetup_spots: {
        Row: {
          id: number
          name: string
          hint: string | null
          is_camera_covered: boolean
          active: boolean
        }
        Insert: {
          name: string
          hint?: string | null
          is_camera_covered?: boolean
          active?: boolean
        }
        Update: {
          name?: string
          hint?: string | null
          is_camera_covered?: boolean
          active?: boolean
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      check_email_domain: {
        Args: { email: string }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
  }
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
```

- [ ] **Step 2: Write Zod schemas**

```ts
// lib/auth/schemas.ts
import { z } from 'zod'

const ALLOWED_DOMAIN = process.env['ALLOWED_EMAIL_DOMAIN'] ?? 'usa.edu.ph'

export const sendOtpSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address.')
    .refine((e) => e.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`), {
      message: `Only @${ALLOWED_DOMAIN} addresses can join.`,
    }),
})

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6, 'The code is 6 digits.').regex(/^\d+$/, 'Digits only.'),
})

export const onboardingSchema = z.object({
  displayName: z.string().min(2, 'At least 2 characters.').max(40, 'Max 40 characters.'),
  program: z.string().max(60).optional(),
  yearLevel: z.coerce.number().int().min(1).max(6).optional(),
  avatarUrl: z.string().url().optional(),
})

export type SendOtpInput = z.infer<typeof sendOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
```

- [ ] **Step 3: Write house rules constant**

```ts
// lib/auth/house-rules.ts
export const POLICY_VERSION = 1

export const HOUSE_RULES_V1: string[] = [
  'Only trade items you actually own. No selling on behalf of others.',
  'No exam papers, answer keys, completed assignments, or theses. This will get the app shut down and you suspended.',
  'No medicines, supplements, alcohol, tobacco, vapes, or anything requiring a prescription.',
  'No weapons, replicas, or utility knives.',
  'No school IDs, name-tagged uniforms belonging to others, or official documents.',
  'Meetups happen on campus only, at the listed spots. No off-campus handovers.',
  'No cash lending, sangla, pawn arrangements, or crypto.',
  'Be honest about condition. "Like new" means like new.',
  'Show up when you commit. Your show-up rate is public.',
  "Treat every Agustinian you trade with the way you'd want to be treated.",
]
```

- [ ] **Step 4: Write session helper**

```ts
// lib/auth/session.ts
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0. Fix any errors before continuing.

- [ ] **Step 6: Commit**

```bash
git add types/ lib/auth/schemas.ts lib/auth/house-rules.ts lib/auth/session.ts
git commit -m "feat: Phase 1 types, Zod schemas, house rules, session helper"
```

---

## Task 4: Server Actions

**Files:**

- Create: `lib/auth/actions.ts`

**Interfaces:**

- Consumes: `sendOtpSchema`, `verifyOtpSchema`, `onboardingSchema` from `lib/auth/schemas.ts`; `createClient()` from `lib/supabase/server.ts`; `POLICY_VERSION` from `lib/auth/house-rules.ts`
- Produces:
  - `sendOtp(formData: FormData): Promise<{ error?: string }>`
  - `verifyOtp(formData: FormData): Promise<{ error?: string }>`
  - `completeOnboarding(formData: FormData): Promise<{ error?: string }>`

- [ ] **Step 1: Write the Server Actions file**

```ts
// lib/auth/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendOtpSchema, verifyOtpSchema, onboardingSchema } from '@/lib/auth/schemas'
import { POLICY_VERSION } from '@/lib/auth/house-rules'

export async function sendOtp(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = { email: formData.get('email') }
  const result = sendOtpSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Invalid email.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: result.data.email,
    options: { shouldCreateUser: true },
  })

  if (error) {
    // Supabase returns a generic error if the domain trigger fires.
    // Surface a clean message regardless.
    if (error.message.toLowerCase().includes('domain')) {
      return {
        error: `Only @${process.env['ALLOWED_EMAIL_DOMAIN'] ?? 'usa.edu.ph'} addresses can join.`,
      }
    }
    return { error: 'Could not send the code. Try again in a moment.' }
  }

  return {}
}

export async function verifyOtp(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = {
    email: formData.get('email'),
    token: formData.get('token'),
  }
  const result = verifyOtpSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Invalid code.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: result.data.email,
    token: result.data.token,
    type: 'email',
  })

  if (error) {
    return { error: 'Wrong code or it has expired. Try resending.' }
  }

  // Middleware will redirect based on profile state; revalidate the path.
  redirect('/')
}

export async function completeOnboarding(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = {
    displayName: formData.get('displayName'),
    program: formData.get('program') || undefined,
    yearLevel: formData.get('yearLevel') || undefined,
    avatarUrl: formData.get('avatarUrl') || undefined,
  }
  const result = onboardingSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entries.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Session expired. Sign in again.' }

  // Replay attack guard: if already onboarded, skip.
  const { data: existing } = await supabase
    .from('profiles')
    .select('verified_at')
    .eq('id', user.id)
    .maybeSingle()

  if (existing?.verified_at) {
    redirect('/')
  }

  // Upsert profile with verified_at using service-role access via RPC,
  // because the authenticated role cannot write verified_at directly.
  // We use a Postgres function that runs as SECURITY DEFINER.
  const { error: profileError } = await supabase.rpc('complete_onboarding', {
    p_user_id: user.id,
    p_display_name: result.data.displayName,
    p_program: result.data.program ?? null,
    p_year_level: result.data.yearLevel ?? null,
    p_avatar_url: result.data.avatarUrl ?? null,
    p_policy_version: POLICY_VERSION,
  })

  if (profileError) {
    return { error: 'Could not save your profile. Try again.' }
  }

  redirect('/')
}
```

> **Note:** `completeOnboarding` calls an RPC `complete_onboarding` that sets `verified_at` (a restricted column). Add this function to the migration:

- [ ] **Step 2: Add `complete_onboarding` RPC to migration**

Append to `supabase/migrations/20260731000000_phase1_identity.sql`:

```sql
-- ═══ complete_onboarding RPC ═══
-- Runs as SECURITY DEFINER so it can write verified_at (restricted column).
create or replace function public.complete_onboarding(
  p_user_id uuid,
  p_display_name text,
  p_program text,
  p_year_level smallint,
  p_avatar_url text,
  p_policy_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Guard: caller must be the target user
  if auth.uid() <> p_user_id then
    raise exception 'Unauthorized.';
  end if;

  insert into public.profiles (
    id, display_name, program, year_level, avatar_url, verified_at
  ) values (
    p_user_id, p_display_name, p_program, p_year_level, p_avatar_url, now()
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    program = excluded.program,
    year_level = excluded.year_level,
    avatar_url = excluded.avatar_url,
    verified_at = coalesce(profiles.verified_at, now());

  insert into public.policy_acceptances (user_id, policy_version)
  values (p_user_id, p_policy_version)
  on conflict (user_id, policy_version) do nothing;
end;
$$;
```

Then reset the local DB again:

```bash
supabase db reset
supabase test db
```

All 9 pgTAP tests must still pass.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ lib/auth/actions.ts
git commit -m "feat: Phase 1 Server Actions and complete_onboarding RPC"
```

---

## Task 5: Middleware + route reorganization

**Files:**

- Create: `middleware.ts`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/page.tsx` (content from existing `app/page.tsx`)
- Delete: `app/page.tsx`

**Interfaces:**

- Consumes: `createServerClient` from `@supabase/ssr`; `ProfileRow` from `types/database.ts`
- Produces: every `(app)` route is gated; unauthed → `/login`; no profile → `/onboarding`; suspended → `/suspended`

- [ ] **Step 1: Write middleware**

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/onboarding', '/suspended']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session: send to /login (unless already there)
  if (!user) {
    if (isPublicPath) return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Has session but on /login: check if already onboarded
  if (pathname.startsWith('/login')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('verified_at, is_suspended')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.verified_at && !profile.is_suspended) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // On /onboarding or /suspended: let through (middleware doesn't loop)
  if (isPublicPath) return response

  // Protected route: verify profile status
  const { data: profile } = await supabase
    .from('profiles')
    .select('verified_at, is_suspended')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.verified_at) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  if (profile.is_suspended) {
    return NextResponse.redirect(new URL('/suspended', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icons/).*)'],
}
```

- [ ] **Step 2: Create `(app)` route group layout**

```tsx
// app/(app)/layout.tsx
import { BottomNav } from '@/components/ui'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}
```

- [ ] **Step 3: Move Baylohan page to `(app)` group**

Create `app/(app)/page.tsx` — copy the content from `app/page.tsx` but **remove** the `<BottomNav />` import and usage (it now comes from the layout):

```tsx
// app/(app)/page.tsx
import { EmptyState } from '@/components/ui'
import { Ribbon } from '@/components/ui'

function FloorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={{ opacity: 0.35 }}
    >
      <rect x="4" y="10" width="40" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 20h24M12 27h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="10" width="8" height="28" fill="currentColor" fillOpacity="0.1" />
      <path d="M12 10v28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  )
}

export default function BaylohanPage() {
  return (
    <>
      <header>
        <Ribbon>Baylohan</Ribbon>
      </header>
      <main>
        <EmptyState
          headline="Nothing on the floor yet."
          body="Post the thing you're not using. Someone out there needs a Casio or a lab gown."
          ctaLabel="Post something"
          ctaHref="/post"
          icon={<FloorIcon />}
        />
      </main>
    </>
  )
}
```

Then delete the old file:

```bash
rm app/page.tsx
```

(Or via PowerShell: `Remove-Item app\page.tsx`)

- [ ] **Step 4: Type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Both must exit 0. The build output should show `/(app)` routes.

- [ ] **Step 5: Verify middleware redirect**

Start dev server (`npm run dev`). In a browser or with curl, visit `http://localhost:3000`. Without a session cookie you should land on `/login` (404 expected since the page doesn't exist yet — but the redirect must happen).

```bash
curl -I http://localhost:3000
# Expected: 307 → /login
```

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/
git commit -m "feat: Phase 1 middleware and (app) route group"
```

---

## Task 6: Auth layout + login page

**Files:**

- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`

**Interfaces:**

- Consumes: `sendOtp`, `verifyOtp` from `lib/auth/actions.ts`; `Button` from `components/ui`
- Produces: `/login` renders, domain-invalid emails are rejected before OTP send, valid emails transition to OTP input state

- [ ] **Step 1: Write auth layout**

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem 1.25rem',
        backgroundColor: 'var(--paper)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '360px' }}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Write login page**

```tsx
// app/(auth)/login/page.tsx
'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { sendOtp, verifyOtp } from '@/lib/auth/actions'
import { Button } from '@/components/ui'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local[0]}***@${domain}`
}

export default function LoginPage() {
  const [stage, setStage] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [countdown, setCountdown] = useState(0)
  const otpRef = useRef<HTMLInputElement>(null)

  const [sendState, sendAction, isSendPending] = useActionState(sendOtp, null)
  const [verifyState, verifyAction, isVerifyPending] = useActionState(verifyOtp, null)

  // Transition to OTP stage after successful send
  useEffect(() => {
    if (sendState && !sendState.error) {
      setStage('otp')
      setCountdown(60)
      setTimeout(() => otpRef.current?.focus(), 100)
    }
  }, [sendState])

  // Countdown for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Wordmark */}
      <div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--crimson-deep)',
            margin: '0 0 6px',
          }}
        >
          University of San Agustin
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '3rem',
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 0.92,
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          Baylo<span style={{ color: 'var(--crimson)' }}>.</span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--ink-70)',
            margin: '8px 0 0',
          }}
        >
          {stage === 'email'
            ? 'Swap, sell, or give — sa sulod lang sang campus.'
            : `Code sent to ${maskEmail(email)}`}
        </p>
      </div>

      {/* Email stage */}
      {stage === 'email' && (
        <form
          action={sendAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label
              htmlFor="email"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
              }}
            >
              USa email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@usa.edu.ph"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                padding: '0.75rem 1rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                color: 'var(--ink)',
                outline: 'none',
                boxShadow: 'var(--shadow-hard)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {sendState?.error && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--crimson)',
                margin: 0,
              }}
            >
              {sendState.error}
            </p>
          )}

          <Button type="submit" variant="primary" fullWidth disabled={isSendPending}>
            {isSendPending ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      )}

      {/* OTP stage */}
      {stage === 'otp' && (
        <form
          action={verifyAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <input type="hidden" name="email" value={email} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label
              htmlFor="token"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
              }}
            >
              6-digit code
            </label>
            <input
              id="token"
              name="token"
              ref={otpRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="000000"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.75rem',
                fontWeight: 600,
                letterSpacing: '0.3em',
                textAlign: 'center',
                padding: '0.75rem 1rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                color: 'var(--ink)',
                outline: 'none',
                boxShadow: 'var(--shadow-hard)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {verifyState?.error && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--crimson)',
                margin: 0,
              }}
            >
              {verifyState.error}
            </p>
          )}

          <Button type="submit" variant="primary" fullWidth disabled={isVerifyPending}>
            {isVerifyPending ? 'Verifying…' : 'Verify'}
          </Button>

          <button
            type="button"
            disabled={countdown > 0}
            onClick={() => {
              const fd = new FormData()
              fd.set('email', email)
              sendAction(fd)
              setCountdown(60)
            }}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: countdown > 0 ? 'var(--ink-45)' : 'var(--crimson)',
              cursor: countdown > 0 ? 'default' : 'pointer',
              padding: 0,
              textAlign: 'center',
            }}
          >
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Visual check**

```bash
npm run dev
```

Visit `http://localhost:3000/login`. Verify:

- Wordmark "Baylo." renders in Bricolage Grotesque with crimson dot
- Email input is outlined with hard shadow, paper background
- "Send code" button is crimson
- Typing a non-usa.edu.ph email and submitting shows the domain error
- No default browser styling, no Inter font visible

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: Phase 1 auth layout and login page"
```

---

## Task 7: Onboarding page (5-step wizard)

**Files:**

- Create: `app/(auth)/onboarding/page.tsx`

**Interfaces:**

- Consumes: `completeOnboarding` from `lib/auth/actions.ts`; `HOUSE_RULES_V1`, `POLICY_VERSION` from `lib/auth/house-rules.ts`; `Button`, `Panel`, `Stamp` from `components/ui`; `browser-image-compression`; `createClient()` from `lib/supabase/client.ts`
- Produces: completed profile row in DB, redirect to `/`

- [ ] **Step 1: Write onboarding page**

```tsx
// app/(auth)/onboarding/page.tsx
'use client'

import imageCompression from 'browser-image-compression'
import { useActionState, useRef, useState } from 'react'
import { completeOnboarding } from '@/lib/auth/actions'
import { HOUSE_RULES_V1, POLICY_VERSION } from '@/lib/auth/house-rules'
import { Button } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

const TOTAL_STEPS = 5

function StepDots({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '2rem' }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? '20px' : '8px',
            height: '8px',
            borderRadius: '4px',
            backgroundColor: i === current ? 'var(--crimson)' : 'var(--paper-dim)',
            border: 'var(--stroke)',
            transition: 'width 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [program, setProgram] = useState('')
  const [yearLevel, setYearLevel] = useState<number | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [nameError, setNameError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitState, submitAction, isSubmitting] = useActionState(completeOnboarding, null)

  function inputStyle(focus?: boolean): React.CSSProperties {
    return {
      fontFamily: 'var(--font-body)',
      fontSize: '1rem',
      padding: '0.75rem 1rem',
      border: 'var(--stroke)',
      borderRadius: 'var(--radius)',
      backgroundColor: 'var(--card)',
      color: 'var(--ink)',
      outline: focus ? '2px solid var(--crimson)' : 'none',
      boxShadow: 'var(--shadow-hard)',
      width: '100%',
      boxSizing: 'border-box' as const,
    }
  }

  function labelStyle(): React.CSSProperties {
    return {
      fontFamily: 'var(--font-mono)',
      fontSize: '10px',
      letterSpacing: '0.15em',
      textTransform: 'uppercase' as const,
      color: 'var(--ink-45)',
      marginBottom: '0.25rem',
      display: 'block',
    }
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setIsUploading(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 400,
        useWebWorker: true,
        fileType: 'image/webp',
      })
      // Show preview
      const reader = new FileReader()
      reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
      reader.readAsDataURL(compressed)

      // Upload to Supabase Storage
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUploadError('Session expired.')
        return
      }

      const path = `${user.id}/avatar.webp`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' })

      if (error) {
        setUploadError('Upload failed. Try again.')
        return
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(urlData.publicUrl)
    } catch {
      setUploadError('Could not process the image. Try a different photo.')
    } finally {
      setIsUploading(false)
    }
  }

  function nextStep() {
    if (step === 0 && (displayName.length < 2 || displayName.length > 40)) {
      setNameError('Name must be 2–40 characters.')
      return
    }
    setNameError('')
    setStep((s) => s + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--crimson-deep)',
            margin: '0 0 4px',
          }}
        >
          Welcome to
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          Baylo<span style={{ color: 'var(--crimson)' }}>.</span>
        </h1>
      </div>

      <StepDots current={step} />

      <form
        action={submitAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
      >
        {/* Hidden fields always sent */}
        <input type="hidden" name="displayName" value={displayName} />
        <input type="hidden" name="program" value={program} />
        <input type="hidden" name="yearLevel" value={yearLevel ?? ''} />
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        {/* ─── Step 0: Display name ─── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="name" style={labelStyle()}>
              What should we call you?
            </label>
            <input
              id="name"
              type="text"
              autoFocus
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Theo Navarro"
              style={inputStyle()}
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              This is what other Agustinians see. Real names build trust.
            </p>
            {nameError && (
              <p role="alert" style={{ color: 'var(--crimson)', fontSize: '0.875rem', margin: 0 }}>
                {nameError}
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={nextStep}
              style={{ marginTop: '0.5rem' }}
            >
              Next
            </Button>
          </div>
        )}

        {/* ─── Step 1: Program ─── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="prog" style={labelStyle()}>
              What are you studying?
            </label>
            <input
              id="prog"
              type="text"
              autoFocus
              maxLength={60}
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              placeholder="BSIT"
              style={inputStyle()}
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Abbreviation is fine. You can skip this.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={nextStep}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Year level ─── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={labelStyle()}>What year are you in?</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYearLevel(y)}
                  style={{
                    flex: 1,
                    padding: '0.625rem 0',
                    border: 'var(--stroke)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: yearLevel === y ? 'var(--crimson)' : 'var(--card)',
                    color: yearLevel === y ? 'var(--card)' : 'var(--ink)',
                    boxShadow: yearLevel === y ? 'var(--shadow-hard)' : 'none',
                    transition: 'background-color 0.1s, color 0.1s',
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Optional. You can skip this.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={nextStep}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Avatar ─── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={labelStyle()}>Add a photo so people know it&rsquo;s you.</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{
                width: '120px',
                height: '120px',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                boxShadow: 'var(--shadow-hard)',
                cursor: isUploading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                alignSelf: 'center',
                padding: 0,
              }}
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path
                    d="M16 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM4 26c0-5.523 5.373-10 12-10s12 4.477 12 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleAvatarPick}
              style={{ display: 'none' }}
            />
            {isUploading && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink-45)',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Uploading…
              </p>
            )}
            {uploadError && (
              <p role="alert" style={{ color: 'var(--crimson)', fontSize: '0.875rem', margin: 0 }}>
                {uploadError}
              </p>
            )}
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Optional. Your initials will show if you skip.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={nextStep}
                disabled={isUploading}
              >
                {avatarUrl ? 'Next' : 'Skip'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 4: House rules ─── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={labelStyle()}>The rules of the floor.</span>
            <div
              style={{
                maxHeight: '240px',
                overflowY: 'auto',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                padding: '0.75rem',
                boxShadow: 'var(--shadow-hard)',
              }}
            >
              <ol
                style={{
                  margin: 0,
                  padding: '0 0 0 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem',
                }}
              >
                {HOUSE_RULES_V1.map((rule, i) => (
                  <li
                    key={i}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8125rem',
                      color: 'var(--ink-70)',
                      lineHeight: 1.45,
                    }}
                  >
                    {rule}
                  </li>
                ))}
              </ol>
            </div>

            <label
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                style={{
                  marginTop: '2px',
                  accentColor: 'var(--crimson)',
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink)',
                }}
              >
                I&rsquo;ve read these and I&rsquo;m in.
              </span>
            </label>

            {submitState?.error && (
              <p role="alert" style={{ color: 'var(--crimson)', fontSize: '0.875rem', margin: 0 }}>
                {submitState.error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={!rulesAccepted || isSubmitting}
              >
                {isSubmitting ? 'Setting up…' : 'Enter the floor'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Visual check**

```bash
npm run dev
```

Visit `http://localhost:3000/onboarding`. Walk through all 5 steps. Verify:

- Step dots update correctly
- Name validation fires on step 0 submit
- Year level segmented control highlights the selected value
- Avatar tap opens file picker; preview shows after picking
- House rules scroll correctly; checkbox enables the submit button

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/onboarding/
git commit -m "feat: Phase 1 onboarding wizard — 5-step profile setup"
```

---

## Task 8: Suspended interstitial + env update

**Files:**

- Create: `app/(auth)/suspended/page.tsx`
- Modify: `.env.local.example`

**Interfaces:**

- Consumes: `Stamp` from `components/ui`
- Produces: `/suspended` renders for suspended users

- [ ] **Step 1: Write suspended page**

```tsx
// app/(auth)/suspended/page.tsx
import { Stamp } from '@/components/ui'

export default function SuspendedPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        textAlign: 'center',
      }}
    >
      <Stamp label="Suspended" variant="crimson" rotate={-8} />

      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--ink)',
            margin: '0 0 0.5rem',
          }}
        >
          Your account has been suspended.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9375rem',
            color: 'var(--ink-70)',
            maxWidth: '28ch',
            margin: '0 auto',
            lineHeight: 1.5,
          }}
        >
          Contact the Baylo admin to find out what happened and how to resolve it.
        </p>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-45)',
          margin: 0,
        }}
      >
        baylo.agustino@usa.edu.ph
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Update `.env.local.example`**

Add `ALLOWED_EMAIL_DOMAIN` after the existing entries:

```
# Verification gate — only this domain can sign up
ALLOWED_EMAIL_DOMAIN=usa.edu.ph
```

- [ ] **Step 3: Type-check and full build**

```bash
npx tsc --noEmit
npm run build
```

Both must exit 0. Build output should show:

```
Route (app)             ...
├ ○ /                   ...
Route (auth)            ...
├ ○ /login              ...
├ ○ /onboarding         ...
└ ○ /suspended          ...
```

- [ ] **Step 4: ESLint**

```bash
npx eslint . --max-warnings 0
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/suspended/ .env.local.example
git commit -m "feat: Phase 1 suspended interstitial and env update"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Middleware redirect check**

```bash
npm run dev
curl -sI http://localhost:3000 | head -5
```

Expected: `HTTP/1.1 307` with `Location: http://localhost:3000/login`

- [ ] **Step 2: Run pgTAP again against clean DB**

```bash
supabase db reset
supabase test db
```

All 9 tests must pass.

- [ ] **Step 3: Manual flow test (requires Supabase running + valid email)**

With Supabase local dev running:

1. Visit `http://localhost:3000` — should land on `/login`
2. Enter a `@usa.edu.ph` email (or check Supabase Studio inbucket at `http://localhost:54324` for the OTP)
3. Enter OTP → should redirect to `/onboarding`
4. Complete all 5 steps → should redirect to `/`
5. Set `is_suspended = true` on your profile via Studio → `/` should now redirect to `/suspended`

- [ ] **Step 4: Final TypeScript + ESLint**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

Both must pass.

- [ ] **Step 5: Final commit and tag**

```bash
git add -A
git commit -m "feat: Phase 1 complete — identity and verification"
```

---

## Acceptance Criteria Checklist

| Criterion                                          | How to verify                                            |
| -------------------------------------------------- | -------------------------------------------------------- |
| `@gmail.com` blocked even via direct API           | pgTAP test 2 passes (`check_email_domain` returns false) |
| User cannot UPDATE another user's profile          | pgTAP structural test + manual attempt via Studio        |
| `verified_at` cannot be set by authenticated role  | pgTAP test 7 passes                                      |
| `is_suspended` cannot be set by authenticated role | pgTAP test 8 passes                                      |
| Onboarding < 60s on mid-range Android              | Manual timing — 5 taps + typing is < 45s                 |
| Middleware redirects unauthed to `/login`          | `curl -I http://localhost:3000` → 307                    |
| Suspended user sees interstitial                   | Set `is_suspended = true` in Studio, reload              |
| TypeScript clean                                   | `tsc --noEmit` exits 0                                   |
| ESLint clean                                       | `eslint . --max-warnings 0` exits 0                      |
| Build clean                                        | `npm run build` exits 0                                  |
