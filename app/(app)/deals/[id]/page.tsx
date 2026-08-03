import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { getOfferThread } from '@/lib/offers/queries'
import { getMeetup, getMessages, getDealConfirmations, getCancellation } from '@/lib/deals/queries'
import { getMeetupSpots } from '@/lib/listings/queries'
import { createClient } from '@/lib/supabase/server'
import { Ribbon } from '@/components/ui'
import { OfferThread, type ThreadListing, type ThreadItem } from './OfferThread'
import { CancelMenuButton } from './CancelMenuButton'

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const thread = await getOfferThread(id)
  if (thread.length === 0) notFound()

  const first = thread[0]
  if (!first || (first.from_user_id !== user.id && first.to_user_id !== user.id)) notFound()
  const leaf = thread[thread.length - 1]
  if (!leaf) notFound()

  const supabase = await createClient()
  const { data: listing } = await supabase
    .from('listings')
    .select('id, code, title, intent, ask_centavos, estimated_value_centavos, owner_id')
    .eq('id', first.listing_id)
    .maybeSingle()
  if (!listing) notFound()

  const { data: itemRows } = await supabase
    .from('offer_items')
    .select('listings(id, code, title, intent, ask_centavos, estimated_value_centavos)')
    .eq('root_offer_id', first.root_offer_id)
  // `listings` is a to-one embed — when RLS hides the target listing from the
  // current viewer (owner archived it, or it's not active/reserved/completed),
  // PostgREST returns `listings: null` for that row rather than dropping the
  // row. Keep the null slot (don't filter it out) so computeBalance can see
  // there's a gap and degrade to 'cant_gauge' instead of silently omitting an
  // item and overstating the balance; OfferThread renders a placeholder for it.
  const ownItems = ((itemRows ?? []) as unknown as Array<{ listings: ThreadItem | null }>).map(
    (r) => r.listings,
  )

  const [meetup, messages, confirmations, cancellation, meetupSpots] = await Promise.all([
    getMeetup(leaf.id),
    // Messages are scoped to the whole negotiation thread (root offer id),
    // not the leaf — a counter inserts a new leaf row and would otherwise
    // orphan the prior conversation. `first.id === first.root_offer_id`
    // since `first` is always the root row of the thread.
    getMessages(first.id),
    getDealConfirmations(leaf.id),
    getCancellation(leaf.id),
    getMeetupSpots(),
  ])
  const hasConfirmedSwap = confirmations.some((c) => c.user_id === user.id)

  return (
    <>
      <header>
        <Ribbon
          end={leaf.status === 'accepted' ? <CancelMenuButton offerId={leaf.id} /> : undefined}
        >
          Offer
        </Ribbon>
      </header>
      <OfferThread
        thread={thread}
        listing={listing as unknown as ThreadListing}
        items={ownItems}
        currentUserId={user.id}
        meetup={meetup}
        meetupSpots={meetupSpots}
        messages={messages}
        hasConfirmedSwap={hasConfirmedSwap}
        cancellation={cancellation}
      />
    </>
  )
}
