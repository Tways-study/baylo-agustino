'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Chit, ChitSkeleton } from '@/components/ui'
import { SaveToggleButton } from './SaveToggleButton'
import { loadMoreListings } from '@/lib/discovery/actions'
import type { FeedCursor, FeedListingWithImage } from '@/lib/discovery/queries'
import type { FeedFilters } from '@/lib/discovery/schemas'
import type { CategoryRow } from '@/types/database'
import { centavosToPesos } from '@/lib/listings/format'

interface FeedListProps {
  initialListings: FeedListingWithImage[]
  initialCursor: FeedCursor | null
  filters: FeedFilters
  categories: CategoryRow[]
  initialSavedIds: string[]
}

export function FeedList({
  initialListings,
  initialCursor,
  filters,
  categories,
  initialSavedIds,
}: FeedListProps) {
  const [listings, setListings] = useState(initialListings)
  const [cursor, setCursor] = useState(initialCursor)
  const [savedIds, setSavedIds] = useState(new Set(initialSavedIds))
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)

  // initialSavedIds arrives fresh from the server on every filter change
  // (page.tsx re-renders with new props) — without this, save state would
  // stay frozen at whatever it was on first mount after a filter change.
  useEffect(() => {
    setListings(initialListings)
    setCursor(initialCursor)
    setSavedIds(new Set(initialSavedIds))
    setError(false)
  }, [initialListings, initialCursor, initialSavedIds])

  function loadNext() {
    // Synchronous guard, not just the retry button's `disabled` prop below
    // — a rapid double-click can fire two events before React commits the
    // disabled state, and both closures would otherwise read the same
    // `cursor` and both append to `listings`, duplicating visible cards.
    if (!cursor || isPending) return
    setError(false)
    startTransition(async () => {
      try {
        const page = await loadMoreListings(cursor, filters, categories)
        setListings((prev) => [...prev, ...page.listings])
        setCursor(page.nextCursor)
      } catch {
        setError(true)
      }
    })
  }

  useEffect(() => {
    if (!cursor) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isPending) loadNext()
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, isPending])

  return (
    <div className="flex flex-col gap-3">
      {listings.map((l) => {
        const firstWant = (l.listing_wants ?? []).slice().sort((a, b) => a.position - b.position)[0]
        const metaLine =
          l.intent === 'give'
            ? 'Free — first to claim'
            : l.intent === 'sale'
              ? `₱${centavosToPesos(l.ask_centavos ?? 0)}`
              : firstWant
                ? `Wants: ${firstWant.label}`
                : undefined

        return (
          <div key={l.id} style={{ position: 'relative' }}>
            <Link href={`/l/${l.code}`} className="contents">
              <Chit
                code={l.code}
                intent={l.intent}
                title={l.title}
                condition={l.condition ?? undefined}
                imageUrl={l.imageUrl}
              >
                {metaLine && (
                  <p className="text-xs" style={{ color: 'var(--ink-70)' }}>
                    {metaLine}
                  </p>
                )}
              </Chit>
            </Link>
            <SaveToggleButton listingId={l.id} initialSaved={savedIds.has(l.id)} />
          </div>
        )
      })}

      {isPending && (
        <>
          <ChitSkeleton />
          <ChitSkeleton />
        </>
      )}

      {error && (
        <button
          type="button"
          onClick={loadNext}
          disabled={isPending}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--crimson)',
            padding: '0.75rem',
            textAlign: 'center',
            background: 'none',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            cursor: isPending ? 'default' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          Couldn&rsquo;t load more — retry
        </button>
      )}

      {cursor && <div ref={sentinelRef} aria-hidden="true" style={{ height: '1px' }} />}
    </div>
  )
}
