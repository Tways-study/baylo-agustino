-- supabase/migrations/20261020000000_phase8_deletable_profiles.sql
-- Phase 8: self-serve account deletion (lib/account/actions.ts) calls
-- Supabase's admin.deleteUser(), which cascades from auth.users ->
-- profiles.id (Phase 1) -> every domain table with `on delete cascade`.
-- Four columns were left as plain `references public.profiles` (implicit
-- ON DELETE NO ACTION / RESTRICT) instead: meetups.proposed_by,
-- offer_cancellations.cancelled_by, reports.resolved_by, and
-- audit_log.actor_id. Any user who ever proposed a meetup, cancelled a
-- deal, resolved a report, or performed an audited admin action would make
-- their own account undeletable — the profiles delete would hit one of
-- these and the whole deleteUser() call would fail with a foreign-key
-- violation. Switching these four to ON DELETE SET NULL preserves the
-- historical row (action/reason/target stay intact) while letting the
-- actor identity go — the record survives, just anonymized once the
-- account is gone. This is the correct trade-off between giving users a
-- real deletion path and keeping the audit trail meaningful; it is not the
-- same call as the cascade-everything pattern used for a user's own
-- listings/offers/messages, which really should disappear with them.

alter table public.meetups alter column proposed_by drop not null;
alter table public.meetups
  drop constraint meetups_proposed_by_fkey,
  add constraint meetups_proposed_by_fkey
    foreign key (proposed_by) references public.profiles on delete set null;

alter table public.offer_cancellations alter column cancelled_by drop not null;
alter table public.offer_cancellations
  drop constraint offer_cancellations_cancelled_by_fkey,
  add constraint offer_cancellations_cancelled_by_fkey
    foreign key (cancelled_by) references public.profiles on delete set null;

alter table public.reports
  drop constraint reports_resolved_by_fkey,
  add constraint reports_resolved_by_fkey
    foreign key (resolved_by) references public.profiles on delete set null;

alter table public.audit_log alter column actor_id drop not null;
alter table public.audit_log
  drop constraint audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
    foreign key (actor_id) references public.profiles on delete set null;
