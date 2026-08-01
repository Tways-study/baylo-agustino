'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { logSearchEvent } from '@/lib/discovery/actions'

interface SearchBarProps {
  initialQuery: string
  recentSearches: string[]
}

const DEBOUNCE_MS = 400

export function SearchBar({ initialQuery, recentSearches }: SearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const [showRecent, setShowRecent] = useState(false)
  const [, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushQuery(q: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (q) params.set('q', q)
    else params.delete('q')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
    if (q) void logSearchEvent(q)
  }

  function handleChange(next: string) {
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushQuery(next.trim()), DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="flex items-center gap-2"
        style={{
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--card)',
          padding: '0.625rem 0.75rem',
          boxShadow: 'var(--shadow-hard)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-45)"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setShowRecent(true)}
          onBlur={() => setTimeout(() => setShowRecent(false), 150)}
          placeholder="Search books, calcs, uniforms…"
          aria-label="Search listings"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--ink)',
          }}
        />
      </div>
      {showRecent && value === '' && recentSearches.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--card)',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-hard)',
            zIndex: 10,
            margin: 0,
            padding: '0.375rem 0',
            listStyle: 'none',
          }}
        >
          {recentSearches.map((term) => (
            <li key={term}>
              <button
                type="button"
                onClick={() => {
                  setValue(term)
                  pushQuery(term)
                  setShowRecent(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-70)',
                }}
              >
                {term}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
