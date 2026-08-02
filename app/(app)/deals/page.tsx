import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { getInboxThreads } from '@/lib/offers/queries'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import { Ribbon } from '@/components/ui'
import { DealsList } from './DealsList'

export default async function DealsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { received, sent } = await getInboxThreads(user.id)

  const coverPaths = [...received, ...sent]
    .map((t) => t.listing.listing_images.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)

  return (
    <>
      <header>
        <Ribbon>Deals</Ribbon>
      </header>
      <DealsList received={received} sent={sent} signedUrls={signedUrls} currentUserId={user.id} />
    </>
  )
}
