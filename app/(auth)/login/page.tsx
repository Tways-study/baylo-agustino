'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { sendOtp, verifyOtp } from '@/lib/auth/actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local[0]}***@${domain}`
}

export default function LoginPage() {
  const [stage, setStage] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [countdown, setCountdown] = useState(0)
  const otpRef = useRef<HTMLInputElement>(null)

  const [sendState, sendAction, isSendPending] = useActionState(sendOtp, null)
  const [verifyState, verifyAction, isVerifyPending] = useActionState(verifyOtp, null)

  // Pick up an implicit-flow session from the URL hash, if present. Admin-
  // generated magic links (E2E fixture sign-in only — see e2e/helpers/auth.ts)
  // redirect here with #access_token=...&refresh_token=... instead of
  // hitting a Server Action, since there's no code_verifier for an
  // admin-side link generation to pair with a PKCE exchange. The normal
  // OTP email/code flow never produces a hash, so this is a no-op for it.
  useEffect(() => {
    // E2E-only pickup path (see e2e/helpers/auth.ts) — the real OTP
    // email/code flow never produces a hash. Dead in production: this
    // check is a static `process.env.NODE_ENV` comparison, which Next.js
    // inlines at build time and dead-code-eliminates from the production
    // bundle, so it never ships as live attack surface on a real deploy.
    if (process.env.NODE_ENV === 'production') return

    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.slice(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return

    void (async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) return
      window.history.replaceState(null, '', window.location.pathname)
      window.location.href = '/'
    })()
  }, [])

  // Transition to OTP stage after successful send
  useEffect(() => {
    if (sendState && !sendState.error) {
      setStage('otp')
      setCountdown(60)
      setTimeout(() => otpRef.current?.focus(), 100)
    }
  }, [sendState])

  // Countdown for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Wordmark */}
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
            fontSize: '3rem',
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 0.92,
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          Baylo<span style={{ color: 'var(--crimson)' }}>.</span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--ink-70)',
            margin: '8px 0 0',
          }}
        >
          {stage === 'email'
            ? 'Swap, sell, or give — on campus only.'
            : `Code sent to ${maskEmail(email)}`}
        </p>
      </div>

      {/* Email stage */}
      {stage === 'email' && (
        <form
          action={sendAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label
              htmlFor="email"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
              }}
            >
              USa email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@usa.edu.ph"
              style={{
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
              }}
            />
          </div>

          {sendState?.error && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--crimson)',
                margin: 0,
              }}
            >
              {sendState.error}
            </p>
          )}

          <Button type="submit" variant="primary" fullWidth disabled={isSendPending}>
            {isSendPending ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      )}

      {/* OTP stage */}
      {stage === 'otp' && (
        <form
          action={verifyAction}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <input type="hidden" name="email" value={email} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label
              htmlFor="token"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--ink-45)',
              }}
            >
              6-digit code
            </label>
            <input
              id="token"
              name="token"
              ref={otpRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="000000"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.75rem',
                fontWeight: 600,
                letterSpacing: '0.3em',
                textAlign: 'center',
                padding: '0.75rem 1rem',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                color: 'var(--ink)',
                outline: 'none',
                boxShadow: 'var(--shadow-hard)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {verifyState?.error && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--crimson)',
                margin: 0,
              }}
            >
              {verifyState.error}
            </p>
          )}

          <Button type="submit" variant="primary" fullWidth disabled={isVerifyPending}>
            {isVerifyPending ? 'Verifying…' : 'Verify'}
          </Button>

          <button
            type="button"
            disabled={countdown > 0}
            onClick={() => {
              const fd = new FormData()
              fd.set('email', email)
              sendAction(fd)
              setCountdown(60)
            }}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: countdown > 0 ? 'var(--ink-45)' : 'var(--crimson)',
              cursor: countdown > 0 ? 'default' : 'pointer',
              padding: 0,
              textAlign: 'center',
            }}
          >
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
          </button>
        </form>
      )}
    </div>
  )
}
