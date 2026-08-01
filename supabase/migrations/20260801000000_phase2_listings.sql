-- supabase/migrations/20260801000000_phase2_listings.sql
-- Phase 2: Listings — all tables ship with RLS enabled in this same file.

-- ═══ categories ═══
create table public.categories (
  id smallint primary key generated always as identity,
  slug text not null unique,
  name text not null,
  position smallint not null default 0
);
alter table public.categories enable row level security;

create policy "categories readable by authenticated"
  on public.categories for select
  using (auth.uid() is not null);

insert into public.categories (slug, name, position) values
  ('textbooks',       'Textbooks & reviewers',   0),
  ('electronics',     'Electronics & gadgets',   1),
  ('uniforms-pe',      'Uniforms & PE gear',      2),
  ('dorm-living',     'Dorm & living',           3),
  ('school-supplies', 'School supplies',         4),
  ('org-merch',       'Org merch',               5),
  ('food-snacks',     'Food & snacks',           6),
  ('services',        'Services',                7),
  ('other',           'Other',                   8);

-- ═══ meetup_spots seed ═══
-- Placeholder / illustrative spots for University of San Agustin, Iloilo.
-- MUST be validated with campus security before launch (build-spec §9).
insert into public.meetup_spots (name, hint, is_camera_covered, active) values
  ('Library lobby',             'Ground floor, beside the guard desk', true,  true),
  ('Main building canteen',     'Near the payment counter',            true,  true),
  ('Gate 1 (Gen. Luna St.)',    'Guard post, outside the turnstile',   true,  true),
  ('COE building lobby',        'Ground floor entrance',               false, true),
  ('Nursing building entrance', 'Beside the bulletin board',           false, true),
  ('Gymnasium entrance',        'Main doors facing the quadrangle',    false, true);

-- ═══ listings ═══
create type public.listing_intent as enum ('swap','sale','give');
create type public.listing_status as enum ('draft','active','reserved','completed','archived','removed');

create sequence public.listing_code_seq start 1;

create or replace function public.generate_listing_code()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'BA-' || lpad(nextval('public.listing_code_seq')::text, 4, '0')
$$;

create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  owner_id       uuid not null references public.profiles on delete cascade,
  intent         public.listing_intent not null,
  title          text not null check (char_length(title) between 3 and 80),
  description    text check (char_length(description) <= 1200),
  category_id    smallint references public.categories,
  condition      text check (condition in ('new','like_new','good','fair','worn')),
  ask_centavos   integer check (ask_centavos >= 0),
  accepts_cash   boolean not null default false,
  status         public.listing_status not null default 'draft',
  meetup_spot_id smallint references public.meetup_spots,
  search_tsv     tsvector generated always as (
                   to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))
                 ) stored,
  view_count     integer not null default 0,
  created_at     timestamptz not null default now(),
  bumped_at      timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 days',
  constraint sale_requires_price
    check (intent <> 'sale' or ask_centavos is not null),
  constraint give_suppresses_price
    check (intent <> 'give' or (ask_centavos is null and accepts_cash = false))
);
create index on public.listings using gin (search_tsv);
create index on public.listings (status, bumped_at desc);
create index on public.listings (owner_id);
alter table public.listings enable row level security;

-- All writes go through RPCs — no direct INSERT/UPDATE/DELETE.
revoke insert, update, delete on public.listings from authenticated;

create policy "listings readable by verified members"
  on public.listings for select
  using (
    auth.uid() is not null
    and (
      owner_id = auth.uid()
      or (
        status in ('active','reserved','completed')
        and not public.is_blocked_by(listings.owner_id, auth.uid())
      )
    )
  );

-- ═══ listing_images ═══
create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings on delete cascade,
  storage_path text not null,
  position smallint not null default 0,
  unique (listing_id, position)
);
alter table public.listing_images enable row level security;
revoke insert, update, delete on public.listing_images from authenticated;

create policy "listing images readable with parent listing"
  on public.listing_images for select
  using (exists (select 1 from public.listings where listings.id = listing_images.listing_id));

-- ═══ listing_wants ═══
create table public.listing_wants (
  id bigserial primary key,
  listing_id uuid not null references public.listings on delete cascade,
  label text not null check (char_length(label) <= 80),
  position smallint not null default 0
);
alter table public.listing_wants enable row level security;
revoke insert, update, delete on public.listing_wants from authenticated;

create policy "listing wants readable with parent listing"
  on public.listing_wants for select
  using (exists (select 1 from public.listings where listings.id = listing_wants.listing_id));

-- ═══ swap → ≥1 want invariant (cross-table, must be deferred) ═══
create or replace function public.enforce_swap_requires_want()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_id uuid;
  v_intent public.listing_intent;
  v_status public.listing_status;
  v_want_count integer;
begin
  -- NEW/OLD are typed to whichever table fired this trigger, so field
  -- access must be a procedural if/else (each branch compiled only when
  -- it actually executes) rather than a single CASE expression — a CASE
  -- expression is compiled as one plan against NEW's fixed row type, so
  -- `new.listing_id` fails to resolve even in an unreached branch when
  -- this fires on `listings` (which has no listing_id column).
  if tg_table_name = 'listings' then
    v_listing_id := coalesce(new.id, old.id);
  else
    v_listing_id := coalesce(new.listing_id, old.listing_id);
  end if;

  select intent, status into v_intent, v_status from public.listings where id = v_listing_id;

  if v_intent = 'swap' and v_status = 'active' then
    select count(*) into v_want_count from public.listing_wants where listing_id = v_listing_id;
    if v_want_count = 0 then
      raise exception 'Swap listings need at least one thing you would take in return.';
    end if;
  end if;

  return null;
end;
$$;

create constraint trigger swap_requires_want_on_listings
  after insert or update of intent, status on public.listings
  deferrable initially deferred
  for each row execute function public.enforce_swap_requires_want();

create constraint trigger swap_requires_want_on_wants
  after insert or update or delete on public.listing_wants
  deferrable initially deferred
  for each row execute function public.enforce_swap_requires_want();

-- ═══ create_listing RPC ═══
create or replace function public.create_listing(
  p_id uuid,
  p_intent public.listing_intent,
  p_title text,
  p_description text,
  p_category_id smallint,
  p_condition text,
  p_ask_centavos integer,
  p_accepts_cash boolean,
  p_meetup_spot_id smallint,
  p_wants text[],
  p_image_paths text[]
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_code text;
  v_recent_count integer;
begin
  if v_owner is null then
    raise exception 'Not authenticated.';
  end if;

  if p_image_paths is not null and array_length(p_image_paths, 1) > 4 then
    raise exception 'Up to 4 photos.';
  end if;

  select count(*) into v_recent_count
  from public.listings
  where owner_id = v_owner and created_at > now() - interval '24 hours';

  if v_recent_count >= 10 then
    raise exception 'You have reached today''s limit of 10 listings. Try again tomorrow.';
  end if;

  v_code := public.generate_listing_code();

  insert into public.listings (
    id, code, owner_id, intent, title, description, category_id, condition,
    ask_centavos, accepts_cash, status, meetup_spot_id, bumped_at, expires_at
  ) values (
    p_id, v_code, v_owner, p_intent, p_title, nullif(p_description, ''),
    p_category_id, p_condition,
    case when p_intent = 'give' then null else p_ask_centavos end,
    case when p_intent = 'give' then false else coalesce(p_accepts_cash, false) end,
    'active', p_meetup_spot_id, now(), now() + interval '30 days'
  );

  if p_wants is not null and array_length(p_wants, 1) > 0 then
    insert into public.listing_wants (listing_id, label, position)
    select p_id, w, ord - 1 from unnest(p_wants) with ordinality as t(w, ord);
  end if;

  if p_image_paths is not null and array_length(p_image_paths, 1) > 0 then
    insert into public.listing_images (listing_id, storage_path, position)
    select p_id, path, ord - 1 from unnest(p_image_paths) with ordinality as t(path, ord);
  end if;

  return query select p_id, v_code;
end;
$$;

grant execute on function public.create_listing(
  uuid, public.listing_intent, text, text, smallint, text, integer, boolean,
  smallint, text[], text[]
) to authenticated;

-- ═══ update_listing RPC (fields + wants; photos not editable in Phase 2) ═══
create or replace function public.update_listing(
  p_id uuid,
  p_title text,
  p_description text,
  p_category_id smallint,
  p_condition text,
  p_ask_centavos integer,
  p_accepts_cash boolean,
  p_meetup_spot_id smallint,
  p_wants text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_intent public.listing_intent;
begin
  select owner_id, intent into v_owner, v_intent from public.listings where id = p_id;

  if v_owner is null then
    raise exception 'Listing not found.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'You can only edit your own listings.';
  end if;

  update public.listings set
    title = p_title,
    description = nullif(p_description, ''),
    category_id = p_category_id,
    condition = p_condition,
    ask_centavos = case when v_intent = 'give' then null else p_ask_centavos end,
    accepts_cash = case when v_intent = 'give' then false else coalesce(p_accepts_cash, false) end,
    meetup_spot_id = p_meetup_spot_id
  where id = p_id;

  if p_wants is not null then
    delete from public.listing_wants where listing_id = p_id;
    if array_length(p_wants, 1) > 0 then
      insert into public.listing_wants (listing_id, label, position)
      select p_id, w, ord - 1 from unnest(p_wants) with ordinality as t(w, ord);
    end if;
  end if;
end;
$$;

grant execute on function public.update_listing(
  uuid, text, text, smallint, text, integer, boolean, smallint, text[]
) to authenticated;

-- ═══ archive_listing RPC ═══
create or replace function public.archive_listing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings set status = 'archived' where id = p_id and owner_id = auth.uid();
  if not found then
    raise exception 'Listing not found or not yours.';
  end if;
end;
$$;

grant execute on function public.archive_listing(uuid) to authenticated;

-- ═══ bump_listing RPC (72h rate limit; also rescues from soft-expiry) ═══
create or replace function public.bump_listing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_status public.listing_status;
  v_bumped_at timestamptz;
begin
  select owner_id, status, bumped_at into v_owner, v_status, v_bumped_at
  from public.listings where id = p_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Listing not found or not yours.';
  end if;
  if v_status <> 'active' then
    raise exception 'Only active listings can be bumped.';
  end if;
  if now() - v_bumped_at < interval '72 hours' then
    raise exception 'You can bump this listing again in about % hours.',
      ceil(extract(epoch from (v_bumped_at + interval '72 hours' - now())) / 3600);
  end if;

  update public.listings
  set bumped_at = now(),
      expires_at = greatest(expires_at, now() + interval '30 days')
  where id = p_id;
end;
$$;

grant execute on function public.bump_listing(uuid) to authenticated;

-- ═══ increment_listing_view RPC (view_count not directly writable) ═══
create or replace function public.increment_listing_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings set view_count = view_count + 1 where id = p_id;
end;
$$;

grant execute on function public.increment_listing_view(uuid) to authenticated;

-- ═══ Storage: listing-images bucket ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', false, 409600, array['image/webp'])
on conflict (id) do nothing;

create policy "users write only into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own listing images"
  on storage.objects for update to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own listing images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing images readable by authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'listing-images');
