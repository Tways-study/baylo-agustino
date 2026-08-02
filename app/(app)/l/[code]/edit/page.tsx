import { notFound, redirect } from 'next/navigation'
import { getListingByCode, getCategories, getMeetupSpots } from '@/lib/listings/queries'
import { getAuthUser } from '@/lib/auth/session'
import { Ribbon } from '@/components/ui'
import { EditListingForm } from './EditListingForm'

export default async function EditListingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [listing, user] = await Promise.all([getListingByCode(code), getAuthUser()])
  if (!listing) notFound()
  if (!user || user.id !== listing.owner_id) redirect(`/l/${code}`)

  const [categories, meetupSpots] = await Promise.all([getCategories(), getMeetupSpots()])

  const wants = (listing.listing_wants ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((w) => w.label)

  return (
    <>
      <header>
        <Ribbon>Edit listing</Ribbon>
      </header>
      <EditListingForm
        listingId={listing.id}
        code={listing.code}
        intent={listing.intent}
        categories={categories}
        meetupSpots={meetupSpots}
        initial={{
          title: listing.title,
          description: listing.description,
          categoryId: listing.category_id,
          condition: listing.condition as 'new' | 'like_new' | 'good' | 'fair' | 'worn' | null,
          meetupSpotId: listing.meetup_spot_id,
          askCentavos: listing.ask_centavos,
          estimatedValueCentavos: listing.estimated_value_centavos,
          acceptsCash: listing.accepts_cash,
          wants,
        }}
      />
    </>
  )
}
