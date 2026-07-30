import type { CSSProperties, ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  headline: string
  body?: string
  ctaLabel?: string
  onCta?: () => void
  ctaHref?: string
  icon?: ReactNode
  className?: string
  style?: CSSProperties
}

export function EmptyState({
  headline,
  body,
  ctaLabel,
  onCta,
  ctaHref,
  icon,
  className = '',
  style,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-4 px-6 py-12 ${className}`}
      style={style}
    >
      {icon && (
        <div style={{ color: 'var(--ink-45)', marginBottom: '0.25rem' }} aria-hidden="true">
          {icon}
        </div>
      )}

      <h2
        className="font-display text-2xl leading-tight"
        style={{ color: 'var(--ink)', letterSpacing: '-0.03em', maxWidth: '18rem' }}
      >
        {headline}
      </h2>

      {body && (
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--ink-70)', maxWidth: '16rem' }}
        >
          {body}
        </p>
      )}

      {ctaLabel && onCta && (
        <Button variant="primary" onClick={onCta} style={{ marginTop: '0.5rem' }}>
          {ctaLabel}
        </Button>
      )}

      {ctaLabel && ctaHref && !onCta && (
        <a
          href={ctaHref}
          className="inline-flex items-center justify-center gap-2 font-body font-medium text-sm px-4 py-2.5 transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          style={{
            backgroundColor: 'var(--crimson)',
            color: 'var(--card)',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-hard)',
            marginTop: '0.5rem',
            textDecoration: 'none',
          }}
        >
          {ctaLabel}
        </a>
      )}
    </div>
  )
}
