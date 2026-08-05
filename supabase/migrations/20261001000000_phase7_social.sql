-- Phase 7 — Social Layer
-- Tables: wants, follows
-- Materialized view: pulse_stats
-- Notifications: add want_id column, expand kind check to include hanap_match
-- Trigger: notify open Hanap owners when a matching listing is posted

-- ═══ wants ═══
create table public.wants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  details text check (char_length(details) <= 500),
  budget_centavos integer check (budget_centavos > 0),
  offering text check (char_length(offering) <= 200),
  status text not null default 'open' check (status in ('open', 'closed')),
  search_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(details, ''))
  ) stored,
  created_at timestamptz not null default now()
);
create index on public.wants using gin (search_tsv);
create index on public.wants (user_id, created_at desc);
create index on public.wants (status, created_at desc);
alter table public.wants enable row level security;
revoke insert, update, delete on public.wants from authenticated;

create policy "open wants are readable by verified members"
  on public.wants for select
  using (auth.uid() is not null and status = 'open');

-- ═══ follows ═══
create table public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  followee_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on public.follows (followee_id);
alter table public.follows enable row level security;
revoke insert, update, delete on public.follows from authenticated;

create policy "follows are readable by verified members"
  on public.follows for select
  using (auth.uid() is not null);

-- ═══ pulse_stats materialized view ═══
-- Nightly refresh via pg_cron (added below). Single-row aggregate.
create materialized view public.pulse_stats as
select
  (
    select count(*)::integer
    from public.offers
    where status = 'completed'
      and responded_at >= now() - interval '7 days'
  ) as swaps_this_week,
  (
    select title
    from public.wants
    where status = 'open'
    group by title
    order by count(*) desc
    limit 1
  ) as top_wanted,
  (
    select program
    from public.profiles
    where program is not null
    group by program
    order by sum(completed_deals) desc
    limit 1
  ) as most_active_program;

-- Seed with one row so the view is never empty
refresh materialized view public.pulse_stats;

grant select on public.pulse_stats to authenticated;
grant select on public.pulse_stats to anon;

-- Nightly refresh at midnight Asia/Manila (UTC+8 = 16:00 UTC)
select cron.schedule(
  'refresh-pulse-stats',
  '0 16 * * *',
  'refresh materialized view public.pulse_stats'
);

-- ═══ extend notifications for Phase 7 ═══
-- Add want_id so hanap_match notifications can reference the matched want.
alter table public.notifications
  add column want_id uuid references public.wants on delete cascade;

-- Expand kind check to include Phase 7 event types.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'offer_received', 'offer_countered', 'offer_accepted', 'offer_declined',
  'offer_withdrawn', 'offer_expired',
  'meetup_proposed', 'deal_completed', 'deal_cancelled',
  'listing_removed', 'account_suspended',
  'hanap_match'
));

-- ═══ post_want RPC ═══
create or replace function public.post_want(
  p_title text,
  p_details text,
  p_budget_centavos integer,
  p_offering text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.wants (user_id, title, details, budget_centavos, offering)
  values (v_caller, p_title, p_details, p_budget_centavos, p_offering)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.post_want(text, text, integer, text) to authenticated;
revoke execute on function public.post_want(text, text, integer, text) from public;
revoke execute on function public.post_want(text, text, integer, text) from anon;

-- ═══ close_want RPC ═══
create or replace function public.close_want(p_want_id uuid)
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

  update public.wants
  set status = 'closed'
  where id = p_want_id and user_id = v_caller;

  if not found then
    raise exception 'Want not found or not yours.';
  end if;
end;
$$;

grant execute on function public.close_want(uuid) to authenticated;
revoke execute on function public.close_want(uuid) from public;
revoke execute on function public.close_want(uuid) from anon;

-- ═══ follow_user RPC ═══
create or replace function public.follow_user(p_followee_id uuid)
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

  if v_caller = p_followee_id then
    raise exception 'Cannot follow yourself.';
  end if;

  insert into public.follows (follower_id, followee_id)
  values (v_caller, p_followee_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.follow_user(uuid) to authenticated;
revoke execute on function public.follow_user(uuid) from public;
revoke execute on function public.follow_user(uuid) from anon;

-- ═══ unfollow_user RPC ═══
create or replace function public.unfollow_user(p_followee_id uuid)
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

  delete from public.follows
  where follower_id = v_caller and followee_id = p_followee_id;
end;
$$;

grant execute on function public.unfollow_user(uuid) to authenticated;
revoke execute on function public.unfollow_user(uuid) from public;
revoke execute on function public.unfollow_user(uuid) from anon;

-- ═══ Hanap match trigger ═══
-- Fires after a listing is inserted with status='active'. Notifies owners of
-- open wants whose search_tsv matches the new listing title.
-- Skips the listing owner's own wants (no self-notification).
-- Uses websearch_to_tsquery for robustness vs. bare to_tsquery.
create or replace function public.tr_listings_notify_hanap_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    insert into public.notifications (user_id, listing_id, want_id, kind)
    select w.user_id, new.id, w.id, 'hanap_match'
    from public.wants w
    where w.status = 'open'
      and w.user_id <> new.owner_id
      and w.search_tsv @@ websearch_to_tsquery('simple', new.title);
  end if;
  return new;
end;
$$;

create trigger tr_listings_notify_hanap_matches
  after insert on public.listings
  for each row execute function public.tr_listings_notify_hanap_matches();
