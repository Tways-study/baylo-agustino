'use client'

import { Panel, IntentTag, BalanceBeam, Stamp } from '@/components/ui'
import { computeBalance, type BalanceRead } from '@/lib/offers/balance'
import { centavosToPesos, formatRelativeTime } from '@/lib/listings/format'
import { OfferActions } from './OfferActions'
import { DealStepper } from './DealStepper'
import { DealControls } from './DealControls'
import { PinnedMeetupCard } from './PinnedMeetupCard'
import { DealChat } from './DealChat'
import { dealSteps } from '@/lib/deals/stepper'
import type { OfferThreadRow } from '@/lib/offers/queries'
import type { MeetupWithSpot } from '@/lib/deals/queries'
import type {
  ListingIntent,
  MeetupSpotRow,
  MessageRow,
  OfferCancellationRow,
} from '@/types/database'

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
  code: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

interface OfferThreadProps {
  thread: OfferThreadRow[]
  listing: ThreadListing
  // A null slot means RLS hid that item's listing from this viewer (e.g. the
  // owner archived it) — PostgREST returns the row with `listings: null`
  // rather than dropping it. Rendered as a placeholder, not skipped.
  items: (ThreadItem | null)[]
  currentUserId: string
  meetup: MeetupWithSpot | null
  meetupSpots: MeetupSpotRow[]
  messages: MessageRow[]
  hasConfirmedSwap: boolean
  cancellation: OfferCancellationRow | null
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

// computeBalance is a fixed frame: offerer's items+cash sit in the "YOURS"
// pan, the listing sits in "THEIRS" — correct for the composer, where only
// the offerer ever looks. On the deal thread the same read is shown to the
// listing owner too, so their view needs the pans mirrored. Kept as a small
// pure mapping rather than touching computeBalance, which must stay a
// correct fixed-frame primitive for the composer's use.
function mirrorForOwner(read: BalanceRead): BalanceRead {
  if (read === 'heavily_yours') return 'heavily_theirs'
  if (read === 'heavily_theirs') return 'heavily_yours'
  if (read === 'slightly_yours') return 'slightly_theirs'
  if (read === 'slightly_theirs') return 'slightly_yours'
  return read
}

export function OfferThread({
  thread,
  listing,
  items,
  currentUserId,
  meetup,
  meetupSpots,
  messages,
  hasConfirmedSwap,
  cancellation,
}: OfferThreadProps) {
  const leaf = thread[thread.length - 1]
  if (!leaf) return null
  // The root row of the thread — its id is stable across counters (unlike
  // leaf.id, which changes every time the offer is countered) and is what
  // messages are scoped to, since chat history must survive a counter.
  const first = thread[0]
  if (!first) return null

  const role = leaf.from_user_id === currentUserId ? 'offerer' : 'recipient'
  const isOwner = currentUserId === listing.owner_id
  const steps = dealSteps({ status: leaf.status })

  const balanceRead =
    listing.intent === 'give'
      ? null
      : computeBalance({
          listingValueCentavos: value(listing),
          offeredItemsValueCentavos: items.map((item) => (item ? value(item) : null)),
          cashCentavos: leaf.cash_centavos,
          cashDirection: leaf.cash_direction,
        })
  const displayBalanceRead = balanceRead && (isOwner ? mirrorForOwner(balanceRead) : balanceRead)

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

      {displayBalanceRead && <BalanceBeam read={displayBalanceRead} />}

      {items.length > 0 && (
        <Panel>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: '0 0 0.5rem',
            }}
          >
            Items offered
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {items.map((item, i) =>
              item ? (
                <div
                  key={item.id}
                  style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      letterSpacing: '0.06em',
                      color: 'var(--ink-45)',
                    }}
                  >
                    {item.code}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      color: 'var(--ink)',
                    }}
                  >
                    {item.title}
                  </span>
                </div>
              ) : (
                <div
                  key={`unavailable-${i}`}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    fontStyle: 'italic',
                    color: 'var(--ink-45)',
                  }}
                >
                  Item no longer available
                </div>
              ),
            )}
          </div>
        </Panel>
      )}

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

      {steps.cancelled ? (
        <Panel>
          <Stamp label="Cancelled" variant="crimson" rotate={-6} />
          {cancellation && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-70)',
                margin: '0.5rem 0 0',
              }}
            >
              {cancellation.reason_text || 'No additional details given.'}
            </p>
          )}
        </Panel>
      ) : (
        (leaf.status === 'accepted' || leaf.status === 'completed') && (
          <Panel>
            <DealStepper {...steps} />
          </Panel>
        )
      )}

      {leaf.status === 'accepted' && (
        <PinnedMeetupCard
          offerId={leaf.id}
          meetup={meetup}
          meetupSpots={meetupSpots}
          currentUserId={currentUserId}
          ownerId={listing.owner_id}
        />
      )}

      {/* Chat stays visible as read-only history for any status the deal
          room reaches — a cancelled/declined/withdrawn/expired deal's
          conversation still explains what happened. Only the ability to
          send (canSend) is restricted to the live-negotiation window. */}
      <Panel>
        <DealChat
          offerId={first.id}
          initialMessages={messages}
          currentUserId={currentUserId}
          canSend={leaf.status === 'pending' || leaf.status === 'accepted'}
        />
      </Panel>

      <OfferActions offer={leaf} role={role} isOwner={isOwner} />
      <DealControls offerId={leaf.id} status={leaf.status} hasConfirmedSwap={hasConfirmedSwap} />
    </div>
  )
}
