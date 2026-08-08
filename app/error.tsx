'use client'

import { useEffect } from 'react'
import { EmptyState } from '@/components/ui'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyState
      headline="Something went wrong."
      body="That's on us, not you. Try again."
      ctaLabel="Try again"
      onCta={reset}
    />
  )
}
