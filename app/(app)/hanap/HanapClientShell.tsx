'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'
import { PostHanapSheet } from './PostHanapSheet'

export function HanapClientShell() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setSheetOpen(true)} className="w-full">
        Post a Hanap
      </Button>
      <PostHanapSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
