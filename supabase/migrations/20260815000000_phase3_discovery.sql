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
