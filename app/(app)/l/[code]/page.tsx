import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getListingByCode } from '@/lib/listings/queries'
import { getAuthUser } from '@/lib/auth/session'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime, centavosToPesos } from '@/lib/listings/format'
import { Panel, IntentTag, Stamp, Button } from '@/components/ui'
import { HeroCarousel } from './HeroCarousel'
import { OwnerActions } from './OwnerActions'

export default async function ListingDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const listing = await getListingByCode(code)
  if (!listing) notFound()

  const user = await getAuthUser()
  const isOwner = user?.id === listing.owner_id

  if (!isOwner) {
    const supabase = await createClient()
    await supabase.rpc('increment_listing_view', { p_id: listing.id })
  }

  const isExpired = new Date(listing.expires_at).getTime() < Date.now()

  const images = (listing.listing_images ?? []).slice().sort((a, b) => a.position - b.position)
  const wants = (listing.listing_wants ?? []).slice().sort((a, b) => a.position - b.position)

  const signedUrls = await getSignedImageUrls(images.map((img) => img.storage_path))
  const imageUrls = images
    .map((img) => signedUrls[img.storage_path])
    .filter((u): u is string => !!u)

  const owner = listing.profiles
  const meetupSpot = listing.meetup_spots

  const priceLabel =
    listing.intent === 'sale'
      ? `₱${centavosToPesos(listing.ask_centavos ?? 0)}`
      : listing.intent === 'give'
        ? 'Free'
        : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '6rem' }}>
      <HeroCarousel imageUrls={imageUrls} />

      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <IntentTag intent={listing.intent} />
            {priceLabel && (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: 'var(--crimson)',
                }}
              >
                {priceLabel}
              </span>
            )}
            {isExpired && listing.status !== 'reserved' && (
              <Stamp label="Expired" variant="crimson" rotate={-6} />
            )}
            {listing.status === 'reserved' && <Stamp label="Reserved" variant="gold" rotate={-6} />}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              margin: '0.5rem 0 0.25rem',
            }}
          >
            {listing.title}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.08em',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            {listing.code} · {listing.condition?.replace('_', ' ') ?? 'condition n/a'} · POSTED{' '}
            {formatRelativeTime(listing.created_at).toUpperCase()}
          </p>
        </div>

        {listing.description && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9375rem',
              color: 'var(--ink-70)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {listing.description}
          </p>
        )}

        {listing.intent === 'swap' && wants.length > 0 && (
          <Panel style={{ backgroundColor: 'var(--gold)' }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 0.5rem',
              }}
            >
              What they&rsquo;ll take for it
            </p>
            <ul
              style={{
                margin: 0,
                padding: '0 0 0 1.1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              {wants.map((w, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    color: 'var(--ink)',
                  }}
                >
                  {w.label}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {owner && (
          <Panel>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
                margin: '0 0 0.375rem',
              }}
            >
              Posted by
            </p>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '0.9375rem',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              {owner.display_name}
              {owner.program && (
                <span style={{ fontWeight: 400, color: 'var(--ink-70)' }}>
                  {' '}
                  · {owner.program}
                  {owner.year_level
                    ? ` · ${owner.year_level}${ordinalSuffix(owner.year_level)} year`
                    : ''}
                </span>
              )}
            </p>
            {owner.verified_at && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  color: 'var(--crimson-deep)',
                  margin: '0.25rem 0 0',
                }}
              >
                Verified
              </p>
            )}
          </Panel>
        )}

        {meetupSpot && (
          <Panel>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
                margin: '0 0 0.375rem',
              }}
            >
              Usual meetup
            </p>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '0.9375rem',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              {meetupSpot.name}
            </p>
            {meetupSpot.hint && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-70)',
                  margin: '0.125rem 0 0',
                }}
              >
                {meetupSpot.hint}
              </p>
            )}
          </Panel>
        )}
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '0.75rem 1rem',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          backgroundColor: 'var(--card)',
          borderTop: 'var(--stroke)',
          zIndex: 20,
        }}
      >
        {isOwner ? (
          <OwnerActions code={listing.code} listingId={listing.id} bumpedAt={listing.bumped_at} />
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              disabled
              title="Coming in a later phase"
            >
              Message
            </Button>
            <Link href={`/l/${listing.code}/offer`} style={{ flex: 1 }}>
              <Button
                type="button"
                variant="primary"
                fullWidth
                disabled={listing.status !== 'active' || isExpired}
              >
                Make an offer
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function ordinalSuffix(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}
