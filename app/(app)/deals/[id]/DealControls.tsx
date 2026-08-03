// app/(app)/deals/[id]/DealControls.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { markSwapped } from '@/lib/deals/actions'
import type { OfferStatus } from '@/types/database'

interface DealControlsProps {
  offerId: string
  status: OfferStatus
  hasConfirmedSwap: boolean
}

export function DealControls({ offerId, status, hasConfirmedSwap }: DealControlsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status !== 'accepted') return null

  function handleMarkSwapped() {
    setError(null)
    startTransition(async () => {
      const res = await markSwapped(offerId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="gold"
        fullWidth
        disabled={isPending || hasConfirmedSwap}
        onClick={handleMarkSwapped}
      >
        {hasConfirmedSwap ? 'Waiting for the other side to confirm' : 'Mark as swapped'}
      </Button>
    </div>
  )
}
