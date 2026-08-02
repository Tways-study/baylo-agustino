'use client'

import { Panel, IntentTag, BalanceBeam } from '@/components/ui'
import { computeBalance } from '@/lib/offers/balance'
import { centavosToPesos, formatRelativeTime } from '@/lib/listings/format'
import { OfferActions } from './OfferActions'
import type { OfferThreadRow } from '@/lib/offers/queries'
import type { ListingIntent } from '@/types/database'

export interface ThreadListing {
  id: string
  code: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
  owner_id: string
}

export interface ThreadItem {
  id: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

interface OfferThreadProps {
  thread: OfferThreadRow[]
  listing: ThreadListing
  items: ThreadItem[]
  currentUserId: string
}

function value(row: {
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}): number | null {
  if (row.intent === 'sale') return row.ask_centavos
  if (row.intent === 'swap') return row.estimated_value_centavos
  return null
}

export function OfferThread({ thread, listing, items, currentUserId }: OfferThreadProps) {
  const leaf = thread[thread.length - 1]
  if (!leaf) return null

  const role = leaf.from_user_id === currentUserId ? 'offerer' : 'recipient'

  const balanceRead =
    listing.intent === 'give'
      ? null
      : computeBalance({
          listingValueCentavos: value(listing),
          offeredItemsValueCentavos: items.map(value),
          cashCentavos: leaf.cash_centavos,
          cashDirection: leaf.cash_direction,
        })

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IntentTag intent={listing.intent} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {listing.title}
          </span>
        </div>
      </Panel>

      {balanceRead && <BalanceBeam read={balanceRead} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {thread.map((offer) => (
          <Panel key={offer.id} style={{ opacity: offer.status === 'countered' ? 0.6 : 1 }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
                margin: '0 0 0.25rem',
              }}
            >
              {offer.from_user_id === currentUserId ? 'You' : 'Them'} ·{' '}
              {formatRelativeTime(offer.created_at)}
              {offer.status === 'countered' ? ' · countered' : ''}
            </p>
            {offer.cash_centavos > 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: 0 }}>
                ₱{centavosToPesos(offer.cash_centavos)}{' '}
                {offer.cash_direction === 'from_offerer'
                  ? 'added by the offerer'
                  : 'added by the owner'}
              </p>
            )}
            {offer.note && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink-70)',
                  margin: '0.25rem 0 0',
                }}
              >
                &ldquo;{offer.note}&rdquo;
              </p>
            )}
          </Panel>
        ))}
      </div>

      <OfferActions offer={leaf} role={role} isOwner={currentUserId === listing.owner_id} />
    </div>
  )
}
