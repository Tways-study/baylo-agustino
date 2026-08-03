'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MessageRow } from '@/types/database'
import { formatRelativeTime } from '@/lib/listings/format'

interface DealChatProps {
  offerId: string
  initialMessages: MessageRow[]
  currentUserId: string
}

export function DealChat({ offerId, initialMessages, currentUserId }: DealChatProps) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages)
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting'>('connected')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages-offer-${offerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `offer_id=eq.${offerId}` },
        (payload) => {
          const row = payload.new as MessageRow
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionState('reconnecting')
        if (status === 'SUBSCRIBED') setConnectionState('connected')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [offerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {connectionState === 'reconnecting' && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-45)',
            margin: 0,
          }}
        >
          Reconnecting…
        </p>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '18rem',
          overflowY: 'auto',
        }}
      >
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: mine ? 'var(--crimson)' : 'var(--card)',
                color: mine ? 'var(--card)' : 'var(--ink)',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                padding: '0.5rem 0.75rem',
              }}
            >
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: 0 }}>
                {m.body}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  opacity: 0.7,
                  margin: '0.25rem 0 0',
                }}
              >
                {formatRelativeTime(m.created_at)}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
