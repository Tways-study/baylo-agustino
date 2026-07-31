import Link from 'next/link'
import { Ribbon, EmptyState, Chit } from '@/components/ui'
import { getFeedListings } from '@/lib/listings/queries'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import { centavosToPesos } from '@/lib/listings/format'

function FloorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={{ opacity: 0.35 }}
    >
      <rect x="4" y="10" width="40" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 20h24M12 27h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="10" width="8" height="28" fill="currentColor" fillOpacity="0.1" />
      <path d="M12 10v28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  )
}

export default async function BaylohanPage() {
  const listings = await getFeedListings()

  if (listings.length === 0) {
    return (
      <>
        <header>
          <Ribbon>Baylohan</Ribbon>
        </header>
        <main>
          <EmptyState
            headline="Nothing on the floor yet."
            body="Post the thing you're not using. Someone out there needs a Casio or a lab gown."
            ctaLabel="Post something"
            ctaHref="/post"
            icon={<FloorIcon />}
          />
        </main>
      </>
    )
  }

  const coverPaths = listings
    .map((l) => l.listing_images.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)

  return (
    <>
      <header>
        <Ribbon>Baylohan</Ribbon>
      </header>
      <main className="flex flex-col gap-3 px-4 py-4">
        {listings.map((l) => {
          const cover = l.listing_images.find((i) => i.position === 0)?.storage_path
          const firstWant = l.listing_wants.slice().sort((a, b) => a.position - b.position)[0]
          const metaLine =
            l.intent === 'give'
              ? 'Free — first to claim'
              : l.intent === 'sale'
                ? `₱${centavosToPesos(l.ask_centavos ?? 0)}`
                : firstWant
                  ? `Wants: ${firstWant.label}`
                  : undefined

          return (
            <Link key={l.id} href={`/l/${l.code}`} className="contents">
              <Chit
                code={l.code}
                intent={l.intent}
                title={l.title}
                condition={l.condition ?? undefined}
                imageUrl={cover ? signedUrls[cover] : undefined}
              >
                {metaLine && (
                  <p className="text-xs" style={{ color: 'var(--ink-70)' }}>
                    {metaLine}
                  </p>
                )}
              </Chit>
            </Link>
          )
        })}
      </main>
    </>
  )
}
