'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setPasswordSchema } from '@/lib/auth/schemas'
import { Button } from '@/components/ui'

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  padding: '0.75rem 1rem',
  border: 'var(--stroke)',
  borderRadius: 'var(--radius)',
  backgroundColor: 'var(--card)',
  color: 'var(--ink)',
  outline: 'none',
  boxShadow: 'var(--shadow-hard)',
  width: '100%',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--ink-45)',
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = setPasswordSchema.safeParse({ password, confirmPassword })
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? 'Check your entries.')
      return
    }

    setIsPending(true)
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsPending(false)

    if (updateError) {
      setError('Could not update your password. Try again.')
      return
    }

    router.push('/')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--crimson-deep)',
            margin: '0 0 6px',
          }}
        >
          University of San Agustin
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 0.92,
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          New password
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--ink-70)',
            margin: '8px 0 0',
          }}
        >
          Choose something you&rsquo;ll remember.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="new-password" style={labelStyle}>
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="confirm-password" style={labelStyle}>
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <p
            role="alert"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: 'var(--crimson)',
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth disabled={isPending}>
          {isPending ? 'Updating…' : 'Set new password'}
        </Button>
      </form>
    </div>
  )
}
