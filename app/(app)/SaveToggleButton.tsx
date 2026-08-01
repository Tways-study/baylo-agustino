'use client'

import { useState, useTransition } from 'react'
import { saveListing, unsaveListing } from '@/lib/discovery/actions'

interface SaveToggleButtonProps {
  listingId: string
  initialSaved: boolean
}

export function SaveToggleButton({ listingId, initialSaved }: SaveToggleButtonProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      const res = next ? await saveListing(listingId) : await unsaveListing(listingId)
      if (res.error) setSaved(!next)
    })
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save this listing'}
      style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        width: '1.75rem',
        height: '1.75rem',
        borderRadius: '50%',
        border: 'var(--stroke)',
        backgroundColor: saved ? 'var(--gold)' : 'var(--card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 5,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={saved ? 'var(--ink)' : 'none'}
        stroke="var(--ink)"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  )
}
