'use client'

import type { CSSProperties } from 'react'
import type { CategoryRow, MeetupSpotRow } from '@/types/database'
import type { Intent } from '@/components/ui'
import { Panel } from '@/components/ui'
import type { ScanResult } from '@/lib/listings/banned-words'

export type Condition = 'new' | 'like_new' | 'good' | 'fair' | 'worn'

export interface ListingDetailsValue {
  title: string
  description: string
  categoryId: number | null
  condition: Condition | null
  meetupSpotId: number | null
  wants: string[]
  acceptsCash: boolean
  askPesos: string
}

interface ListingDetailsFieldsProps {
  intent: Intent
  categories: CategoryRow[]
  meetupSpots: MeetupSpotRow[]
  value: ListingDetailsValue
  onChange: (value: ListingDetailsValue) => void
  bannedScan: ScanResult
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--ink-45)',
  marginBottom: '0.25rem',
  display: 'block',
}

const inputStyle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  padding: '0.75rem 1rem',
  border: 'var(--stroke)',
  borderRadius: 'var(--radius)',
  backgroundColor: 'var(--card)',
  color: 'var(--ink)',
  boxShadow: 'var(--shadow-hard)',
  width: '100%',
  boxSizing: 'border-box',
}

const hintStyle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.8125rem',
  color: 'var(--ink-45)',
  margin: 0,
}

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
]

const WANTS_LABEL: Record<Intent, string> = {
  swap: 'What would you take for it?',
  sale: 'Also open to (optional)',
  give: 'Pass it on to (optional)',
}

export function ListingDetailsFields({
  intent,
  categories,
  meetupSpots,
  value,
  onChange,
  bannedScan,
}: ListingDetailsFieldsProps) {
  function set<K extends keyof ListingDetailsValue>(key: K, next: ListingDetailsValue[K]) {
    onChange({ ...value, [key]: next })
  }

  function setWant(index: number, label: string) {
    const wants = [...value.wants]
    wants[index] = label
    set('wants', wants)
  }

  function addWant() {
    if (value.wants.length >= 5) return
    set('wants', [...value.wants, ''])
  }

  function removeWant(index: number) {
    const wants = value.wants.filter((_, i) => i !== index)
    set('wants', wants.length > 0 ? wants : [''])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label htmlFor="listing-title" style={labelStyle}>
          Title
        </label>
        <input
          id="listing-title"
          type="text"
          maxLength={80}
          value={value.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Casio fx-991EX ClassWiz"
          style={inputStyle}
        />
      </div>

      {bannedScan.severity !== 'clean' && (
        <Panel
          style={{
            backgroundColor: bannedScan.severity === 'hard' ? 'var(--paper-dim)' : 'var(--gold)',
            borderColor: bannedScan.severity === 'hard' ? 'var(--crimson-deep)' : undefined,
          }}
        >
          {bannedScan.matches.map((m) => (
            <div key={m.rule} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: bannedScan.severity === 'hard' ? 'var(--crimson-deep)' : 'var(--ink)',
                  margin: 0,
                }}
              >
                {bannedScan.severity === 'hard' ? 'Blocked — ' : 'Heads up — '}
                {m.rule}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink)',
                  margin: 0,
                }}
              >
                {m.explanation}
              </p>
              {bannedScan.severity === 'hard' && (
                <a
                  href="mailto:baylo.agustino@usa.edu.ph"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--crimson-deep)',
                  }}
                >
                  Appeal this
                </a>
              )}
            </div>
          ))}
        </Panel>
      )}

      <div>
        <label htmlFor="listing-description" style={labelStyle}>
          Description (optional)
        </label>
        <textarea
          id="listing-description"
          maxLength={1200}
          rows={3}
          value={value.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Solar OK, comes with case."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div>
        <label htmlFor="listing-category" style={labelStyle}>
          Category
        </label>
        <select
          id="listing-category"
          value={value.categoryId ?? ''}
          onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}
          style={inputStyle}
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span style={labelStyle}>Condition</span>
        <div
          role="group"
          aria-label="Condition"
          style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}
        >
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={value.condition === c.value}
              onClick={() => set('condition', c.value)}
              style={{
                padding: '0.5rem 0.75rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: value.condition === c.value ? 'var(--crimson)' : 'var(--card)',
                color: value.condition === c.value ? 'var(--card)' : 'var(--ink)',
                boxShadow: value.condition === c.value ? 'var(--shadow-hard)' : 'none',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="listing-meetup" style={labelStyle}>
          Meetup spot
        </label>
        <select
          id="listing-meetup"
          value={value.meetupSpotId ?? ''}
          onChange={(e) => set('meetupSpotId', e.target.value ? Number(e.target.value) : null)}
          style={inputStyle}
        >
          <option value="" disabled>
            Choose a meetup spot
          </option>
          {meetupSpots.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {intent === 'swap' && (
        <div>
          <span style={labelStyle}>{WANTS_LABEL.swap}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {value.wants.map((want, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  aria-label={i === 0 ? WANTS_LABEL.swap : `Additional want ${i + 1}`}
                  maxLength={80}
                  value={want}
                  onChange={(e) => setWant(i, e.target.value)}
                  placeholder="Ethics textbook (Bulaong)"
                  style={inputStyle}
                />
                {value.wants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeWant(i)}
                    aria-label="Remove"
                    style={{
                      padding: '0 0.75rem',
                      border: 'var(--stroke)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--card)',
                      cursor: 'pointer',
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            {value.wants.length < 5 && (
              <button
                type="button"
                onClick={addWant}
                style={{
                  alignSelf: 'flex-start',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--crimson-deep)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem 0',
                }}
              >
                + Add another
              </button>
            )}
          </div>
          <label
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              marginTop: '0.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={value.acceptsCash}
              onChange={(e) => set('acceptsCash', e.target.checked)}
              style={{ accentColor: 'var(--crimson)', width: '16px', height: '16px' }}
            />
            <span
              style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink)' }}
            >
              I&rsquo;d also take cash
            </span>
          </label>
        </div>
      )}

      {intent === 'sale' && (
        <div>
          <label htmlFor="listing-price" style={labelStyle}>
            Asking price (₱)
          </label>
          <input
            id="listing-price"
            type="number"
            inputMode="decimal"
            min={1}
            step="1"
            value={value.askPesos}
            onChange={(e) => set('askPesos', e.target.value)}
            placeholder="350"
            style={inputStyle}
          />
        </div>
      )}

      {intent === 'give' && <p style={hintStyle}>No price — this one&rsquo;s free.</p>}
    </div>
  )
}
