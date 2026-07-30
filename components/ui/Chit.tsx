import type { CSSProperties, ReactNode } from 'react'
import { IntentTag } from './IntentTag'
import type { Intent } from './types'

interface ChitProps {
  code: string
  intent: Intent
  title: string
  condition?: string
  imageUrl?: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export function Chit({
  code,
  intent,
  title,
  condition,
  imageUrl,
  children,
  className = '',
  style,
  onClick,
}: ChitProps) {
  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`flex min-h-[9rem] ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        backgroundColor: 'var(--card)',
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-hard)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Stub — left vertical strip with item code */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{
          width: '2rem',
          backgroundColor: 'var(--paper-dim)',
          borderRight: 'var(--stroke)',
        }}
      >
        {/* Punched notch circles at top and bottom */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: 'var(--paper)',
            border: 'var(--stroke)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: 'var(--paper)',
            border: 'var(--stroke)',
          }}
        />
        {/* Vertical code */}
        <span
          className="font-mono-utility text-[10px] select-none"
          style={{
            color: 'var(--ink-45)',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            letterSpacing: '0.12em',
          }}
        >
          {code}
        </span>
      </div>

      {/* Perforated divider */}
      <div
        aria-hidden="true"
        style={{
          width: 0,
          borderLeft: '1.5px dashed var(--ink)',
          opacity: 0.3,
          flexShrink: 0,
        }}
      />

      {/* Main content area */}
      <div className="flex flex-1 min-w-0">
        {/* Text content */}
        <div className="flex flex-col justify-between p-3 flex-1 min-w-0 gap-2">
          <div className="flex items-start gap-2 flex-wrap">
            <IntentTag intent={intent} />
            {condition && (
              <span className="font-mono-utility text-[10px]" style={{ color: 'var(--ink-45)' }}>
                {condition.replace('_', ' ')}
              </span>
            )}
          </div>
          <h3
            className="font-display text-base leading-snug line-clamp-2"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            {title}
          </h3>
          {children && <div className="mt-auto">{children}</div>}
        </div>

        {/* Image thumbnail */}
        {imageUrl && (
          <div
            className="shrink-0 self-stretch"
            style={{
              width: '5rem',
              borderLeft: 'var(--stroke)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </article>
  )
}
