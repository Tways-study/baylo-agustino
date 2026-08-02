'use client'

import { useState } from 'react'
import { OfferRow, EmptyState } from '@/components/ui'
import type { InboxThread } from '@/lib/offers/queries'

interface DealsListProps {
  received: InboxThread[]
  sent: InboxThread[]
  signedUrls: Record<string, string>
  currentUserId: string
}

type Section = 'needs_response' | 'waiting' | 'accepted' | 'closed'

const SECTION_LABEL: Record<Section, string> = {
  needs_response: 'Needs your response',
  waiting: 'Waiting on them',
  accepted: 'Accepted',
  closed: 'Closed',
}

function sectionFor(thread: InboxThread, userId: string): Section {
  if (thread.status === 'accepted') return 'accepted'
  if (thread.status !== 'pending') return 'closed'
  // Pending: "needs your response" if the caller is the current recipient.
  return thread.to_user_id === userId ? 'needs_response' : 'waiting'
}

function groupBySection(threads: InboxThread[], userId: string): Record<Section, InboxThread[]> {
  const groups: Record<Section, InboxThread[]> = {
    needs_response: [],
    waiting: [],
    accepted: [],
    closed: [],
  }
  for (const thread of threads) {
    groups[sectionFor(thread, userId)].push(thread)
  }
  return groups
}

export function DealsList({ received, sent, signedUrls, currentUserId }: DealsListProps) {
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const threads = tab === 'received' ? received : sent
  const groups = groupBySection(threads, currentUserId)
  const sectionOrder: Section[] = ['needs_response', 'waiting', 'accepted', 'closed']

  return (
    <main className="flex flex-col gap-3 px-4 py-4">
      <div role="group" aria-label="Received or sent" style={{ display: 'flex', gap: '0.375rem' }}>
        {(['received', 'sent'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 0.875rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              backgroundColor: tab === t ? 'var(--ink)' : 'var(--card)',
              color: tab === t ? 'var(--card)' : 'var(--ink)',
            }}
          >
            {t === 'received' ? 'Received' : 'Sent'}
          </button>
        ))}
      </div>

      {threads.length === 0 ? (
        <EmptyState
          headline={tab === 'received' ? 'No offers yet.' : "You haven't sent any offers."}
          body={
            tab === 'received'
              ? 'Offers on your listings will show up here.'
              : 'Offers you make on other listings will show up here.'
          }
        />
      ) : (
        sectionOrder.map((section) =>
          groups[section].length === 0 ? null : (
            <div key={section}>
              <p className="font-mono-utility text-[10px] mb-2" style={{ color: 'var(--ink-45)' }}>
                {SECTION_LABEL[section]}
              </p>
              {groups[section].map((thread) => {
                const cover = thread.listing.listing_images.find(
                  (i) => i.position === 0,
                )?.storage_path
                return (
                  <OfferRow
                    key={thread.id}
                    href={`/deals/${thread.id}`}
                    imageUrl={cover ? signedUrls[cover] : undefined}
                    listingTitle={thread.listing.title}
                    counterpartyName={thread.counterpartyName}
                    status={thread.status}
                    expiresAt={thread.expires_at}
                  />
                )
              })}
            </div>
          ),
        )
      )}
    </main>
  )
}
