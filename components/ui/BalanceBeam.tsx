import type { CSSProperties } from 'react'
import type { BalanceRead } from '@/lib/offers/balance'
import { BALANCE_READ_COPY } from '@/lib/offers/balance'

interface BalanceBeamProps {
  read: BalanceRead
  className?: string
  style?: CSSProperties
}

// Positive rotation dips the left (THEIRS) pan; negative dips the right
// (YOURS) pan — a stylized read of the ratio, not a physics simulation.
const ROTATION: Record<BalanceRead, number> = {
  heavily_theirs: 12,
  slightly_theirs: 6,
  close_enough: 0,
  slightly_yours: -6,
  heavily_yours: -12,
  cant_gauge: 0,
}

export function BalanceBeam({ read, className = '', style }: BalanceBeamProps) {
  const rotation = ROTATION[read]
  const readColor = read === 'cant_gauge' ? 'var(--ink-45)' : 'var(--crimson-deep)'

  return (
    <div
      className={className}
      style={{
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        backgroundColor: 'var(--card)',
        boxShadow: 'var(--shadow-hard)',
        padding: '0.875rem 0.75rem 0.625rem',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 300 116"
        width="100%"
        height="116"
        aria-label={`Balance showing your offer against their item — ${BALANCE_READ_COPY[read]}`}
      >
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '150px 34px',
            transition: 'transform 0.5s cubic-bezier(0.34, 1.3, 0.5, 1)',
          }}
        >
          <line
            x1="46"
            y1="34"
            x2="254"
            y2="34"
            stroke="var(--ink)"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <line x1="46" y1="34" x2="46" y2="52" stroke="var(--ink)" strokeWidth={2} />
          <line x1="254" y1="34" x2="254" y2="52" stroke="var(--ink)" strokeWidth={2} />
          <path
            d="M22 52h48l-10 20H32z"
            fill={read === 'cant_gauge' ? 'var(--paper-dim)' : 'var(--gold)'}
            stroke="var(--ink)"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path
            d="M230 52h48l-10 20h-28z"
            fill={read === 'cant_gauge' ? 'var(--paper-dim)' : 'var(--crimson)'}
            stroke="var(--ink)"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <text
            x="46"
            y="66"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fontWeight={600}
            fill="var(--ink)"
          >
            THEIRS
          </text>
          <text
            x="254"
            y="66"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fontWeight={600}
            fill="var(--card)"
          >
            YOURS
          </text>
        </g>
        <path d="M150 34l16 46h-32z" fill="var(--ink)" />
        <rect x="112" y="80" width="76" height="7" rx="2" fill="var(--ink)" />
        <circle cx="150" cy="34" r="6" fill="var(--gold)" stroke="var(--ink)" strokeWidth={2.4} />
      </svg>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: readColor,
          margin: '0.375rem 0 0',
        }}
      >
        {BALANCE_READ_COPY[read]}
      </p>
    </div>
  )
}
