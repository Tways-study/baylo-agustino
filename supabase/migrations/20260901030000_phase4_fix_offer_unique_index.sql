-- supabase/migrations/20260901030000_phase4_fix_offer_unique_index.sql
-- Fix: `one_live_offer_per_pair`'s predicate did not match its own comment.
--
-- 20260901000000_phase4_offers.sql created:
--   create unique index one_live_offer_per_pair
--     on public.offers (listing_id, from_user_id)
--     where status = 'pending';
-- with the comment "one live (pending) root-level offer per listing+offerer
-- pair" — but the predicate filtered only on status, not on root-level-ness.
--
-- Counters are ordinary rows in the same `offers` table with
-- from_user_id = <the listing owner at that point in the chain>.
-- accept_offer explicitly documents that other pending offers on the same
-- listing stay alive after an accept — concurrent negotiations on the same
-- listing are supported by design. The moment the listing owner counters a
-- second concurrent offer on the same listing, both counters have
-- from_user_id = the owner and status = 'pending', and the old predicate
-- collides them under this index, raising a raw 23505 that leaks to the
-- user via lib/offers/actions.ts's `error?.message` passthrough in
-- counterOffer.
--
-- Fix: add `and parent_offer_id is null` so the index only ever constrains
-- root offers (parent_offer_id is null only on the first offer of a chain),
-- matching the comment's stated intent. Countered rows already flip out of
-- 'pending' before a counter is inserted, so this predicate doesn't need to
-- account for status transitions beyond what already existed — it only
-- needed to stop matching counter rows at all.

drop index public.one_live_offer_per_pair;

create unique index one_live_offer_per_pair
  on public.offers (listing_id, from_user_id)
  where status = 'pending' and parent_offer_id is null;

comment on index public.one_live_offer_per_pair is
  'One live (pending) ROOT-level offer per listing+offerer pair. Excludes
   counters (parent_offer_id is not null) so concurrent negotiations on the
   same listing — and the listing owner countering more than one of them —
   are never blocked by this index.';
