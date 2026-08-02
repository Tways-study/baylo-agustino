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
    .select('listings(id, title, intent, ask_centavos, estimated_value_centavos)')
    .eq('root_offer_id', first.root_offer_id)
  const ownItems = ((itemRows ?? []) as unknown as Array<{ listings: ThreadItem }>).map(
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
