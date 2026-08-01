'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Sheet, Button } from '@/components/ui'
import type { CategoryRow } from '@/types/database'

interface FilterSheetValue {
  category: string | null
  condition: string | null
  price: string | null
  photos: boolean
}

interface FilterSheetProps {
  open: boolean
  onClose: () => void
  categories: CategoryRow[]
  initial: FilterSheetValue
}

const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'worn'] as const

const PRICE_BANDS: { value: string; label: string }[] = [
  { value: 'under-200', label: 'Under ₱200' },
  { value: '200-500', label: '₱200–500' },
  { value: '500-1000', label: '₱500–1000' },
  { value: '1000-plus', label: '₱1000+' },
]

const filterLabelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-45)',
  marginBottom: '0.375rem',
  display: 'block',
}

export function FilterSheet({ open, onClose, categories, initial }: FilterSheetProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState<FilterSheetValue>(initial)

  function apply() {
    const params = new URLSearchParams(searchParams.toString())
    const entries: [string, string | null][] = [
      ['category', value.category],
      ['condition', value.condition],
      ['price', value.price],
    ]
    for (const [key, val] of entries) {
      if (val) params.set(key, val)
      else params.delete(key)
    }
    if (value.photos) params.set('photos', '1')
    else params.delete('photos')
    router.push(`${pathname}?${params.toString()}`)
    onClose()
  }

  function clear() {
    setValue({ category: null, condition: null, price: null, photos: false })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <span style={filterLabelStyle}>Category</span>
          <select
            value={value.category ?? ''}
            onChange={(e) => setValue((v) => ({ ...v, category: e.target.value || null }))}
            style={{
              width: '100%',
              padding: '0.625rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--card)',
            }}
          >
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span style={filterLabelStyle}>Condition</span>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue((v) => ({ ...v, condition: v.condition === c ? null : c }))}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: value.condition === c ? 'var(--crimson)' : 'var(--card)',
                  color: value.condition === c ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {c.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={filterLabelStyle}>Price (sale only)</span>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {PRICE_BANDS.map((band) => (
              <button
                key={band.value}
                type="button"
                onClick={() =>
                  setValue((v) => ({ ...v, price: v.price === band.value ? null : band.value }))
                }
                style={{
                  padding: '0.5rem 0.75rem',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: value.price === band.value ? 'var(--crimson)' : 'var(--card)',
                  color: value.price === band.value ? 'var(--card)' : 'var(--ink)',
                }}
              >
                {band.label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.photos}
            onChange={(e) => setValue((v) => ({ ...v, photos: e.target.checked }))}
            style={{ accentColor: 'var(--crimson)', width: '16px', height: '16px' }}
          />
          <span
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink)' }}
          >
            Has photos
          </span>
        </label>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button type="button" variant="ghost" onClick={clear}>
            Clear
          </Button>
          <Button type="button" variant="primary" fullWidth onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
