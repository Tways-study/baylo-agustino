'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { canTransition } from '@/lib/offers/state-machine'
import { acceptOffer, declineOffer, withdrawOffer, counterOffer } from '@/lib/offers/actions'
import { pesosToCentavos } from '@/lib/listings/format'
import type { OfferThreadRow } from '@/lib/offers/queries'

interface OfferActionsProps {
  offer: OfferThreadRow
  role: 'offerer' | 'recipient'
}

export function OfferActions({ offer, role }: OfferActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterCashPesos, setCounterCashPesos] = useState('')
  const [counterDirection, setCounterDirection] = useState<'from_offerer' | 'to_offerer'>(
    offer.cash_direction,
  )
  const [counterNote, setCounterNote] = useState('')

  const status = offer.status

  function run(action: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleCounterSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await counterOffer({
        offerId: offer.id,
        cashCentavos: counterCashPesos ? pesosToCentavos(counterCashPesos) : 0,
        cashDirection: counterDirection,
        note: counterNote || undefined,
      })
      if (res.error) setError(res.error)
      else {
        setCounterOpen(false)
        router.refresh()
      }
    })
  }

  if (status !== 'pending') return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {canTransition(status, 'accept', role) && (
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={() => run(() => acceptOffer(offer.id))}
          >
            Accept
          </Button>
        )}
        {canTransition(status, 'counter', role) && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => setCounterOpen(true)}
          >
            Counter
          </Button>
        )}
        {canTransition(status, 'decline', role) && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => declineOffer(offer.id))}
          >
            Decline
          </Button>
        )}
        {canTransition(status, 'withdraw', role) && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => withdrawOffer(offer.id))}
          >
            Withdraw
          </Button>
        )}
      </div>

      <Sheet open={counterOpen} onClose={() => setCounterOpen(false)} title="Counter this offer">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="counter-cash"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Cash (₱)
            </label>
            <input
              id="counter-cash"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={counterCashPesos}
              onChange={(e) => setCounterCashPesos(e.target.value)}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                padding: '0.75rem 1rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div
            role="group"
            aria-label="Who adds the cash"
            style={{ display: 'flex', gap: '0.375rem' }}
          >
            {[
              { value: 'from_offerer' as const, label: 'I add cash' },
              { value: 'to_offerer' as const, label: 'They add cash' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={counterDirection === opt.value}
                onClick={() => setCounterDirection(opt.value)}
                style={{
                  padding: '0.375rem 0.625rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor:
                    counterDirection === opt.value ? 'var(--crimson)' : 'var(--card)',
                  color: counterDirection === opt.value ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            value={counterNote}
            onChange={(e) => setCounterNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Say what changed…"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              padding: '0.75rem 1rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={handleCounterSubmit}
          >
            {isPending ? 'Sending…' : 'Send counter'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
