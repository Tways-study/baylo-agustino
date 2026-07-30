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
revoke insert (verified_at, trust_score, show_up_rate, is_suspended, completed_deals)
  on public.profiles from authenticated;

create policy "profiles readable by authenticated"
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
  select email ~* '^[^@]+@usa\.edu\.ph$'
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

-- ═══ complete_onboarding RPC ═══
-- Runs as SECURITY DEFINER so it can write verified_at (restricted column).
create or replace function public.complete_onboarding(
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
  values (auth.uid(), p_policy_version)
  on conflict (user_id, policy_version) do nothing;
end;
$$;

-- Grant execute so authenticated clients can call this RPC
grant execute on function public.complete_onboarding(text, text, smallint, text, integer) to authenticated;

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
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar readable by authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
