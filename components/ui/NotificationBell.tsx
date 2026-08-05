'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { markNotificationRead } from '@/lib/offers/actions'
import type { NotificationRow } from '@/types/database'

interface NotificationBellProps {
  notifications: NotificationRow[]
}

const KIND_COPY: Record<NotificationRow['kind'], string> = {
  offer_received: 'sent you an offer',
  offer_countered: 'countered your offer',
  offer_accepted: 'accepted your offer',
  offer_declined: 'declined your offer',
  offer_withdrawn: 'withdrew their offer',
  offer_expired: 'your offer expired',
  meetup_proposed: 'proposed a meetup time',
  deal_completed: 'the deal is complete',
  deal_cancelled: 'cancelled the deal',
  listing_removed: 'your listing was removed',
  account_suspended: 'your account has been suspended',
  hanap_match: 'a new listing matches your Hanap',
}

export function NotificationBell({ notifications }: NotificationBellProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  const visible = notifications.filter((n) => !dismissed.includes(n.id))

  function notificationHref(n: NotificationRow): string {
    if (n.kind === 'hanap_match') return '/'
    if (n.offer_id) return `/deals/${n.offer_id}`
    return '/'
  }

  function handleSelect(notification: NotificationRow) {
    setDismissed((prev) => [...prev, notification.id])
    setOpen(false)
    void markNotificationRead(notification.id)
    router.push(notificationHref(notification))
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={`Notifications${visible.length > 0 ? ` (${visible.length} unread)` : ''}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          width: '1.75rem',
          height: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--card)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M4 15v-5a6 6 0 1112 0v5l1.5 2h-15z"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <path d="M8 17.5a2 2 0 004 0" stroke="currentColor" strokeWidth={1.5} />
        </svg>
        {visible.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: 'var(--gold)',
              border: '1.5px solid var(--crimson)',
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '2.25rem',
            right: 0,
            width: '18rem',
            maxHeight: '20rem',
            overflowY: 'auto',
            backgroundColor: 'var(--card)',
            border: 'var(--stroke)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-hard)',
            zIndex: 30,
          }}
        >
          {visible.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                padding: '0.75rem',
                margin: 0,
              }}
            >
              Nothing new.
            </p>
          ) : (
            visible.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(n)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.625rem 0.75rem',
                  border: 'none',
                  borderBottom: '1px solid var(--paper-dim)',
                  backgroundColor: 'transparent',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                Someone {KIND_COPY[n.kind]}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
