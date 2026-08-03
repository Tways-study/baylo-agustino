import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { getOfferThread } from '@/lib/offers/queries'
import { createClient } from '@/lib/supabase/server'
import { Ribbon } from '@/components/ui'
import { OfferThread, type ThreadListing, type ThreadItem } from './OfferThread'

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const thread = await getOfferThread(id)
  if (thread.length === 0) notFound()

  const first = thread[0]
  if (!first || (first.from_user_id !== user.id && first.to_user_id !== user.id)) notFound()

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

  return (
    <>
      <header>
        <Ribbon>Offer</Ribbon>
      </header>
      <OfferThread
        thread={thread}
        listing={listing as unknown as ThreadListing}
        items={ownItems}
        currentUserId={user.id}
      />
    </>
  )
}
