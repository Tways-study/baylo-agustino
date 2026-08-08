-- supabase/migrations/20261015000000_phase8_auth_rate_limiting.sql
-- Phase 8: app-level, per-email auth rate limiting. Supplements (does not
-- replace) supabase/config.toml's platform-level [auth.rate_limit] block,
-- which is IP-based and coarse — campus Wi-Fi/CGNAT means many students can
-- share one IP, so it both under-protects a single targeted account from a
-- rotating attacker and over-blocks unrelated students behind the same NAT.
-- Same hand-rolled-per-RPC pattern already used for listings (10/day,
-- 20260801000000_phase2_listings.sql) and reports (10/24h,
-- 20260917000000_phase6_trust_safety.sql): a SECURITY DEFINER function is
-- the only door onto a deny-all-RLS table, same as reports/audit_log.

-- ═══ email_send_attempts — throttles OTP send + password-reset send ═══
create table public.email_send_attempts (
  id bigserial primary key,
  email text not null,
  action text not null check (action in ('otp', 'password_reset')),
  created_at timestamptz not null default now()
);
create index on public.email_send_attempts (email, action, created_at);
alter table public.email_send_attempts enable row level security;
-- No policies at all — zero direct client access, same as reports/audit_log
-- in Phase 6. check_and_log_email_send() below is the only way in.

create or replace function public.check_and_log_email_send(p_email text, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_count integer;
begin
  if p_action not in ('otp', 'password_reset') then
    raise exception 'Invalid action.';
  end if;

  select count(*) into v_recent_count
  from public.email_send_attempts
  where email = lower(p_email) and action = p_action and created_at > now() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'Too many codes requested. Wait a bit before trying again.';
  end if;

  insert into public.email_send_attempts (email, action) values (lower(p_email), p_action);
end;
$$;

-- Must be anon-callable: OTP send and password-reset send both happen
-- pre-session (the caller has no auth.uid() yet).
grant execute on function public.check_and_log_email_send(text, text) to anon, authenticated;
revoke execute on function public.check_and_log_email_send(text, text) from public;

-- ═══ login_attempts — throttles password sign-in by failure count ═══
create table public.login_attempts (
  id bigserial primary key,
  email text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index on public.login_attempts (email, created_at);
alter table public.login_attempts enable row level security;
-- No policies — same deny-all-by-default pattern as email_send_attempts.

create or replace function public.check_login_rate_limit(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_failures integer;
begin
  select count(*) into v_recent_failures
  from public.login_attempts
  where email = lower(p_email) and success = false and created_at > now() - interval '15 minutes';

  if v_recent_failures >= 5 then
    raise exception 'Too many failed attempts. Wait 15 minutes before trying again.';
  end if;
end;
$$;

grant execute on function public.check_login_rate_limit(text) to anon, authenticated;
revoke execute on function public.check_login_rate_limit(text) from public;

create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.login_attempts (email, success) values (lower(p_email), p_success);
end;
$$;

grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated;
revoke execute on function public.record_login_attempt(text, boolean) from public;
