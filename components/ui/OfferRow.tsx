import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { OfferStatus } from '@/types/database'

interface OfferRowProps {
  href: string
  imageUrl?: string
  listingTitle: string
  counterpartyName: string
  status: OfferStatus
  expiresAt: string
  className?: string
  style?: CSSProperties
}

const STATUS_STYLE: Record<OfferStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'PENDING', bg: 'var(--gold)', color: 'var(--ink)' },
  accepted: { label: 'ACCEPTED', bg: 'var(--crimson)', color: 'var(--card)' },
  declined: { label: 'DECLINED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  withdrawn: { label: 'WITHDRAWN', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  expired: { label: 'EXPIRED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  cancelled: { label: 'CANCELLED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
  countered: { label: 'COUNTERED', bg: 'var(--paper-dim)', color: 'var(--ink-45)' },
}

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return 'expired'
  const hours = Math.round(diffMs / (60 * 60 * 1000))
  if (hours < 1) return '<1h left'
  if (hours < 24) return `${hours}h left`
  return `${Math.round(hours / 24)}d left`
}

export function OfferRow({
  href,
  imageUrl,
  listingTitle,
  counterpartyName,
  status,
  expiresAt,
  className = '',
  style,
}: OfferRowProps) {
  const { label, bg, color } = STATUS_STYLE[status]

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 py-2.5 ${className}`}
      style={{ borderBottom: '1px solid var(--paper-dim)', textDecoration: 'none', ...style }}
    >
      <span
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: '2.5rem',
          height: '2.5rem',
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--paper-dim)',
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-body text-sm truncate" style={{ color: 'var(--ink)' }}>
          {listingTitle}
        </span>
        <span className="block font-mono-utility text-[10px]" style={{ color: 'var(--ink-45)' }}>
          {counterpartyName} · {status === 'pending' ? timeUntil(expiresAt) : label}
        </span>
      </span>
      <span
        className="font-mono-utility text-xs px-2 py-0.5"
        style={{
          backgroundColor: bg,
          color,
          border: 'var(--stroke)',
          borderRadius: 'var(--radius)',
        }}
      >
        {label}
      </span>
    </Link>
  )
}
