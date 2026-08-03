// app/(app)/deals/[id]/DealStepper.tsx
import type { CSSProperties } from 'react'
import type { DealSteps, StepState } from '@/lib/deals/stepper'

const LABELS: Array<{ key: keyof Omit<DealSteps, 'cancelled'>; label: string }> = [
  { key: 'offered', label: 'Offered' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'meetup', label: 'Meetup' },
  { key: 'swapped', label: 'Swapped' },
]

function dotStyle(state: StepState): CSSProperties {
  if (state === 'done') return { backgroundColor: 'var(--crimson)', border: 'var(--stroke)' }
  if (state === 'now')
    return {
      backgroundColor: 'var(--gold)',
      border: 'var(--stroke)',
      boxShadow: '0 0 0 3px rgba(255,204,0,0.32)',
    }
  return { backgroundColor: 'var(--card)', border: 'var(--stroke)' }
}

export function DealStepper(steps: DealSteps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0 4px' }}>
      {LABELS.map(({ key, label }, i) => {
        const state = steps[key]
        return (
          <div key={key} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
            {i > 0 && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '7px',
                  left: '-50%',
                  width: '100%',
                  height: '1.5px',
                  backgroundColor: 'var(--ink)',
                  opacity: 0.3,
                }}
              />
            )}
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                position: 'relative',
                zIndex: 1,
                ...dotStyle(state),
              }}
            />
            <span
              style={{
                display: 'block',
                marginTop: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '8.5px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: state === 'now' ? 'var(--ink)' : 'var(--ink-45)',
                fontWeight: state === 'now' ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
