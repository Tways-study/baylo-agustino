import type { CSSProperties } from 'react'
import type { Intent } from './types'

interface IntentTagProps {
  intent: Intent
  className?: string
  style?: CSSProperties
}

const INTENT_STYLES: Record<Intent, { bg: string; color: string; label: string }> = {
  swap: { bg: 'var(--gold)', color: 'var(--ink)', label: 'Swap' },
  sale: { bg: 'var(--crimson)', color: 'var(--card)', label: 'Sale' },
  give: { bg: 'var(--ink)', color: 'var(--card)', label: 'Give' },
}

export function IntentTag({ intent, className = '', style }: IntentTagProps) {
  const { bg, color, label } = INTENT_STYLES[intent]

  return (
    <span
      className={`inline-block font-mono-utility text-xs font-medium px-2 py-0.5 ${className}`}
      style={{
        backgroundColor: bg,
        color,
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        letterSpacing: '0.1em',
        ...style,
      }}
    >
      {label}
    </span>
  )
}
