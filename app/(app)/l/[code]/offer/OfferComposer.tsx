'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Panel, BalanceBeam } from '@/components/ui'
import { computeBalance } from '@/lib/offers/balance'
import { createOffer, claimGiveListing } from '@/lib/offers/actions'
import { pesosToCentavos } from '@/lib/listings/format'
import type { OfferableListing, ListingForOffer } from '@/lib/offers/queries'

interface OfferComposerProps {
  listing: ListingForOffer
  ownListings: OfferableListing[]
}

function itemValue(item: OfferableListing): number | null {
  if (item.intent === 'sale') return item.ask_centavos
  if (item.intent === 'swap') return item.estimated_value_centavos
  return null
}

function listingValue(listing: ListingForOffer): number | null {
  if (listing.intent === 'sale') return listing.ask_centavos
  if (listing.intent === 'swap') return listing.estimated_value_centavos
  return null
}

export function OfferComposer({ listing, ownListings }: OfferComposerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')

  // All hooks must run unconditionally on every render (Rules of Hooks) —
  // these are declared here, before the give-listing early return below,
  // even though the give path never reads them. balanceRead is harmless to
  // compute for give listings too: listingValue() returns null for 'give',
  // so computeBalance() just resolves to 'cant_gauge', which is never
  // rendered on that path.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [cashPesos, setCashPesos] = useState('')
  const [cashDirection, setCashDirection] = useState<'from_offerer' | 'to_offerer'>('from_offerer')

  const selectedItems = ownListings.filter((l) => selectedIds.includes(l.id))
  const cashCentavos = cashPesos ? pesosToCentavos(cashPesos) : 0

  const balanceRead = useMemo(
    () =>
      computeBalance({
        listingValueCentavos: listingValue(listing),
        offeredItemsValueCentavos: selectedItems.map(itemValue),
        cashCentavos,
        cashDirection,
      }),
    [listing, selectedItems, cashCentavos, cashDirection],
  )

  // Give listings: simplified claim flow (Design Decision 4) — no picker,
  // no cash, no beam.
  if (listing.intent === 'give') {
    function handleClaim() {
      setError(null)
      startTransition(async () => {
        const res = await claimGiveListing({ listingId: listing.id, note: note || undefined })
        if (res.error) setError(res.error)
      })
    }

    return (
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Panel>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9375rem', margin: 0 }}>
            Claiming <strong>{listing.title}</strong>. Free — first to claim it.
          </p>
        </Panel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Optional note — say when you're free to meet…"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            padding: '0.75rem 1rem',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--card)',
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
        {error && (
          <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button type="button" variant="ghost" onClick={() => router.push(`/l/${listing.code}`)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={handleClaim}
          >
            {isPending ? 'Claiming…' : "I'll take it"}
          </Button>
        </div>
      </div>
    )
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function canSubmit(): boolean {
    return selectedIds.length > 0 || cashCentavos > 0
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createOffer({
        listingId: listing.id,
        itemListingIds: selectedIds,
        cashCentavos,
        cashDirection,
        note: note || undefined,
      })
      if (res.error) setError(res.error)
    })
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <BalanceBeam read={balanceRead} />

      <div>
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
          From your shelf
        </p>
        {ownListings.length === 0 ? (
          <p
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink-70)' }}
          >
            You have no active listings to offer. You can still send cash-only.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
            {ownListings.map((item) => {
              const selected = selectedIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-pressed={selected}
                  style={{
                    flex: '0 0 88px',
                    padding: '0.5rem',
                    textAlign: 'center',
                    border: 'var(--stroke)',
                    borderRadius: 'var(--radius)',
                    backgroundColor: selected ? 'rgba(255,204,0,0.2)' : 'var(--card)',
                    boxShadow: selected ? 'var(--shadow-hard)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      width: '15px',
                      height: '15px',
                      margin: '0 auto 4px',
                      border: 'var(--stroke)',
                      borderRadius: '50%',
                      backgroundColor: selected ? 'var(--crimson)' : 'var(--card)',
                    }}
                  />
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-body)',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: 'var(--ink)',
                    }}
                  >
                    {item.title}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
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
          Even it out
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--card)',
            boxShadow: 'var(--shadow-hard)',
            padding: '0.625rem 0.75rem',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>₱</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            value={cashPesos}
            onChange={(e) => setCashPesos(e.target.value)}
            placeholder="0"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '1.375rem',
              fontWeight: 600,
              backgroundColor: 'transparent',
            }}
          />
        </div>
        <div
          role="group"
          aria-label="Who adds the cash"
          style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem' }}
        >
          {[
            { value: 'from_offerer' as const, label: 'I add cash' },
            { value: 'to_offerer' as const, label: 'They add cash' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={cashDirection === opt.value}
              onClick={() => setCashDirection(opt.value)}
              style={{
                padding: '0.375rem 0.625rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: cashDirection === opt.value ? 'var(--crimson)' : 'var(--card)',
                color: cashDirection === opt.value ? 'var(--card)' : 'var(--ink)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Add a note — say when you're free to meet…"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          padding: '0.75rem 1rem',
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--card)',
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
        }}
      />

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-45)' }}>
        OFFER EXPIRES IN 48 HOURS
      </p>

      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button type="button" variant="ghost" onClick={() => router.push(`/l/${listing.code}`)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          fullWidth
          disabled={!canSubmit() || isPending}
          onClick={handleSubmit}
        >
          {isPending ? 'Sending…' : 'Send offer'}
        </Button>
      </div>
    </div>
  )
}
