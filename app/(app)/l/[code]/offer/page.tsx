import { notFound, redirect } from 'next/navigation'
import { getListingForOffer, getOwnOfferableListings } from '@/lib/offers/queries'
import { getAuthUser } from '@/lib/auth/session'
import { Ribbon } from '@/components/ui'
import { OfferComposer } from './OfferComposer'

export default async function OfferPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [listing, user] = await Promise.all([getListingForOffer(code), getAuthUser()])
  if (!listing) notFound()
  if (!user || user.id === listing.owner_id) redirect(`/l/${code}`)
  if (listing.status !== 'active' || new Date(listing.expires_at).getTime() < Date.now()) {
    redirect(`/l/${code}`)
  }

  const ownListings = await getOwnOfferableListings(user.id)

  return (
    <>
      <header>
        <Ribbon>Make an offer</Ribbon>
      </header>
      <OfferComposer listing={listing} ownListings={ownListings} />
    </>
  )
}
