// app/(app)/deals/[id]/CancelMenuButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Sheet } from '@/components/ui'
import { cancelDeal } from '@/lib/deals/actions'
import { cancelReasonCodeSchema } from '@/lib/deals/schemas'
import type { z } from 'zod'

type ReasonCode = z.infer<typeof cancelReasonCodeSchema>

const REASON_LABEL: Record<ReasonCode, string> = {
  changed_mind: 'Changed my mind',
  item_unavailable: 'Item no longer available',
  unreachable: 'Other person unreachable',
  scheduling_conflict: 'Scheduling conflict',
  other: 'Other',
}

interface CancelMenuButtonProps {
  offerId: string
}

export function CancelMenuButton({ offerId }: CancelMenuButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleConfirmCancel() {
    if (!reasonCode) return
    setError(null)
    startTransition(async () => {
      const res = await cancelDeal({ offerId, reasonCode, reasonText: reasonText || undefined })
      if (res.error) setError(res.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cancel this deal"
        onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <circle cx="12" cy="5" r="1.4" fill="var(--card)" />
          <circle cx="12" cy="12" r="1.4" fill="var(--card)" />
          <circle cx="12" cy="19" r="1.4" fill="var(--card)" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Cancel this deal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {error && (
            <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
              {error}
            </p>
          )}
          <div
            role="group"
            aria-label="Cancellation reason"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}
          >
            {(Object.keys(REASON_LABEL) as ReasonCode[]).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={reasonCode === code}
                onClick={() => setReasonCode(code)}
                style={{
                  padding: '0.375rem 0.625rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: reasonCode === code ? 'var(--crimson)' : 'var(--card)',
                  color: reasonCode === code ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {REASON_LABEL[code]}
              </button>
            ))}
          </div>
          {reasonCode === 'other' && (
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Tell us a bit more…"
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
          )}
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending || !reasonCode || (reasonCode === 'other' && !reasonText.trim())}
            onClick={handleConfirmCancel}
          >
            {isPending ? 'Cancelling…' : 'Confirm cancellation'}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
