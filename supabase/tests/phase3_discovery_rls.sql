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
