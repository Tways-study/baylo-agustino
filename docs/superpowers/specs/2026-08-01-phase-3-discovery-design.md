# Phase 3 — Discovery Design

**Date:** 2026-08-01
**Status:** Approved
**Scope:** Find the calculator.

---

## Context

Phase 2 shipped listings with a bounded, unfiltered Baylohan feed (24 most-recently-bumped active listings, no search, no pagination beyond that first page). Phase 3 makes the feed actually usable at scale: cursor-paginated infinite scroll, filters that live in the URL (so a filtered view is shareable), full-text search with a fuzzy fallback for misspellings, and personal bookmarking ("Bantayan"). The build spec's own zero-result copy ("post a Hanap") points at a feature — wanted posts — that doesn't exist until Phase 7; this design deliberately does not build a Hanap stub to satisfy that copy, and uses honest empty-state copy instead (see Empty States).

---

## Route & Data Flow

`app/(app)/page.tsx` (Baylohan) remains the single feed/search/filter surface — no separate results route. It's a Server Component that reads `searchParams` directly (`q`, `intent`, `category`, `condition`, `price`, `photos`) and server-renders page one via an extended `getFeedListings(filters)`. This is the spec's literal requirement ("server-rendered first page") and is what makes the 2.5s-on-3G TTI target achievable — the first page's HTML exists before any client JS runs.

Every filter/search UI control updates `searchParams` via `router.push()`. The App Router has no shallow-routing escape hatch, so this always re-renders the Server Component with fresh server-rendered results — that's intentional, not a workaround: it's what makes the URL the single source of truth and "filters survive a refresh and a share" true by construction, with no client-side filter state to keep in sync. The search input debounces ~400ms before pushing, so typing doesn't fire a request per keystroke.

"Load more" (infinite scroll) is the one piece that can't be a fresh server render without losing scroll position, so it's the one exception to "everything goes through Server Components": a client `FeedList` component holds an `IntersectionObserver` on the last chit, which calls a Server Action, `loadMoreListings(cursor, filters)`. Server Actions aren't limited to mutations — this one just returns the next page of rows. This keeps the project on one data-access convention (Server Components for reads, Server Actions for everything interactive) rather than introducing a Route Handler, which nothing in Phases 1–2 uses.

**Cursor:** a composite `(bumped_at, id)` pair, not just `bumped_at`. `bumped_at` isn't unique — ties are expected (many listings bumped at creation and never bumped again) — so a single-column cursor can skip or duplicate rows at a tie boundary. Keyset pagination on `(bumped_at, id) < (cursor_bumped_at, cursor_id)`, both descending, avoids that. The cursor is never persisted in the URL — only filters need to survive a share, not scroll position.

---

## Data Model

**Migration:** `supabase/migrations/20260815000000_phase3_discovery.sql` — tables, RLS, extension, and the search function all in this one file.

```sql
-- ═══ saved_listings ═══
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
```

No RPC indirection here, unlike Phase 2's `listings` — there's no cross-row invariant to protect (no rate limit, no generated code, no deferred trigger), just "own rows only," so plain RLS-gated direct writes are sufficient and simpler. Matches the `blocks` table's pattern from Phase 1.

```sql
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
```

Logged for two purposes: showing a user their own recent searches, and (unused this phase, per the build spec) future ranking work. No update/delete policy — search history isn't edited, only accumulated; a "clear my history" affordance can add a delete policy later if wanted, not needed now.

```sql
-- ═══ pg_trgm — fuzzy fallback ═══
create extension if not exists pg_trgm;
create index on public.listings using gin (title gin_trgm_ops);

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
    and similarity(title, p_query) > 0.2
  order by similarity(title, p_query) desc
  limit p_limit
$$;

grant execute on function public.search_listings_fuzzy(text, integer) to authenticated;
```

---

## Search Mechanics

Two layers, fallback only — not blended on every query, since the fallback is explicitly for misspellings and shouldn't run on the common case:

1. **Primary — prefix match on `search_tsv`.** Built in TypeScript, not SQL: `lib/discovery/search.ts` exports `buildPrefixTsQuery(input: string): string`, a pure, unit-tested function that sanitizes input (strips characters with tsquery syntax meaning), splits on whitespace, appends `:*` to each token, and joins with `&` — `"casio"` → `"casio:*"`, `"lab gown"` → `"lab:* & gown:*"`. The result is passed to supabase-js's `.textSearch('search_tsv', query)`, which lets PostgREST call `to_tsquery` server-side with that exact syntax. This alone covers the acceptance criterion's three example terms (`calcu`, `casio`, `calculator`) — they're real prefixes/whole words of an indexed title, not actual misspellings.
2. **Fallback — trigram similarity, only when (1) returns zero rows.** Calls `search_listings_fuzzy` via `supabase.rpc(...)`.

---

## Filters

All optional, all in `searchParams`, validated by a Zod schema (`lib/discovery/schemas.ts`):

| Param       | Values                                                | Effect                                                                                           |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `intent`    | `swap` \| `sale` \| `give`                            | `listings.intent = :intent`                                                                      |
| `category`  | category slug                                         | join/filter on `categories.slug`                                                                 |
| `condition` | `new` \| `like_new` \| `good` \| `fair` \| `worn`     | `listings.condition = :condition`                                                                |
| `price`     | `under-200` \| `200-500` \| `500-1000` \| `1000-plus` | maps to an `ask_centavos` range; **implicitly forces `intent = sale`** (swap/give have no price) |
| `photos`    | `1`                                                   | `exists (select 1 from listing_images where listing_id = listings.id)`                           |
| `q`         | free text                                             | drives the search layer above                                                                    |

`price` overriding `intent` (rather than erroring if both are set to conflicting values) keeps the filter combination always well-defined — a URL with `price=200-500&intent=swap` just resolves to "sale items in that price band," which is what the price filter alone would already mean.

---

## UI Components

**Feed screen:**

- `SearchBar` (client) — debounced input matching the mockup's search bar. Focused + empty shows a dropdown of the user's last few `search_events.query` values (tap to re-run).
- `FilterChips` (client) — the mockup's pill row (All/Swap/Sale/Give + category) drives `intent` directly. A trailing "Filters" chip opens a bottom `Sheet` (reusing Phase 2's component) holding category/condition/price-band/has-photos controls — those four don't fit as inline chips and have no mockup.
- `FeedList` (client) — receives the SSR'd first page as props; renders `Chit`s; owns the `IntersectionObserver` + `loadMoreListings` call for infinite scroll; shows `ChitSkeleton` placeholders (new component, same footprint as `Chit`, pulsing blocks) while a page loads; on a failed load-more, shows an inline "Couldn't load more — retry" affordance rather than failing silently.
- `SaveToggleButton` (client) — absolutely-positioned over each feed `Chit` rather than added to `Chit`'s own prop API, continuing Phase 2's "wrap, don't widen" precedent for that component.

**`app/(app)/ako/page.tsx`:** a second `MiniListingRow` list, "Saved," below the existing "Your listings" — same component, fed by `getSavedListings(userId)`.

---

## Empty States

Three distinct states, not one generic one:

1. **No listings exist anywhere** — Phase 2's existing "Nothing on the floor yet" copy, unchanged.
2. **Filters/search active, zero matches** — "Nothing matches yet. Try different words, or check back later." No CTA promising a feature that doesn't exist (see Context).
3. **Bantayan, nothing saved** — "Nothing saved yet. Tap the bookmark on anything you want to find again."

---

## Server-Side Helpers

```
lib/
  discovery/
    schemas.ts    — Zod: filter searchParams, save/unsave input
    search.ts     — buildPrefixTsQuery() (pure, unit-tested)
    format.ts     — price-band <-> centavos-range mapping
    queries.ts    — getFeedListings(filters, cursor?), getSavedListings(userId)
    actions.ts    — loadMoreListings(), saveListing(), unsaveListing(), logSearchEvent()
components/ui/
  ChitSkeleton.tsx
app/(app)/
  page.tsx                — extended: reads searchParams, renders SearchBar/FilterChips/FeedList
  SearchBar.tsx
  FilterChips.tsx
  FilterSheet.tsx
  FeedList.tsx
  SaveToggleButton.tsx
```

---

## pgTAP Tests

File: `supabase/tests/phase3_discovery_rls.sql`

1. `pg_trgm` extension is installed
2. `authenticated` has SELECT/INSERT/UPDATE/DELETE on `saved_listings` (plain RLS-gated table, own rows only)
3. `authenticated` has SELECT/INSERT (not UPDATE/DELETE) on `search_events`
4. `search_listings_fuzzy` exists, is granted EXECUTE to `authenticated`, and is **not** `SECURITY DEFINER` (`pg_proc.prosecdef = false`) — it must honor RLS, not bypass it
5. `saved_listings` and `search_events` RLS policies exist and reference `auth.uid()` (structural check, matching the style established in Phase 1/2's test files)

---

## Acceptance Criteria

| Criterion (build-spec §6)                                             | Proof                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Feed TTI < 2.5s on throttled 3G                                       | `e2e/feed-tti.spec.ts` — CDP-emulated Regular 3G, asserts first chit visible under 2.5s    |
| Searching `calcu`, `casio`, `calculator` all surface the same listing | `e2e/fuzzy-search.spec.ts`                                                                 |
| Filters survive a refresh and a share                                 | `e2e/filters-survive-refresh.spec.ts` — reload, and a fresh navigation to the captured URL |
| Save/unsave reflected in Bantayan                                     | `e2e/save-listing.spec.ts`                                                                 |
| TypeScript clean                                                      | `tsc --noEmit` exits 0                                                                     |
| ESLint clean                                                          | `eslint . --max-warnings 0` exits 0                                                        |
| Build clean                                                           | `npm run build` exits 0                                                                    |
