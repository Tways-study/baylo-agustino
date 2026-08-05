import { ImageResponse } from 'next/og'
import { getListingByCode } from '@/lib/listings/queries'
import { centavosToPesos } from '@/lib/listings/format'

export const runtime = 'edge'

const INTENT_LABEL: Record<string, string> = {
  swap: 'SWAP',
  sale: 'FOR SALE',
  give: 'FREE',
}

// Hardcoded hex — CSS variables don't work in Satori/ImageResponse (edge render).
// This is the single approved exception to the CSS variable rule in this codebase.
const C = {
  ink: '#131010',
  ink70: '#4a4340',
  ink45: '#7c7370',
  crimson: '#cc0000',
  gold: '#ffcc00',
  paper: '#ede3d0',
  card: '#fbf7ef',
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const listing = await getListingByCode(code)

  if (!listing) {
    return new Response('Not found', { status: 404 })
  }

  const intentColor = listing.intent === 'swap' ? C.gold : C.crimson
  const intentLabel = INTENT_LABEL[listing.intent] ?? listing.intent.toUpperCase()

  const priceLabel =
    listing.intent === 'sale' && listing.ask_centavos !== null
      ? `₱${centavosToPesos(listing.ask_centavos)}`
      : listing.intent === 'give'
        ? 'Free'
        : null

  return new ImageResponse(
    <div
      style={{
        width: '1080px',
        height: '1920px',
        backgroundColor: C.paper,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px',
      }}
    >
      {/* Card */}
      <div
        style={{
          backgroundColor: C.card,
          border: `3px solid ${C.ink}`,
          boxShadow: `8px 8px 0 ${C.ink}`,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Ribbon header */}
        <div
          style={{
            backgroundColor: C.crimson,
            borderBottom: `3px solid ${C.ink}`,
            padding: '18px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '26px',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.card,
            }}
          >
            Baylo Agustino
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '20px',
              letterSpacing: '0.1em',
              color: C.card,
              opacity: 0.8,
            }}
          >
            {listing.code}
          </span>
        </div>

        {/* Intent tag */}
        <div
          style={{
            backgroundColor: intentColor,
            border: `3px solid ${C.ink}`,
            borderTop: 'none',
            padding: '10px 28px',
            display: 'flex',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: C.ink,
            }}
          >
            {intentLabel}
          </span>
        </div>

        {/* Title block */}
        <div
          style={{
            padding: '48px 48px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <span
            style={{
              fontFamily: 'sans-serif',
              fontSize: '72px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: C.ink,
              lineHeight: 1.1,
            }}
          >
            {listing.title}
          </span>

          {priceLabel && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '48px',
                fontWeight: 700,
                color: C.crimson,
                letterSpacing: '0.05em',
              }}
            >
              {priceLabel}
            </span>
          )}

          {listing.description && (
            <span
              style={{
                fontFamily: 'sans-serif',
                fontSize: '32px',
                color: C.ink70,
                lineHeight: 1.4,
                marginTop: '8px',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {listing.description}
            </span>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `3px solid ${C.ink}`,
            padding: '24px 48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: C.paper,
          }}
        >
          <span
            style={{
              fontFamily: 'sans-serif',
              fontSize: '26px',
              color: C.ink45,
            }}
          >
            {listing.profiles?.display_name ?? ''}
            {listing.profiles?.program ? ` · ${listing.profiles.program}` : ''}
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '22px',
              letterSpacing: '0.1em',
              color: C.ink45,
            }}
          >
            baylo.usa.edu.ph
          </span>
        </div>
      </div>
    </div>,
    { width: 1080, height: 1920 },
  )
}
