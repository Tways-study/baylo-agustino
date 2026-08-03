'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/lib/deals/realtime'
import { Button } from '@/components/ui'
import type { MessageRow } from '@/types/database'
import { formatRelativeTime } from '@/lib/listings/format'

type ChatMessage = MessageRow & { pending?: boolean }

interface DealChatProps {
  offerId: string
  initialMessages: MessageRow[]
  currentUserId: string
  canSend: boolean
}

export function DealChat({ offerId, initialMessages, currentUserId, canSend }: DealChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting'>('connected')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const queueRef = useRef<ChatMessage[]>([])
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const channel = supabase
      .channel(`messages-offer-${offerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `offer_id=eq.${offerId}` },
        (payload) => {
          const row = payload.new as MessageRow
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            const withoutOptimistic = prev.filter(
              (m) => !(m.pending && m.sender_id === row.sender_id && m.body === row.body),
            )
            return [...withoutOptimistic, row]
          })
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionState('reconnecting')
        if (status === 'SUBSCRIBED') setConnectionState('connected')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [offerId, supabase])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function deliver(message: ChatMessage) {
    const res = await sendMessage(supabase, currentUserId, { offerId, body: message.body })
    if (res.error) {
      queueRef.current.push(message)
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, pending: false } : m)))
  }

  useEffect(() => {
    function flushQueue() {
      const queued = queueRef.current
      queueRef.current = []
      for (const message of queued) {
        void deliver(message)
      }
    }
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
    // deliver is stable across renders in practice (closes only over
    // supabase/currentUserId/offerId, all stable for this component's
    // lifetime) — re-subscribing this listener on every render would be
    // wasteful with no behavioral benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSend() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    setSending(true)

    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      offer_id: offerId,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      queueRef.current.push(optimistic)
    } else {
      await deliver(optimistic)
    }
    setSending(false)
  }

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
                opacity: m.pending ? 0.6 : 1,
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
                {m.pending ? 'Sending…' : formatRelativeTime(m.created_at)}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {canSend && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSend()
            }}
            placeholder="Write a message…"
            maxLength={1000}
            style={{
              flex: 1,
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              padding: '0.625rem 0.875rem',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
            }}
          />
          <Button
            type="button"
            variant="primary"
            disabled={sending || !draft.trim()}
            onClick={() => void handleSend()}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  )
}
