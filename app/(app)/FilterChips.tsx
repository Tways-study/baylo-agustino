'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { Intent } from '@/components/ui'
import type { CategoryRow } from '@/types/database'
import { FilterSheet } from './FilterSheet'

interface FilterChipsProps {
  activeIntent: Intent | null
  activeFilterCount: number
  categories: CategoryRow[]
  initialCategory: string | null
  initialCondition: string | null
  initialPrice: string | null
  initialPhotos: boolean
}

const INTENTS: { value: Intent | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'swap', label: 'Swap' },
  { value: 'sale', label: 'Sale' },
  { value: 'give', label: 'Give' },
]

export function FilterChips({
  activeIntent,
  activeFilterCount,
  categories,
  initialCategory,
  initialCondition,
  initialPrice,
  initialPhotos,
}: FilterChipsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [sheetOpen, setSheetOpen] = useState(false)

  function setIntent(intent: Intent | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (intent) params.set('intent', intent)
    else params.delete('intent')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto" style={{ flexWrap: 'nowrap' }}>
        {INTENTS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setIntent(opt.value)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              border: '1.5px solid var(--ink)',
              borderRadius: '100px',
              padding: '5px 11px',
              backgroundColor: activeIntent === opt.value ? 'var(--ink)' : 'transparent',
              color: activeIntent === opt.value ? 'var(--paper)' : 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10.5px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            border: '1.5px solid var(--ink)',
            borderRadius: '100px',
            padding: '5px 11px',
            backgroundColor: activeFilterCount > 0 ? 'var(--gold)' : 'transparent',
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        categories={categories}
        initial={{
          category: initialCategory,
          condition: initialCondition,
          price: initialPrice,
          photos: initialPhotos,
        }}
      />
    </>
  )
}
