import Link from 'next/link'
import { Chit } from '@/components/ui'
import { centavosToPesos } from '@/lib/listings/format'
import type { FeedListingWithImage } from '@/lib/discovery/queries'

interface FollowingSectionProps {
  listings: FeedListingWithImage[]
}

export function FollowingSection({ listings }: FollowingSectionProps) {
  if (listings.length === 0) return null

  return (
    <section aria-label="From people you follow">
      <p
        className="font-mono-utility text-[10px] mb-2"
        style={{ letterSpacing: '0.1em', color: 'var(--ink-45)' }}
      >
        FROM PEOPLE YOU FOLLOW
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/l/${listing.code}`}
            className="flex-none"
            style={{ width: '160px' }}
          >
            <Chit
              code={listing.code}
              intent={listing.intent}
              title={listing.title}
              condition={listing.condition ?? undefined}
              imageUrl={listing.imageUrl}
            >
              {listing.ask_centavos !== null && (
                <span
                  className="font-mono-utility text-[10px]"
                  style={{ color: 'var(--crimson)', letterSpacing: '0.05em' }}
                >
                  ₱{centavosToPesos(listing.ask_centavos)}
                </span>
              )}
            </Chit>
          </Link>
        ))}
      </div>
    </section>
  )
}
