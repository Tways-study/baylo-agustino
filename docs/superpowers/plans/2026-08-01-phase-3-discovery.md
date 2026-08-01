# Phase 3 — Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 2 Baylohan feed into a searchable, filterable, infinitely-scrolling discovery surface with personal bookmarking ("Bantayan"), matching `docs/superpowers/specs/2026-08-01-phase-3-discovery-design.md`.

**Architecture:** `app/(app)/page.tsx` stays the single feed/search/filter surface, server-rendering page one from `searchParams`. Filter/search state lives entirely in the URL. "Load more" is the one client-driven piece: an `IntersectionObserver` calls a Server Action (`loadMoreListings`) that returns the next keyset-paginated page — not a Route Handler, keeping the project on its one existing data-access convention. Search is two-layer: TypeScript-built prefix `tsquery` against the existing `search_tsv` column first, falling back to a `pg_trgm` RPC only on zero results.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + `pg_trgm`), Zod, Vitest, Playwright. No new dependencies.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`. No `any`.
- Zod schemas are the source of truth at every external boundary (`lib/discovery/schemas.ts` here).
- Every table ships RLS-enabled in the same migration file that creates it.
- Every `SECURITY DEFINER` function: `SET search_path = ''`, fully qualified identifiers. `search_listings_fuzzy` is explicitly **not** `SECURITY DEFINER` — it's a read and must honor the caller's RLS.
- Money is integer centavos, never float.
- Price filter (`price` param) implicitly forces `intent = sale` — swap/give have no price.
- `q`/`category` empty-string and `undefined` are both treated as "not set" everywhere downstream — no special-casing needed in Zod, callers check truthiness.
- Reuse existing primitives — do not rebuild `Chit`, `Sheet`, `Button`, `MiniListingRow`, `getSignedImageUrls`, `getAuthUser`, `getCategories`, or the `FeedListing`/`MyListing`/`CategoryRow` types.

---

## File Structure

```
supabase/migrations/20260815000000_phase3_discovery.sql   — saved_listings, search_events, pg_trgm, search_listings_fuzzy
supabase/tests/phase3_discovery_rls.sql                    — pgTAP
lib/discovery/
  schemas.ts       — feedFiltersSchema, priceBandSchema, parseFeedFilters()
  schemas.test.ts
  search.ts        — buildPrefixTsQuery() (pure)
  search.test.ts
  format.ts        — priceBandToRange() (pure)
  format.test.ts
  queries.ts        — getFeedListings, getSavedListingIds, getSavedListings, getRecentSearches
  actions.ts        — loadMoreListings, saveListing, unsaveListing, logSearchEvent
components/ui/
  ChitSkeleton.tsx
  index.ts          — modified, export ChitSkeleton
app/(app)/
  page.tsx           — modified: reads searchParams, composes SearchBar/FilterChips/FeedList
  SearchBar.tsx
  FilterChips.tsx
  FilterSheet.tsx
  FeedList.tsx
  SaveToggleButton.tsx
  ako/page.tsx        — modified: adds Bantayan section
e2e/
  helpers/fixtures.ts — createFixtureListing()
  feed-tti.spec.ts
  fuzzy-search.spec.ts
  filters-survive-refresh.spec.ts
  save-listing.spec.ts
```

---

## Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260815000000_phase3_discovery.sql`

**Interfaces:**

- Produces: tables `saved_listings(user_id, listing_id, created_at)`, `search_events(id, user_id, query, created_at)`; function `public.search_listings_fuzzy(p_query text, p_limit int default 24) returns setof public.listings`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260815000000_phase3_discovery.sql
-- Phase 3: Discovery — all tables ship with RLS enabled in this same file.

-- ═══ saved_listings ("Bantayan") ═══
create table public.saved_listings (
  user_id uuid not null references public.profiles on delete cascade,
  listing_id uuid not null references public.listings on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table public.saved_listings enable row level security;

create policy "users manage own saved listings"
  on public.saved_listings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══ search_events ═══
create table public.search_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table public.search_events enable row level security;

create policy "users insert own search events"
  on public.search_events for insert
  with check (auth.uid() = user_id);

create policy "users read own search events"
  on public.search_events for select
  using (auth.uid() = user_id);

create index on public.search_events (user_id, created_at desc);

-- ═══ pg_trgm — fuzzy fallback ═══
-- Installed into the extensions schema, matching this project's existing
-- convention (pgtap is installed there too). Referenced fully-qualified
-- below since search_listings_fuzzy locks search_path = '' like every
-- other function in this codebase, DEFINER or not.
create extension if not exists pg_trgm with schema extensions;
create index on public.listings using gin (title extensions.gin_trgm_ops);

create or replace function public.search_listings_fuzzy(p_query text, p_limit int default 24)
returns setof public.listings
language sql
stable
-- SECURITY INVOKER (the default) — this is a read and must honor the
-- caller's RLS like any other query, not bypass it.
set search_path = ''
as $$
  select *
  from public.listings
  where status = 'active'
    and expires_at > now()
    and extensions.similarity(title, p_query) > 0.2
  order by extensions.similarity(title, p_query) desc
  limit p_limit
$$;

grant execute on function public.search_listings_fuzzy(text, integer) to authenticated;
```

- [ ] **Step 2: Apply to the linked Supabase project and eyeball**

```bash
npx supabase db push
```

Verify via `npx supabase db query --linked "select table_name from information_schema.tables where table_schema='public' and table_name in ('saved_listings','search_events');"` — both should appear. Verify the function isn't `SECURITY DEFINER`:

```bash
npx supabase db query --linked "select prosecdef from pg_proc where proname='search_listings_fuzzy';"
```

Expected: `prosecdef: false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260815000000_phase3_discovery.sql
git commit -m "feat: Phase 3 database migration — saved_listings, search_events, pg_trgm fuzzy search"
```

---

## Task 2: pgTAP tests

**Files:**

- Create: `supabase/tests/phase3_discovery_rls.sql`

- [ ] **Step 1: Write the test file**

```sql
-- supabase/tests/phase3_discovery_rls.sql
begin;
select plan(9);

select ok(
  exists(select 1 from pg_extension where extname = 'pg_trgm'),
  'pg_trgm extension is installed'
);

select ok(
  has_table_privilege('authenticated', 'public.saved_listings', 'SELECT'),
  'authenticated has SELECT on saved_listings'
);
select ok(
  has_table_privilege('authenticated', 'public.saved_listings', 'INSERT'),
  'authenticated has INSERT on saved_listings'
);
select ok(
  has_table_privilege('authenticated', 'public.saved_listings', 'DELETE'),
  'authenticated has DELETE on saved_listings'
);

select ok(
  has_table_privilege('authenticated', 'public.search_events', 'SELECT'),
  'authenticated has SELECT on search_events'
);
select ok(
  has_table_privilege('authenticated', 'public.search_events', 'INSERT'),
  'authenticated has INSERT on search_events'
);

select ok(
  has_function_privilege('authenticated', 'public.search_listings_fuzzy(text, integer)', 'EXECUTE'),
  'authenticated can call search_listings_fuzzy'
);

select ok(
  not (select prosecdef from pg_proc where proname = 'search_listings_fuzzy'),
  'search_listings_fuzzy is not SECURITY DEFINER — it must honor caller RLS'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'saved_listings'
      and policyname = 'users manage own saved listings'
  ),
  'saved_listings RLS policy exists'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run against the linked project**

```bash
npx supabase db query --linked "create extension if not exists pgtap with schema extensions;"
```

Then run with `psql` (the `db query` CLI command only surfaces the final statement's result, not per-assertion detail — see Phase 2's verification notes):

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PGOPTIONS="--search_path=public,extensions,auth"
psql "$(cat ~/.pgpass | grep pooler | head -1 | awk -F: '{print "postgresql://"$4"@"$1":"$2"/"$3}')" \
  -f supabase/tests/phase3_discovery_rls.sql
```

If `~/.pgpass` isn't set up in this environment, use whatever pooler connection string was used for Phase 2's verification. Expected: `# Looks like you failed 0 tests of 9` is absent — all 9 pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase3_discovery_rls.sql
git commit -m "test: Phase 3 pgTAP — saved_listings/search_events RLS, search_listings_fuzzy grants"
```

---

## Task 3: Pure logic — `buildPrefixTsQuery`

**Files:**

- Create: `lib/discovery/search.ts`
- Test: `lib/discovery/search.test.ts`

**Interfaces:**

- Produces: `buildPrefixTsQuery(input: string): string` — returns `''` for input with no usable tokens.

- [ ] **Step 1: Write the failing test**

```ts
// lib/discovery/search.test.ts
import { describe, expect, it } from 'vitest'
import { buildPrefixTsQuery } from './search'

describe('buildPrefixTsQuery', () => {
  it('builds a single-token prefix query', () => {
    expect(buildPrefixTsQuery('calcu')).toBe('calcu:*')
  })

  it('builds a multi-token AND query', () => {
    expect(buildPrefixTsQuery('lab gown')).toBe('lab:* & gown:*')
  })

  it('strips tsquery special characters', () => {
    expect(buildPrefixTsQuery("casio's & (best) calc!")).toBe('casio:* & s:* & best:* & calc:*')
  })

  it('collapses repeated whitespace', () => {
    expect(buildPrefixTsQuery('  lab   gown  ')).toBe('lab:* & gown:*')
  })

  it('returns empty string for input with no usable tokens', () => {
    expect(buildPrefixTsQuery('   ')).toBe('')
    expect(buildPrefixTsQuery('!!!')).toBe('')
    expect(buildPrefixTsQuery('')).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run lib/discovery/search.test.ts
```

Expected: FAIL — `Cannot find module './search'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// lib/discovery/search.ts

/**
 * Builds a Postgres tsquery prefix-match string from raw user input, safe
 * to pass straight to supabase-js's `.textSearch()`. Each token becomes a
 * prefix match (`token:*`), ANDed together. Returns '' for input with no
 * usable tokens — callers should skip the search filter entirely in that
 * case rather than pass an empty tsquery.
 */
export function buildPrefixTsQuery(input: string): string {
  const sanitized = input.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const tokens = sanitized.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `${t}:*`).join(' & ')
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run lib/discovery/search.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery/search.ts lib/discovery/search.test.ts
git commit -m "feat: buildPrefixTsQuery for Phase 3 discovery search"
```

---

## Task 4: Zod schemas

**Files:**

- Create: `lib/discovery/schemas.ts`
- Test: `lib/discovery/schemas.test.ts`

**Interfaces:**

- Consumes: `listingIntentSchema`, `listingConditionSchema` from `@/lib/listings/schemas`
- Produces: `priceBandSchema`, `PriceBand` type, `feedFiltersSchema`, `FeedFilters` type, `parseFeedFilters(searchParams: Record<string, string | string[] | undefined>): FeedFilters`

- [ ] **Step 1: Write the failing test**

```ts
// lib/discovery/schemas.test.ts
import { describe, expect, it } from 'vitest'
import { parseFeedFilters } from './schemas'

describe('parseFeedFilters', () => {
  it('parses valid filter params', () => {
    const result = parseFeedFilters({ q: 'calculator', intent: 'sale', condition: 'good' })
    expect(result).toEqual({ q: 'calculator', intent: 'sale', condition: 'good' })
  })

  it('takes the first value when a param appears multiple times', () => {
    const result = parseFeedFilters({ intent: ['sale', 'swap'] })
    expect(result.intent).toBe('sale')
  })

  it('drops invalid enum values instead of throwing', () => {
    const result = parseFeedFilters({ intent: 'not-a-real-intent' })
    expect(result).toEqual({})
  })

  it('returns an empty object for no params', () => {
    expect(parseFeedFilters({})).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run lib/discovery/schemas.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/discovery/schemas.ts
import { z } from 'zod'
import { listingIntentSchema, listingConditionSchema } from '@/lib/listings/schemas'

export const priceBandSchema = z.enum(['under-200', '200-500', '500-1000', '1000-plus'])
export type PriceBand = z.infer<typeof priceBandSchema>

export const feedFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  intent: listingIntentSchema.optional(),
  category: z.string().max(60).optional(),
  condition: listingConditionSchema.optional(),
  price: priceBandSchema.optional(),
  photos: z.literal('1').optional(),
})
export type FeedFilters = z.infer<typeof feedFiltersSchema>

/**
 * Next's searchParams gives `string | string[] | undefined` per key, and
 * may contain values that don't match the schema (a hand-edited or stale
 * URL). Falls back to an empty filter set rather than throwing — a bad
 * filter param should never break the page.
 */
export function parseFeedFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FeedFilters {
  const flat: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    flat[key] = Array.isArray(value) ? value[0] : value
  }
  const result = feedFiltersSchema.safeParse(flat)
  return result.success ? result.data : {}
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run lib/discovery/schemas.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/discovery/schemas.ts lib/discovery/schemas.test.ts
git commit -m "feat: Phase 3 discovery Zod schemas and searchParams parsing"
```

---

## Task 5: Pure logic — price band mapping

**Files:**

- Create: `lib/discovery/format.ts`
- Test: `lib/discovery/format.test.ts`

**Interfaces:**

- Consumes: `PriceBand` type from `./schemas` (Task 4)
- Produces: `priceBandToRange(band: PriceBand): { min: number; max: number | null }` (centavos)

- [ ] **Step 1: Write the failing test**

```ts
// lib/discovery/format.test.ts
import { describe, expect, it } from 'vitest'
import { priceBandToRange } from './format'

describe('priceBandToRange', () => {
  it('maps under-200 to 0-19999 centavos', () => {
    expect(priceBandToRange('under-200')).toEqual({ min: 0, max: 19999 })
  })

  it('maps 200-500 to 20000-49999 centavos', () => {
    expect(priceBandToRange('200-500')).toEqual({ min: 20000, max: 49999 })
  })

  it('maps 500-1000 to 50000-99999 centavos', () => {
    expect(priceBandToRange('500-1000')).toEqual({ min: 50000, max: 99999 })
  })

  it('maps 1000-plus to an open-ended range', () => {
    expect(priceBandToRange('1000-plus')).toEqual({ min: 100000, max: null })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run lib/discovery/format.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/discovery/format.ts
import type { PriceBand } from './schemas'

export interface CentavosRange {
  min: number
  max: number | null
}

const PRICE_BAND_RANGES: Record<PriceBand, CentavosRange> = {
  'under-200': { min: 0, max: 19999 },
  '200-500': { min: 20000, max: 49999 },
  '500-1000': { min: 50000, max: 99999 },
  '1000-plus': { min: 100000, max: null },
}

export function priceBandToRange(band: PriceBand): CentavosRange {
  return PRICE_BAND_RANGES[band]
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run lib/discovery/format.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/discovery/format.ts lib/discovery/format.test.ts
git commit -m "feat: priceBandToRange for Phase 3 discovery filters"
```

---

## Task 6: Discovery queries

**Files:**

- Create: `lib/discovery/queries.ts`

**Interfaces:**

- Consumes: `FeedFilters` from `./schemas`; `priceBandToRange` from `./format`; `buildPrefixTsQuery` from `./search`; `FeedListing`, `MyListing` types + `createClient` from `@/lib/supabase/server`; `getSignedImageUrls` from `@/lib/media/get-image-url`; `CategoryRow` from `@/types/database`
- Produces: `FeedCursor` (`{ bumpedAt: string; id: string }`), `FeedListingWithImage` (`FeedListing & { imageUrl?: string }`), `FeedPage` (`{ listings: FeedListingWithImage[]; nextCursor: FeedCursor | null }`), `getFeedListings(filters, categories, cursor?): Promise<FeedPage>`, `getSavedListingIds(userId): Promise<Set<string>>`, `getSavedListings(userId): Promise<MyListing[]>`, `getRecentSearches(userId): Promise<string[]>`

- [ ] **Step 1: Write the implementation**

```ts
// lib/discovery/queries.ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import type { FeedFilters } from './schemas'
import { priceBandToRange } from './format'
import { buildPrefixTsQuery } from './search'
import type { FeedListing, MyListing } from '@/lib/listings/queries'
import type { CategoryRow } from '@/types/database'

export interface FeedCursor {
  bumpedAt: string
  id: string
}

export type FeedListingWithImage = FeedListing & { imageUrl?: string }

export interface FeedPage {
  listings: FeedListingWithImage[]
  nextCursor: FeedCursor | null
}

const PAGE_SIZE = 24

const FEED_SELECT =
  'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
  'listing_images(storage_path, position), ' +
  'listing_wants(label, position), ' +
  'profiles!listings_owner_id_fkey(display_name, verified_at)'

const FEED_SELECT_WITH_PHOTOS_ONLY =
  'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
  'listing_images!inner(storage_path, position), ' +
  'listing_wants(label, position), ' +
  'profiles!listings_owner_id_fkey(display_name, verified_at)'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function attachImageUrls(listings: FeedListing[]): Promise<FeedListingWithImage[]> {
  const coverPaths = listings
    .map((l) => l.listing_images?.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)
  return listings.map((l) => {
    const cover = l.listing_images?.find((i) => i.position === 0)?.storage_path
    return { ...l, imageUrl: cover ? signedUrls[cover] : undefined }
  })
}

async function runFeedQuery(
  supabase: SupabaseServerClient,
  filters: FeedFilters,
  categoryId: number | null,
  cursor?: FeedCursor,
  prefixQuery?: string,
): Promise<FeedPage> {
  let query = supabase
    .from('listings')
    .select(filters.photos === '1' ? FEED_SELECT_WITH_PHOTOS_ONLY : FEED_SELECT)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())

  const effectiveIntent = filters.price ? 'sale' : filters.intent
  if (effectiveIntent) query = query.eq('intent', effectiveIntent)
  if (filters.condition) query = query.eq('condition', filters.condition)
  if (categoryId !== null) query = query.eq('category_id', categoryId)

  if (filters.price) {
    const { min, max } = priceBandToRange(filters.price)
    query = query.gte('ask_centavos', min)
    if (max !== null) query = query.lte('ask_centavos', max)
  }

  if (prefixQuery) query = query.textSearch('search_tsv', prefixQuery)

  if (cursor) {
    query = query.or(
      `bumped_at.lt.${cursor.bumpedAt},and(bumped_at.eq.${cursor.bumpedAt},id.lt.${cursor.id})`,
    )
  }

  const { data } = await query
    .order('bumped_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)

  const rows = (data ?? []) as unknown as FeedListing[]
  const last = rows[rows.length - 1]
  const nextCursor =
    rows.length === PAGE_SIZE && last ? { bumpedAt: last.bumped_at, id: last.id } : null

  return { listings: await attachImageUrls(rows), nextCursor }
}

async function runFeedQueryByIds(
  supabase: SupabaseServerClient,
  filters: FeedFilters,
  categoryId: number | null,
  ids: string[],
): Promise<FeedPage> {
  if (ids.length === 0) return { listings: [], nextCursor: null }

  let query = supabase
    .from('listings')
    .select(filters.photos === '1' ? FEED_SELECT_WITH_PHOTOS_ONLY : FEED_SELECT)
    .in('id', ids)

  // The fuzzy RPC only matches on title similarity — it doesn't know about
  // the other active filters, so they're re-applied here exactly like
  // runFeedQuery does. Without this, a filtered search (e.g. intent=swap)
  // could fuzzy-match a sale listing and show it anyway.
  const effectiveIntent = filters.price ? 'sale' : filters.intent
  if (effectiveIntent) query = query.eq('intent', effectiveIntent)
  if (filters.condition) query = query.eq('condition', filters.condition)
  if (categoryId !== null) query = query.eq('category_id', categoryId)
  if (filters.price) {
    const { min, max } = priceBandToRange(filters.price)
    query = query.gte('ask_centavos', min)
    if (max !== null) query = query.lte('ask_centavos', max)
  }

  const { data } = await query
  const rows = (data ?? []) as unknown as FeedListing[]

  // .in() does not guarantee results come back in `ids` order, which is
  // the RPC's similarity-ranked order — re-sort explicitly so the best
  // fuzzy match still shows first.
  const rank = new Map(ids.map((id, i) => [id, i]))
  rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))

  return { listings: await attachImageUrls(rows), nextCursor: null }
}

export async function getFeedListings(
  filters: FeedFilters,
  categories: CategoryRow[],
  cursor?: FeedCursor,
): Promise<FeedPage> {
  const supabase = await createClient()
  const categoryId = filters.category
    ? (categories.find((c) => c.slug === filters.category)?.id ?? null)
    : null

  // Computed once regardless of page, and reused on the final fallthrough
  // return below — without this, page 2+ of a search would silently drop
  // the search constraint (filters.q is still truthy but cursor is now
  // set, so the block below is skipped; the old code's fallthrough call
  // omitted the prefixQuery argument entirely).
  const prefixQuery = filters.q ? buildPrefixTsQuery(filters.q) : ''

  // A search term with zero matches on the primary index falls back to
  // fuzzy trigram matching instead of an empty feed. The fallback isn't
  // paginated — the RPC just returns its best N matches — so it's only
  // attempted on the first page (no cursor).
  if (filters.q && !cursor && prefixQuery) {
    const primary = await runFeedQuery(supabase, filters, categoryId, cursor, prefixQuery)
    if (primary.listings.length > 0) return primary

    const { data } = await supabase.rpc('search_listings_fuzzy', {
      p_query: filters.q,
      p_limit: PAGE_SIZE,
    })
    const rows = (data ?? []) as unknown as Array<{ id: string }>
    return runFeedQueryByIds(
      supabase,
      filters,
      categoryId,
      rows.map((r) => r.id),
    )
  }

  return runFeedQuery(supabase, filters, categoryId, cursor, prefixQuery || undefined)
}

export async function getSavedListingIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase.from('saved_listings').select('listing_id').eq('user_id', userId)
  return new Set((data ?? []).map((row) => row.listing_id))
}

export async function getSavedListings(userId: string): Promise<MyListing[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saved_listings')
    .select(
      'listings(id, code, title, intent, status, ask_centavos, view_count, listing_images(storage_path, position))',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as Array<{ listings: MyListing | null }>
  return rows.map((r) => r.listings).filter((l): l is MyListing => l !== null)
}

export async function getRecentSearches(userId: string): Promise<string[]> {
  const supabase = await createClient()
  // Fetch more than 5 raw rows before deduping — a user who repeats a
  // query often would otherwise see fewer than 5 distinct suggestions
  // even with plenty of unique searches further back in their history.
  const { data } = await supabase
    .from('search_events')
    .select('query')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  return Array.from(new Set((data ?? []).map((r) => r.query))).slice(0, 5)
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If `.textSearch`/`.or`/`.rpc` argument types don't line up with the hand-written `Database` type, verify `search_listings_fuzzy` was added to `types/database.ts`'s `Functions` (Task 6a below) before treating this as a real error.

- [ ] **Step 2a: Add `search_listings_fuzzy` to `types/database.ts`**

Add to `Functions`:

```ts
search_listings_fuzzy: {
  Args: { p_query: string; p_limit?: number }
  Returns: Database['public']['Tables']['listings']['Row'][]
}
```

Re-run `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add lib/discovery/queries.ts types/database.ts
git commit -m "feat: Phase 3 discovery queries — filtered/paginated feed, saved listings, recent searches"
```

---

## Task 7: Discovery Server Actions

**Files:**

- Create: `lib/discovery/actions.ts`

**Interfaces:**

- Consumes: `getFeedListings`, `FeedCursor`, `FeedPage` from `./queries`; `feedFiltersSchema`, `FeedFilters` from `./schemas`; `getAuthUser` from `@/lib/auth/session`; `createClient` from `@/lib/supabase/server`; `CategoryRow` from `@/types/database`
- Produces: `loadMoreListings(cursor, rawFilters, categories): Promise<FeedPage>`, `SavedListingActionResult` (`{ error?: string }`), `saveListing(listingId): Promise<SavedListingActionResult>`, `unsaveListing(listingId): Promise<SavedListingActionResult>`, `logSearchEvent(query): Promise<void>`

- [ ] **Step 1: Write the implementation**

```ts
// lib/discovery/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/session'
import { feedFiltersSchema, type FeedFilters } from './schemas'
import { getFeedListings, type FeedCursor, type FeedPage } from './queries'
import type { CategoryRow } from '@/types/database'

export async function loadMoreListings(
  cursor: FeedCursor,
  rawFilters: FeedFilters,
  categories: CategoryRow[],
): Promise<FeedPage> {
  const filters = feedFiltersSchema.parse(rawFilters)
  return getFeedListings(filters, categories, cursor)
}

export interface SavedListingActionResult {
  error?: string
}

export async function saveListing(listingId: string): Promise<SavedListingActionResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'Session expired. Sign in again.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('saved_listings')
    .insert({ user_id: user.id, listing_id: listingId })

  // 23505 = unique_violation — already saved, treat as a no-op success
  // rather than surfacing an error for a double-tap.
  if (error && error.code !== '23505') return { error: 'Could not save this listing.' }
  return {}
}

export async function unsaveListing(listingId: string): Promise<SavedListingActionResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'Session expired. Sign in again.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listingId)

  if (error) return { error: 'Could not remove this listing.' }
  return {}
}

export async function logSearchEvent(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) return

  const user = await getAuthUser()
  if (!user) return

  const supabase = await createClient()
  await supabase.from('search_events').insert({ user_id: user.id, query: trimmed })
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/discovery/actions.ts
git commit -m "feat: Phase 3 discovery Server Actions — load more, save/unsave, log search"
```

---

## Task 8: `ChitSkeleton` component

**Files:**

- Create: `components/ui/ChitSkeleton.tsx`
- Modify: `components/ui/index.ts`

**Interfaces:**

- Produces: `ChitSkeleton(): JSX.Element` — no props, same footprint as `Chit`.

- [ ] **Step 1: Write the component**

```tsx
// components/ui/ChitSkeleton.tsx
export function ChitSkeleton() {
  return (
    <div
      className="flex min-h-[9rem] animate-pulse"
      style={{
        backgroundColor: 'var(--card)',
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-hard)',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <div
        className="shrink-0"
        style={{ width: '2rem', backgroundColor: 'var(--paper-dim)', borderRight: 'var(--stroke)' }}
      />
      <div className="flex flex-col justify-between p-3 flex-1 gap-2">
        <div
          style={{
            width: '3rem',
            height: '14px',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          style={{
            width: '70%',
            height: '18px',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
        <div
          style={{
            width: '50%',
            height: '12px',
            backgroundColor: 'var(--paper-dim)',
            borderRadius: 'var(--radius)',
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Export it**

```ts
// components/ui/index.ts — add this line
export { ChitSkeleton } from './ChitSkeleton'
```

- [ ] **Step 3: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint components/ui/ChitSkeleton.tsx components/ui/index.ts --max-warnings 0
git add components/ui/ChitSkeleton.tsx components/ui/index.ts
git commit -m "feat: ChitSkeleton loading placeholder for Phase 3 feed"
```

---

## Task 9: `SaveToggleButton` component

**Files:**

- Create: `app/(app)/SaveToggleButton.tsx`

**Interfaces:**

- Consumes: `saveListing`, `unsaveListing` from `@/lib/discovery/actions`
- Produces: `SaveToggleButton({ listingId: string; initialSaved: boolean })`

- [ ] **Step 1: Write the component**

```tsx
// app/(app)/SaveToggleButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { saveListing, unsaveListing } from '@/lib/discovery/actions'

interface SaveToggleButtonProps {
  listingId: string
  initialSaved: boolean
}

export function SaveToggleButton({ listingId, initialSaved }: SaveToggleButtonProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      const res = next ? await saveListing(listingId) : await unsaveListing(listingId)
      if (res.error) setSaved(!next)
    })
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save this listing'}
      style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        width: '1.75rem',
        height: '1.75rem',
        borderRadius: '50%',
        border: 'var(--stroke)',
        backgroundColor: saved ? 'var(--gold)' : 'var(--card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 5,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={saved ? 'var(--ink)' : 'none'}
        stroke="var(--ink)"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 2: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint "app/(app)/SaveToggleButton.tsx" --max-warnings 0
git add "app/(app)/SaveToggleButton.tsx"
git commit -m "feat: SaveToggleButton for Bantayan"
```

---

## Task 10: `SearchBar` component

**Files:**

- Create: `app/(app)/SearchBar.tsx`

**Interfaces:**

- Consumes: `logSearchEvent` from `@/lib/discovery/actions`
- Produces: `SearchBar({ initialQuery: string; recentSearches: string[] })`

- [ ] **Step 1: Write the component**

```tsx
// app/(app)/SearchBar.tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { logSearchEvent } from '@/lib/discovery/actions'

interface SearchBarProps {
  initialQuery: string
  recentSearches: string[]
}

const DEBOUNCE_MS = 400

export function SearchBar({ initialQuery, recentSearches }: SearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const [showRecent, setShowRecent] = useState(false)
  const [, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushQuery(q: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (q) params.set('q', q)
    else params.delete('q')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
    if (q) void logSearchEvent(q)
  }

  function handleChange(next: string) {
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushQuery(next.trim()), DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="flex items-center gap-2"
        style={{
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--card)',
          padding: '0.625rem 0.75rem',
          boxShadow: 'var(--shadow-hard)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-45)"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setShowRecent(true)}
          onBlur={() => setTimeout(() => setShowRecent(false), 150)}
          placeholder="Search books, calcs, uniforms…"
          aria-label="Search listings"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--ink)',
          }}
        />
      </div>
      {showRecent && value === '' && recentSearches.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--card)',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-hard)',
            zIndex: 10,
            margin: 0,
            padding: '0.375rem 0',
            listStyle: 'none',
          }}
        >
          {recentSearches.map((term) => (
            <li key={term}>
              <button
                type="button"
                onClick={() => {
                  setValue(term)
                  pushQuery(term)
                  setShowRecent(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-70)',
                }}
              >
                {term}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint "app/(app)/SearchBar.tsx" --max-warnings 0
git add "app/(app)/SearchBar.tsx"
git commit -m "feat: SearchBar with debounced URL sync and recent searches"
```

---

## Task 11: `FilterSheet` and `FilterChips` components

**Files:**

- Create: `app/(app)/FilterSheet.tsx`
- Create: `app/(app)/FilterChips.tsx`

**Interfaces:**

- Consumes: `Sheet`, `Button`, `Intent` from `@/components/ui`; `CategoryRow` from `@/types/database`
- Produces: `FilterSheet({ open, onClose, categories, initial })`; `FilterChips({ activeIntent, activeFilterCount, categories, initialCategory, initialCondition, initialPrice, initialPhotos })`

- [ ] **Step 1: Write `FilterSheet`**

```tsx
// app/(app)/FilterSheet.tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sheet, Button } from '@/components/ui'
import type { CategoryRow } from '@/types/database'

interface FilterSheetValue {
  category: string | null
  condition: string | null
  price: string | null
  photos: boolean
}

interface FilterSheetProps {
  open: boolean
  onClose: () => void
  categories: CategoryRow[]
  initial: FilterSheetValue
}

const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'worn'] as const

const PRICE_BANDS: { value: string; label: string }[] = [
  { value: 'under-200', label: 'Under ₱200' },
  { value: '200-500', label: '₱200–500' },
  { value: '500-1000', label: '₱500–1000' },
  { value: '1000-plus', label: '₱1000+' },
]

const filterLabelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-45)',
  marginBottom: '0.375rem',
  display: 'block',
}

export function FilterSheet({ open, onClose, categories, initial }: FilterSheetProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState<FilterSheetValue>(initial)

  // FilterChips renders one persistent <FilterSheet> instance and only
  // toggles `open` — this component itself never unmounts, so `value`
  // would otherwise stay frozen at whatever was last drafted (including
  // an abandoned, never-Applied edit) instead of reflecting the current
  // URL state each time the sheet is reopened. Deliberately depends only
  // on `open`, not `initial` — `initial` is a fresh object literal on
  // every parent render, so including it would reset the in-progress
  // draft on unrelated re-renders while the sheet is still open.
  useEffect(() => {
    if (open) setValue(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function apply() {
    const params = new URLSearchParams(searchParams.toString())
    const entries: [string, string | null][] = [
      ['category', value.category],
      ['condition', value.condition],
      ['price', value.price],
    ]
    for (const [key, val] of entries) {
      if (val) params.set(key, val)
      else params.delete(key)
    }
    if (value.photos) params.set('photos', '1')
    else params.delete('photos')
    router.push(`${pathname}?${params.toString()}`)
    onClose()
  }

  function clear() {
    setValue({ category: null, condition: null, price: null, photos: false })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <span style={filterLabelStyle}>Category</span>
          <select
            value={value.category ?? ''}
            onChange={(e) => setValue((v) => ({ ...v, category: e.target.value || null }))}
            style={{
              width: '100%',
              padding: '0.625rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--card)',
            }}
          >
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span style={filterLabelStyle}>Condition</span>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue((v) => ({ ...v, condition: v.condition === c ? null : c }))}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: value.condition === c ? 'var(--crimson)' : 'var(--card)',
                  color: value.condition === c ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {c.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={filterLabelStyle}>Price (sale only)</span>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {PRICE_BANDS.map((band) => (
              <button
                key={band.value}
                type="button"
                onClick={() =>
                  setValue((v) => ({ ...v, price: v.price === band.value ? null : band.value }))
                }
                style={{
                  padding: '0.5rem 0.75rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: value.price === band.value ? 'var(--crimson)' : 'var(--card)',
                  color: value.price === band.value ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {band.label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.photos}
            onChange={(e) => setValue((v) => ({ ...v, photos: e.target.checked }))}
            style={{ accentColor: 'var(--crimson)', width: '16px', height: '16px' }}
          />
          <span
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink)' }}
          >
            Has photos
          </span>
        </label>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button type="button" variant="ghost" onClick={clear}>
            Clear
          </Button>
          <Button type="button" variant="primary" fullWidth onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
```

- [ ] **Step 2: Write `FilterChips`**

```tsx
// app/(app)/FilterChips.tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { Intent } from '@/components/ui'
import type { CategoryRow } from '@/types/database'
import { FilterSheet } from './FilterSheet'

interface FilterChipsProps {
  activeIntent: Intent | null
  activeFilterCount: number
  categories: CategoryRow[]
  initialCategory: string | null
  initialCondition: string | null
  initialPrice: string | null
  initialPhotos: boolean
}

const INTENTS: { value: Intent | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'swap', label: 'Swap' },
  { value: 'sale', label: 'Sale' },
  { value: 'give', label: 'Give' },
]

export function FilterChips({
  activeIntent,
  activeFilterCount,
  categories,
  initialCategory,
  initialCondition,
  initialPrice,
  initialPhotos,
}: FilterChipsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [sheetOpen, setSheetOpen] = useState(false)

  function setIntent(intent: Intent | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (intent) params.set('intent', intent)
    else params.delete('intent')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto" style={{ flexWrap: 'nowrap' }}>
        {INTENTS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setIntent(opt.value)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              border: '1.5px solid var(--ink)',
              borderRadius: '100px',
              padding: '5px 11px',
              backgroundColor: activeIntent === opt.value ? 'var(--ink)' : 'transparent',
              color: activeIntent === opt.value ? 'var(--paper)' : 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10.5px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            border: '1.5px solid var(--ink)',
            borderRadius: '100px',
            padding: '5px 11px',
            backgroundColor: activeFilterCount > 0 ? 'var(--gold)' : 'transparent',
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        categories={categories}
        initial={{
          category: initialCategory,
          condition: initialCondition,
          price: initialPrice,
          photos: initialPhotos,
        }}
      />
    </>
  )
}
```

- [ ] **Step 3: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint "app/(app)/FilterSheet.tsx" "app/(app)/FilterChips.tsx" --max-warnings 0
git add "app/(app)/FilterSheet.tsx" "app/(app)/FilterChips.tsx"
git commit -m "feat: FilterChips and FilterSheet for Phase 3 discovery"
```

---

## Task 12: `FeedList` component

**Files:**

- Create: `app/(app)/FeedList.tsx`

**Interfaces:**

- Consumes: `Chit`, `ChitSkeleton` from `@/components/ui`; `SaveToggleButton` from `./SaveToggleButton`; `loadMoreListings` from `@/lib/discovery/actions`; `FeedCursor`, `FeedListingWithImage` from `@/lib/discovery/queries`; `FeedFilters` from `@/lib/discovery/schemas`; `CategoryRow` from `@/types/database`; `centavosToPesos` from `@/lib/listings/format`
- Produces: `FeedList({ initialListings, initialCursor, filters, categories, initialSavedIds })`

- [ ] **Step 1: Write the component**

```tsx
// app/(app)/FeedList.tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Chit, ChitSkeleton } from '@/components/ui'
import { SaveToggleButton } from './SaveToggleButton'
import { loadMoreListings } from '@/lib/discovery/actions'
import type { FeedCursor, FeedListingWithImage } from '@/lib/discovery/queries'
import type { FeedFilters } from '@/lib/discovery/schemas'
import type { CategoryRow } from '@/types/database'
import { centavosToPesos } from '@/lib/listings/format'

interface FeedListProps {
  initialListings: FeedListingWithImage[]
  initialCursor: FeedCursor | null
  filters: FeedFilters
  categories: CategoryRow[]
  initialSavedIds: string[]
}

export function FeedList({
  initialListings,
  initialCursor,
  filters,
  categories,
  initialSavedIds,
}: FeedListProps) {
  const [listings, setListings] = useState(initialListings)
  const [cursor, setCursor] = useState(initialCursor)
  const [savedIds, setSavedIds] = useState(new Set(initialSavedIds))
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)

  // initialSavedIds arrives fresh from the server on every filter change
  // (page.tsx re-renders with new props) — without this, save state would
  // stay frozen at whatever it was on first mount after a filter change.
  useEffect(() => {
    setListings(initialListings)
    setCursor(initialCursor)
    setSavedIds(new Set(initialSavedIds))
    setError(false)
  }, [initialListings, initialCursor, initialSavedIds])

  function loadNext() {
    // Synchronous guard, not just the retry button's `disabled` prop below
    // — a rapid double-click can fire two events before React commits the
    // disabled state, and both closures would otherwise read the same
    // `cursor` and both append to `listings`, duplicating visible cards.
    if (!cursor || isPending) return
    setError(false)
    startTransition(async () => {
      try {
        const page = await loadMoreListings(cursor, filters, categories)
        setListings((prev) => [...prev, ...page.listings])
        setCursor(page.nextCursor)
      } catch {
        setError(true)
      }
    })
  }

  useEffect(() => {
    if (!cursor) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isPending) loadNext()
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, isPending])

  return (
    <div className="flex flex-col gap-3">
      {listings.map((l) => {
        const firstWant = (l.listing_wants ?? []).slice().sort((a, b) => a.position - b.position)[0]
        const metaLine =
          l.intent === 'give'
            ? 'Free — first to claim'
            : l.intent === 'sale'
              ? `₱${centavosToPesos(l.ask_centavos ?? 0)}`
              : firstWant
                ? `Wants: ${firstWant.label}`
                : undefined

        return (
          <div key={l.id} style={{ position: 'relative' }}>
            <Link href={`/l/${l.code}`} className="contents">
              <Chit
                code={l.code}
                intent={l.intent}
                title={l.title}
                condition={l.condition ?? undefined}
                imageUrl={l.imageUrl}
              >
                {metaLine && (
                  <p className="text-xs" style={{ color: 'var(--ink-70)' }}>
                    {metaLine}
                  </p>
                )}
              </Chit>
            </Link>
            <SaveToggleButton listingId={l.id} initialSaved={savedIds.has(l.id)} />
          </div>
        )
      })}

      {isPending && (
        <>
          <ChitSkeleton />
          <ChitSkeleton />
        </>
      )}

      {error && (
        <button
          type="button"
          onClick={loadNext}
          disabled={isPending}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--crimson)',
            padding: '0.75rem',
            textAlign: 'center',
            background: 'none',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            cursor: isPending ? 'default' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          Couldn&rsquo;t load more — retry
        </button>
      )}

      {cursor && <div ref={sentinelRef} aria-hidden="true" style={{ height: '1px' }} />}
    </div>
  )
}
```

- [ ] **Step 2: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint "app/(app)/FeedList.tsx" --max-warnings 0
git add "app/(app)/FeedList.tsx"
git commit -m "feat: FeedList with infinite scroll, skeletons, and retry"
```

---

## Task 13: Wire `app/(app)/page.tsx`

**Files:**

- Modify: `app/(app)/page.tsx`

**Interfaces:**

- Consumes: `getCategories` from `@/lib/listings/queries`; `getFeedListings`, `getSavedListingIds`, `getRecentSearches` from `@/lib/discovery/queries`; `parseFeedFilters` from `@/lib/discovery/schemas`; `getAuthUser` from `@/lib/auth/session`; `SearchBar`, `FilterChips`, `FeedList` (this directory)

- [ ] **Step 1: Rewrite the page**

```tsx
// app/(app)/page.tsx
import { Ribbon, EmptyState } from '@/components/ui'
import { getCategories } from '@/lib/listings/queries'
import { getFeedListings, getSavedListingIds, getRecentSearches } from '@/lib/discovery/queries'
import { parseFeedFilters } from '@/lib/discovery/schemas'
import { getAuthUser } from '@/lib/auth/session'
import { SearchBar } from './SearchBar'
import { FilterChips } from './FilterChips'
import { FeedList } from './FeedList'

interface BaylohanPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function BaylohanPage({ searchParams }: BaylohanPageProps) {
  const rawParams = await searchParams
  const filters = parseFeedFilters(rawParams)

  const [categories, user] = await Promise.all([getCategories(), getAuthUser()])
  const [{ listings, nextCursor }, savedIds, recentSearches] = await Promise.all([
    getFeedListings(filters, categories),
    user ? getSavedListingIds(user.id) : Promise.resolve(new Set<string>()),
    user ? getRecentSearches(user.id) : Promise.resolve([]),
  ])

  const hasActiveFilters = Boolean(
    filters.q ||
    filters.intent ||
    filters.category ||
    filters.condition ||
    filters.price ||
    filters.photos,
  )
  const activeFilterCount = [
    filters.category,
    filters.condition,
    filters.price,
    filters.photos,
  ].filter(Boolean).length

  return (
    <>
      <header>
        <Ribbon>Baylohan</Ribbon>
      </header>
      <main className="flex flex-col gap-3 px-4 py-4">
        <SearchBar initialQuery={filters.q ?? ''} recentSearches={recentSearches} />
        <FilterChips
          activeIntent={filters.intent ?? null}
          activeFilterCount={activeFilterCount}
          categories={categories}
          initialCategory={filters.category ?? null}
          initialCondition={filters.condition ?? null}
          initialPrice={filters.price ?? null}
          initialPhotos={filters.photos === '1'}
        />

        {listings.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState
              headline="Nothing matches yet."
              body="Try different words, or check back later."
            />
          ) : (
            <EmptyState
              headline="Nothing on the floor yet."
              body="Post the thing you're not using. Someone out there needs a Casio or a lab gown."
              ctaLabel="Post something"
              ctaHref="/post"
            />
          )
        ) : (
          <FeedList
            initialListings={listings}
            initialCursor={nextCursor}
            filters={filters}
            categories={categories}
            initialSavedIds={Array.from(savedIds)}
          />
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 2: Type-check, build, manual check**

```bash
npx tsc --noEmit
npx eslint "app/(app)/page.tsx" --max-warnings 0
npm run build
```

If a dev server with real data is reachable, visit `/`, `/?intent=swap`, `/?q=calc` and confirm the feed responds.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "feat: wire Baylohan feed to search, filters, and infinite scroll"
```

---

## Task 14: Bantayan section in `/ako`

**Files:**

- Modify: `app/(app)/ako/page.tsx`

**Interfaces:**

- Consumes: `getSavedListings` from `@/lib/discovery/queries` (new import, alongside existing `getMyListings`)

- [ ] **Step 1: Rewrite the page**

```tsx
// app/(app)/ako/page.tsx
import { getAuthUser } from '@/lib/auth/session'
import { getMyListings } from '@/lib/listings/queries'
import { getSavedListings } from '@/lib/discovery/queries'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import { Ribbon, MiniListingRow, EmptyState } from '@/components/ui'

export default async function AkoPage() {
  const user = await getAuthUser()
  if (!user) return null // middleware already guards this route; defensive only

  const [listings, savedListings] = await Promise.all([
    getMyListings(user.id),
    getSavedListings(user.id),
  ])

  const coverPaths = [...listings, ...savedListings]
    .map((l) => l.listing_images.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)

  return (
    <>
      <header>
        <Ribbon>Ako</Ribbon>
      </header>
      <main className="px-4 py-4">
        <p className="font-mono-utility text-[10px] mb-2" style={{ color: 'var(--ink-45)' }}>
          Your listings
        </p>
        {listings.length === 0 ? (
          <EmptyState headline="Nothing posted yet." ctaLabel="Post something" ctaHref="/post" />
        ) : (
          listings.map((l) => {
            const cover = l.listing_images.find((i) => i.position === 0)?.storage_path
            return (
              <MiniListingRow
                key={l.id}
                href={`/l/${l.code}`}
                imageUrl={cover ? signedUrls[cover] : undefined}
                title={l.title}
                code={l.code}
                status={l.status}
                intent={l.intent}
                viewCount={l.view_count}
              />
            )
          })
        )}

        <p className="font-mono-utility text-[10px] mb-2 mt-6" style={{ color: 'var(--ink-45)' }}>
          Bantayan
        </p>
        {savedListings.length === 0 ? (
          <EmptyState
            headline="Nothing saved yet."
            body="Tap the bookmark on anything you want to find again."
          />
        ) : (
          savedListings.map((l) => {
            const cover = l.listing_images.find((i) => i.position === 0)?.storage_path
            return (
              <MiniListingRow
                key={l.id}
                href={`/l/${l.code}`}
                imageUrl={cover ? signedUrls[cover] : undefined}
                title={l.title}
                code={l.code}
                status={l.status}
                intent={l.intent}
                viewCount={l.view_count}
              />
            )
          })
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 2: Type-check, lint, build, commit**

```bash
npx tsc --noEmit
npx eslint "app/(app)/ako/page.tsx" --max-warnings 0
npm run build
git add "app/(app)/ako/page.tsx"
git commit -m "feat: Bantayan (saved listings) section in Ako"
```

---

## Task 15: E2E test infrastructure and specs

**Files:**

- Create: `e2e/helpers/fixtures.ts`
- Create: `e2e/feed-tti.spec.ts`
- Create: `e2e/fuzzy-search.spec.ts`
- Create: `e2e/filters-survive-refresh.spec.ts`
- Create: `e2e/save-listing.spec.ts`

**Interfaces:**

- Consumes: `signInAsFixtureUser` from `./helpers/auth` (Phase 2)
- Produces: `createFixtureListing(overrides?): Promise<{ id: string; code: string }>`

- [ ] **Step 1: Write the fixture helper**

```ts
// e2e/helpers/fixtures.ts
import { createClient } from '@supabase/supabase-js'

interface CreateFixtureListingOptions {
  title?: string
  intent?: 'swap' | 'sale' | 'give'
}

/**
 * Creates a listing directly via create_listing(), signed in as the seed
 * fixture user (supabase/seed.sql — email e2e-fixture@usa.edu.ph, password
 * 'not-a-real-password', both already checked into the repo as local-dev-
 * only fixtures). Bypasses the UI post flow entirely — this is test setup,
 * not the thing under test.
 */
export async function createFixtureListing(
  overrides: CreateFixtureListingOptions = {},
): Promise<{ id: string; code: string }> {
  const client = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: authError } = await client.auth.signInWithPassword({
    email: 'e2e-fixture@usa.edu.ph',
    password: 'not-a-real-password',
  })
  if (authError) throw new Error(`Could not sign in fixture user for setup: ${authError.message}`)

  const { data: categories } = await client.from('categories').select('id').limit(1)
  const { data: spots } = await client.from('meetup_spots').select('id').limit(1)
  const intent = overrides.intent ?? 'give'

  const { data, error } = await client.rpc('create_listing', {
    p_id: crypto.randomUUID(),
    p_intent: intent,
    p_title: overrides.title ?? 'Fixture listing',
    p_description: null,
    p_category_id: categories?.[0]?.id ?? null,
    p_condition: 'good',
    p_ask_centavos: intent === 'sale' ? 10000 : null,
    p_accepts_cash: false,
    p_meetup_spot_id: spots?.[0]?.id ?? null,
    p_wants: intent === 'swap' ? ['Anything useful'] : null,
    p_image_paths: null,
  })
  if (error || !data?.[0]) throw new Error(`Could not create fixture listing: ${error?.message}`)
  return data[0]
}
```

- [ ] **Step 2: `e2e/feed-tti.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('Baylohan feed shows a chit within 2.5s on 3G', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP network emulation is Chromium-only')

  await createFixtureListing({ title: 'TTI fixture listing' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  })

  const start = Date.now()
  await page.goto('/')
  await expect(page.locator('article').first()).toBeVisible({ timeout: 2_500 })
  expect(Date.now() - start).toBeLessThan(2_500)
})
```

- [ ] **Step 3: `e2e/fuzzy-search.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('searching calcu, casio, and calculator all surface the same listing', async ({ page }) => {
  await createFixtureListing({ title: 'Casio fx-991EX Scientific Calculator' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  for (const term of ['calcu', 'casio', 'calculator']) {
    await page.goto('/')
    await page.getByLabel('Search listings').fill(term)
    await page.waitForURL(new RegExp(`[?&]q=${term}`))
    await expect(page.getByText('Casio fx-991EX Scientific Calculator')).toBeVisible({
      timeout: 10_000,
    })
  }
})
```

- [ ] **Step 4: `e2e/filters-survive-refresh.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('filters survive a refresh and a share', async ({ page, context }) => {
  await createFixtureListing({ title: 'Filter test swap item', intent: 'swap' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  await page.goto('/')
  await page.getByRole('button', { name: 'Swap' }).click()
  await page.waitForURL(/[?&]intent=swap/)
  const filteredUrl = page.url()

  await page.reload()
  expect(page.url()).toContain('intent=swap')
  await expect(page.getByText('Filter test swap item')).toBeVisible()

  const freshPage = await context.newPage()
  await freshPage.goto(filteredUrl)
  await expect(freshPage.getByText('Filter test swap item')).toBeVisible()
  await freshPage.close()
})
```

- [ ] **Step 5: `e2e/save-listing.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('saving a listing shows it in Bantayan', async ({ page }) => {
  const title = 'Save toggle test item'
  await createFixtureListing({ title })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  await page.goto('/')

  // .first() on a bare "Save this listing" query would grab whatever
  // listing sorts first in the feed, not necessarily this one — other
  // specs create their own fixture listings and Playwright parallelizes
  // across spec files by default even with fullyParallel: false (which
  // only serializes within one file). Scope to this listing's own card:
  // its <article> is wrapped in a Link, and the save button is that
  // Link's sibling under one shared per-card <div> (see FeedList.tsx) —
  // walk up from the article to that specific wrapper, not to any div.
  const card = page.locator('article').filter({ hasText: title })
  const cardWrapper = card.locator('xpath=ancestor::div[1]')
  const saveButton = cardWrapper.locator('button')

  // The save toggle flips its optimistic UI state synchronously on click,
  // before the Server Action resolves — waiting for that visual change
  // (or for page.waitForLoadState('networkidle'), which is already
  // latched by the goto('/') above and won't re-arm for a later
  // non-navigating fetch) would prove nothing about whether the DB write
  // actually landed. Wait for the actual POST the Server Action makes
  // instead — Next.js Server Actions post back to the current page's own
  // URL — set up the waiter before the click so it can't miss the
  // response firing between attaching and requesting.
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'POST' && res.url() === page.url()),
    saveButton.click(),
  ])

  // /ako is a Server Component that fetches saved listings once at
  // request time, so this navigation must happen after the write above
  // is confirmed complete, not just after the click event fires.
  await page.goto('/ako')
  await expect(page.getByText(title)).toBeVisible()
})
```

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
npx eslint e2e/ --max-warnings 0
git add e2e/
git commit -m "test: Phase 3 E2E — feed TTI, fuzzy search, filter persistence, save toggle"
```

Do not run `npx playwright test` unless a Supabase instance (local Docker or the linked hosted project) and a running `npm run dev` are actually reachable — running against nothing will hang on `webServer` startup, not fail fast.

---

## Task 16: Final verification sweep

- [ ] **Step 1: Full local verification**

```bash
npx tsc --noEmit
npx eslint . --max-warnings 0
npx vitest run
npm run build
```

All four must be clean/passing before considering Phase 3 done.

- [ ] **Step 2: Live verification against the linked Supabase project**

Repeat Task 1/Task 2's live-verification pattern from Phase 2: confirm `saved_listings`/`search_events` RLS actually blocks cross-user access (not just "policy exists" — set `request.jwt.claims` for two different fixture users and confirm one can't read/write the other's saved listings), and confirm `search_listings_fuzzy` returns results and is not superuser/DEFINER-bypassing RLS. Use the same `db query --linked` / `psql` approach documented in Phase 2's verification.

- [ ] **Step 3: Update `CLAUDE.md`'s phase table**

```diff
- - **Phase 2** — Listings (current)
- - **Phase 3** — Discovery
+ - **Phase 2** — Listings
+ - **Phase 3** — Discovery (current)
```

```bash
git add CLAUDE.md
git commit -m "docs: Phase 3 current"
```

---

## Acceptance Criteria Checklist

| Criterion (build-spec §6)                             | How it's proven                                                |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Feed TTI < 2.5s on 3G                                 | `e2e/feed-tti.spec.ts`                                         |
| `calcu`/`casio`/`calculator` surface the same listing | `e2e/fuzzy-search.spec.ts`                                     |
| Filters survive a refresh and a share                 | `e2e/filters-survive-refresh.spec.ts`                          |
| `saved_listings`/`search_events` RLS holds            | `supabase/tests/phase3_discovery_rls.sql` + Task 16 live check |
| `search_listings_fuzzy` honors RLS (not DEFINER)      | pgTAP test 8 + Task 16 live check                              |
| TypeScript clean                                      | `tsc --noEmit` exits 0                                         |
| ESLint clean                                          | `eslint . --max-warnings 0` exits 0                            |
| Build clean                                           | `npm run build` exits 0                                        |
