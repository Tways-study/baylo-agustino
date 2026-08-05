import { getAuthUser } from '@/lib/auth/session'
import { getMyListings } from '@/lib/listings/queries'
import { getSavedListings } from '@/lib/discovery/queries'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import { Ribbon, MiniListingRow, EmptyState } from '@/components/ui'

export default async function ProfilePage() {
  const user = await getAuthUser()
  if (!user) return null // middleware already guards this route; defensive only

  const [listings, savedListings] = await Promise.all([
    getMyListings(user.id),
    getSavedListings(user.id),
  ])

  const coverPaths = [...listings, ...savedListings]
    .map((l) => l.listing_images.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)

  return (
    <>
      <header>
        <Ribbon>Profile</Ribbon>
      </header>
      <main className="px-4 py-4">
        <p className="font-mono-utility text-[10px] mb-2" style={{ color: 'var(--ink-45)' }}>
          Your listings
        </p>
        {listings.length === 0 ? (
          <EmptyState headline="Nothing posted yet." ctaLabel="Post something" ctaHref="/post" />
        ) : (
          listings.map((l) => {
            const cover = l.listing_images.find((i) => i.position === 0)?.storage_path
            return (
              <MiniListingRow
                key={l.id}
                href={`/l/${l.code}`}
                imageUrl={cover ? signedUrls[cover] : undefined}
                title={l.title}
                code={l.code}
                status={l.status}
                intent={l.intent}
                viewCount={l.view_count}
              />
            )
          })
        )}

        <p className="font-mono-utility text-[10px] mb-2 mt-6" style={{ color: 'var(--ink-45)' }}>
          Saved
        </p>
        {savedListings.length === 0 ? (
          <EmptyState
            headline="Nothing saved yet."
            body="Tap the bookmark on anything you want to find again."
          />
        ) : (
          savedListings.map((l) => {
            const cover = l.listing_images.find((i) => i.position === 0)?.storage_path
            return (
              <MiniListingRow
                key={l.id}
                href={`/l/${l.code}`}
                imageUrl={cover ? signedUrls[cover] : undefined}
                title={l.title}
                code={l.code}
                status={l.status}
                intent={l.intent}
                viewCount={l.view_count}
              />
            )
          })
        )}
      </main>
    </>
  )
}
