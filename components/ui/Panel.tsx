import type { CSSProperties, ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  padded?: boolean
  className?: string
  style?: CSSProperties
}

export function Panel({ children, padded = true, className = '', style }: PanelProps) {
  return (
    <div
      className={`${padded ? 'p-4' : ''} ${className}`}
      style={{
        backgroundColor: 'var(--card)',
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-hard)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
