'use client'

import { useState, useTransition } from 'react'
import { Button, Sheet } from '@/components/ui'
import { deleteAccount } from '@/lib/account/actions'

const linkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--ink)',
}

export function LegalSection() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirmDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteAccount()
      // On success, deleteAccount() redirects server-side — this line is
      // only reached on failure.
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div
      style={{
        marginTop: '2rem',
        paddingTop: '1rem',
        borderTop: 'var(--stroke)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <p className="font-mono-utility text-[10px]" style={{ color: 'var(--ink-45)' }}>
        Legal
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <a href="/legal/privacy" style={linkStyle}>
          Privacy notice
        </a>
        <a href="/legal/terms" style={linkStyle}>
          Terms of use
        </a>
        <a href="/legal/house-rules" style={linkStyle}>
          House rules
        </a>
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--ink-45)' }}>
        Questions or concerns: [ADMIN CONTACT — TODO: name + email before launch]
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: '0.5rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem',
          color: 'var(--crimson)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        Delete my account
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Delete your account">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--ink-70)' }}
          >
            This permanently deletes your profile, listings, offers, messages, and everything else
            tied to your account. This cannot be undone.
          </p>

          {error && (
            <p role="alert" style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)' }}>
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending}
            onClick={handleConfirmDelete}
          >
            {isPending ? 'Deleting…' : 'Yes, delete my account'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
