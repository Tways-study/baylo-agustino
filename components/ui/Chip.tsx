import type { CSSProperties, ReactNode } from 'react'

interface ChipProps {
  children: ReactNode
  variant?: 'default' | 'active'
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export function Chip({ children, variant = 'default', className = '', style, onClick }: ChipProps) {
  const isActive = variant === 'active'

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`inline-flex items-center font-mono-utility text-xs px-2.5 py-1 cursor-${onClick ? 'pointer' : 'default'} transition-colors ${className}`}
      style={{
        backgroundColor: isActive ? 'var(--ink)' : 'var(--paper)',
        color: isActive ? 'var(--card)' : 'var(--ink)',
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
