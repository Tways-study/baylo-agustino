import type { CSSProperties } from 'react'
import Link from 'next/link'
import { IntentTag } from './IntentTag'
import type { Intent } from './types'

type ListingStatus = 'active' | 'reserved' | 'completed' | 'archived' | 'removed' | 'draft'

interface MiniListingRowProps {
  href: string
  imageUrl?: string
  title: string
  code: string
  status: ListingStatus
  intent: Intent
  viewCount: number
  className?: string
  style?: CSSProperties
}

const STATUS_LABEL: Record<Exclude<ListingStatus, 'active'>, string> = {
  reserved: 'RESERVED',
  completed: 'DONE',
  archived: 'ARCHIVED',
  removed: 'REMOVED',
  draft: 'DRAFT',
}

export function MiniListingRow({
  href,
  imageUrl,
  title,
  code,
  status,
  intent,
  viewCount,
  className = '',
  style,
}: MiniListingRowProps) {
  const metaLine =
    status === 'active' ? `${code} · ${viewCount} VIEWS` : `${code} · ${STATUS_LABEL[status]}`

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-body text-sm truncate" style={{ color: 'var(--ink)' }}>
          {title}
        </span>
        <span className="block font-mono-utility text-[10px]" style={{ color: 'var(--ink-45)' }}>
          {metaLine}
        </span>
      </span>
      <IntentTag intent={intent} />
    </Link>
  )
}
