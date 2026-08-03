-- supabase/migrations/20260915000000_phase5_deal_room.sql
-- Phase 5: deal room — chat, meetup scheduling, two-sided completion,
-- cancellation. All tables ship with RLS enabled in this same file, per
-- project convention.

-- ═══ complete the offer_status enum ═══
-- Phase 4's migration comment claimed this was "reserved" but never
-- actually added it (create type ... as enum listed 7 values, not 8) —
-- this is what adds it for real.
alter type public.offer_status add value 'completed';

-- ═══ meetups — propose + confirm, not a negotiation chain ═══
create table public.meetups (
  offer_id      uuid primary key references public.offers on delete cascade,
  spot_id       smallint not null references public.meetup_spots,
  scheduled_at  timestamptz not null,
  proposed_by   uuid not null references public.profiles,
  confirmed_by_offerer boolean not null default false,
  confirmed_by_owner   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.meetups enable row level security;
revoke insert, update, delete on public.meetups from authenticated;

create policy "meetups visible to the two parties"
  on public.meetups for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = meetups.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ messages ═══
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references public.offers on delete cascade,
  sender_id  uuid not null references public.profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.messages (offer_id, created_at desc);
alter table public.messages enable row level security;
revoke insert, update, delete on public.messages from authenticated;

create policy "messages visible to the two parties"
  on public.messages for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = messages.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

create policy "a party can send a message while the deal is open"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.offers
      where offers.id = messages.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
        and offers.status in ('pending', 'accepted')
    )
  );

-- Column-level, not table-level: a client must not be able to backdate
-- created_at or pre-mark its own message read. read_at has no UPDATE grant
-- yet — nothing in this phase marks messages read; add a narrow grant
-- (mirrors notifications.read_at below) if read-receipts ship later.
grant insert (offer_id, sender_id, body) on public.messages to authenticated;

-- Realtime: postgres_changes only fires for tables in this publication.
-- Realtime replays only rows a subscriber's own RLS SELECT policy already
-- allows, which is what makes "a third user cannot subscribe to a deal
-- channel they aren't party to" true without a second authorization surface.
alter publication supabase_realtime add table public.messages;

-- ═══ deal_confirmations — two-sided completion ═══
create table public.deal_confirmations (
  offer_id     uuid not null references public.offers on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);
alter table public.deal_confirmations enable row level security;
revoke insert, update, delete on public.deal_confirmations from authenticated;

create policy "deal confirmations visible to the two parties"
  on public.deal_confirmations for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = deal_confirmations.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ offer_cancellations — signal only, Phase 6 turns this into show_up_rate ═══
create table public.offer_cancellations (
  offer_id     uuid primary key references public.offers on delete cascade,
  cancelled_by uuid not null references public.profiles,
  reason_code  text not null check (reason_code in
                 ('changed_mind', 'item_unavailable', 'unreachable',
                  'scheduling_conflict', 'other')),
  reason_text  text check (char_length(reason_text) <= 300),
  was_late     boolean not null,
  created_at   timestamptz not null default now()
);
alter table public.offer_cancellations enable row level security;
revoke insert, update, delete on public.offer_cancellations from authenticated;

create policy "cancellation record visible to the two parties"
  on public.offer_cancellations for select
  using (
    exists (
      select 1 from public.offers
      where offers.id = offer_cancellations.offer_id
        and auth.uid() in (offers.from_user_id, offers.to_user_id)
    )
  );

-- ═══ extend notifications.kind for the 3 new event types ═══
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in
  ('offer_received', 'offer_countered', 'offer_accepted', 'offer_declined',
   'offer_withdrawn', 'offer_expired',
   'meetup_proposed', 'deal_completed', 'deal_cancelled'));

-- ═══ propose_meetup ═══
create or replace function public.propose_meetup(
  p_offer_id uuid,
  p_spot_id smallint,
  p_scheduled_at timestamptz
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
  v_owner_id uuid;
  v_is_owner boolean;
begin
  select o.from_user_id, o.to_user_id, o.status, l.owner_id
    into v_from_user, v_to_user, v_status, v_owner_id
    from public.offers o
    join public.listings l on l.id = o.listing_id
    where o.id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'A meetup can only be scheduled for an accepted offer.';
  end if;
  if not exists (select 1 from public.meetup_spots where id = p_spot_id and active) then
    raise exception 'Pick a listed meetup spot.';
  end if;

  v_is_owner := v_caller = v_owner_id;

  insert into public.meetups (
    offer_id, spot_id, scheduled_at, proposed_by,
    confirmed_by_offerer, confirmed_by_owner
  ) values (
    p_offer_id, p_spot_id, p_scheduled_at, v_caller,
    not v_is_owner, v_is_owner
  )
  on conflict (offer_id) do update set
    spot_id = excluded.spot_id,
    scheduled_at = excluded.scheduled_at,
    proposed_by = excluded.proposed_by,
    confirmed_by_offerer = excluded.confirmed_by_offerer,
    confirmed_by_owner = excluded.confirmed_by_owner,
    updated_at = now();

  insert into public.notifications (user_id, offer_id, kind)
  values (case when v_caller = v_from_user then v_to_user else v_from_user end, p_offer_id, 'meetup_proposed');
end;
$$;

grant execute on function public.propose_meetup(uuid, smallint, timestamptz) to authenticated;

-- ═══ confirm_meetup ═══
create or replace function public.confirm_meetup(p_offer_id uuid)
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
  v_owner_id uuid;
  v_is_owner boolean;
begin
  select o.from_user_id, o.to_user_id, o.status, l.owner_id
    into v_from_user, v_to_user, v_status, v_owner_id
    from public.offers o
    join public.listings l on l.id = o.listing_id
    where o.id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'This deal is no longer active.';
  end if;
  if not exists (select 1 from public.meetups where offer_id = p_offer_id) then
    raise exception 'No meetup has been proposed yet.';
  end if;

  v_is_owner := v_caller = v_owner_id;

  update public.meetups
  set confirmed_by_offerer = case when v_is_owner then confirmed_by_offerer else true end,
      confirmed_by_owner   = case when v_is_owner then true else confirmed_by_owner end,
      updated_at = now()
  where offer_id = p_offer_id;
end;
$$;

grant execute on function public.confirm_meetup(uuid) to authenticated;

-- ═══ mark_swapped ═══
create or replace function public.mark_swapped(p_offer_id uuid)
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
begin
  select from_user_id, to_user_id, status into v_from_user, v_to_user, v_status
    from public.offers where id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'This deal is no longer active.';
  end if;

  insert into public.deal_confirmations (offer_id, user_id)
  values (p_offer_id, v_caller)
  on conflict (offer_id, user_id) do nothing;
end;
$$;

grant execute on function public.mark_swapped(uuid) to authenticated;

-- ═══ completion trigger — the only path to offers.status = 'completed' ═══
create or replace function public.complete_deal_on_double_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirm_count integer;
  v_listing_id uuid;
begin
  select count(*) into v_confirm_count
    from public.deal_confirmations where offer_id = new.offer_id;

  if v_confirm_count >= 2 then
    select listing_id into v_listing_id from public.offers where id = new.offer_id;

    update public.offers set status = 'completed' where id = new.offer_id and status = 'accepted';
    update public.listings set status = 'completed' where id = v_listing_id;

    -- Both parties get the receipt, not just "the other one" — unlike
    -- accept/decline/counter, both sides already actively participated in
    -- reaching this state, so there's no single "other party" to notify.
    insert into public.notifications (user_id, offer_id, kind)
    select unnest(array[o.from_user_id, o.to_user_id]), new.offer_id, 'deal_completed'
    from public.offers o where o.id = new.offer_id;
  end if;

  return new;
end;
$$;

create trigger complete_deal_after_second_confirmation
  after insert on public.deal_confirmations
  for each row execute function public.complete_deal_on_double_confirmation();

-- ═══ cancel_deal ═══
create or replace function public.cancel_deal(
  p_offer_id uuid,
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
  v_from_user uuid;
  v_to_user uuid;
  v_listing_id uuid;
  v_status public.offer_status;
  v_scheduled_at timestamptz;
  v_was_late boolean;
begin
  select o.from_user_id, o.to_user_id, o.listing_id, o.status
    into v_from_user, v_to_user, v_listing_id, v_status
    from public.offers o where o.id = p_offer_id;

  if v_from_user is null then
    raise exception 'Offer not found.';
  end if;
  if v_caller not in (v_from_user, v_to_user) then
    raise exception 'You are not a party to this offer.';
  end if;
  if v_status <> 'accepted' then
    raise exception 'Only an accepted deal that has not yet been swapped or cancelled can be cancelled.';
  end if;
  if p_reason_code not in ('changed_mind', 'item_unavailable', 'unreachable', 'scheduling_conflict', 'other') then
    raise exception 'Pick a valid cancellation reason.';
  end if;

  select scheduled_at into v_scheduled_at from public.meetups where offer_id = p_offer_id;
  v_was_late := v_scheduled_at is not null and now() >= v_scheduled_at - interval '2 hours';

  update public.offers set status = 'cancelled', responded_at = now() where id = p_offer_id;
  update public.listings set status = 'active' where id = v_listing_id;

  insert into public.offer_cancellations (offer_id, cancelled_by, reason_code, reason_text, was_late)
  values (p_offer_id, v_caller, p_reason_code, nullif(p_reason_text, ''), coalesce(v_was_late, false));

  insert into public.notifications (user_id, offer_id, kind)
  values (case when v_caller = v_from_user then v_to_user else v_from_user end, p_offer_id, 'deal_cancelled');
end;
$$;

grant execute on function public.cancel_deal(uuid, text, text) to authenticated;
