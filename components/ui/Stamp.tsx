import type { CSSProperties } from 'react'

interface StampProps {
  label: string
  variant?: 'default' | 'crimson' | 'gold'
  rotate?: number
  className?: string
  style?: CSSProperties
}

const VARIANT_STYLES: Record<NonNullable<StampProps['variant']>, { bg: string; color: string }> = {
  default: { bg: 'transparent', color: 'var(--ink)' },
  crimson: { bg: 'var(--crimson)', color: 'var(--card)' },
  gold: { bg: 'var(--gold)', color: 'var(--ink)' },
}

export function Stamp({
  label,
  variant = 'default',
  rotate = -12,
  className = '',
  style,
}: StampProps) {
  const { bg, color } = VARIANT_STYLES[variant]

  return (
    <span
      className={`inline-block font-mono-utility text-xs font-semibold px-2.5 py-0.5 ${className}`}
      style={{
        backgroundColor: bg,
        color,
        border: '1.5px solid currentColor',
        borderRadius: 0,
        transform: `rotate(${rotate}deg)`,
        letterSpacing: '0.12em',
        ...style,
      }}
    >
      {label}
    </span>
  )
}
