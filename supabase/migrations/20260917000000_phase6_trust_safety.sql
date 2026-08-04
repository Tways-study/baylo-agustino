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
