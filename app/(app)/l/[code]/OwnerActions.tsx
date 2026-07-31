'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui'
import { archiveListing, bumpListing } from '@/lib/listings/actions'

interface OwnerActionsProps {
  code: string
  listingId: string
  bumpedAt: string
}

const BUMP_COOLDOWN_MS = 72 * 60 * 60 * 1000

export function OwnerActions({ code, listingId, bumpedAt }: OwnerActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const msSinceBump = Date.now() - new Date(bumpedAt).getTime()
  const canBump = msSinceBump >= BUMP_COOLDOWN_MS
  const hoursUntilBump = Math.ceil((BUMP_COOLDOWN_MS - msSinceBump) / (60 * 60 * 1000))

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveListing(listingId)
      if (res.error) setMessage(res.error)
    })
  }

  function handleBump() {
    startTransition(async () => {
      const res = await bumpListing(listingId)
      setMessage(res.error ?? 'Bumped to the top.')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {message && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            color: 'var(--ink-70)',
            margin: 0,
          }}
        >
          {message}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Link href={`/l/${code}/edit`} style={{ flex: 1 }}>
          <Button type="button" variant="secondary" fullWidth>
            Edit
          </Button>
        </Link>
        {confirmingArchive ? (
          <Button type="button" variant="primary" disabled={isPending} onClick={handleArchive}>
            {isPending ? 'Archiving…' : 'Confirm archive'}
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirmingArchive(true)}>
            Archive
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={!canBump || isPending}
          title={canBump ? undefined : `Available in about ${hoursUntilBump}h`}
          onClick={handleBump}
        >
          {canBump ? 'Bump' : `Bump (${hoursUntilBump}h)`}
        </Button>
      </div>
    </div>
  )
}
