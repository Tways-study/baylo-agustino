'use client'

import imageCompression from 'browser-image-compression'
import { useActionState, useRef, useState } from 'react'
import { completeOnboarding } from '@/lib/auth/actions'
import { HOUSE_RULES_V1 } from '@/lib/auth/house-rules'
import { Button } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

const TOTAL_STEPS = 6

function StepDots({ current }: { current: number }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        justifyContent: 'center',
        marginBottom: '2rem',
      }}
    >
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? '20px' : '8px',
            height: '8px',
            borderRadius: 'var(--radius)',
            backgroundColor: i === current ? 'var(--crimson)' : 'var(--paper-dim)',
            border: 'var(--stroke)',
            transition: 'width 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--ink-45)',
  marginBottom: '0.25rem',
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  padding: '0.75rem 1rem',
  border: 'var(--stroke)',
  borderRadius: 'var(--radius)',
  backgroundColor: 'var(--card)',
  color: 'var(--ink)',
  boxShadow: 'var(--shadow-hard)',
  width: '100%',
  boxSizing: 'border-box',
}

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.8125rem',
  color: 'var(--ink-45)',
  margin: 0,
}

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--crimson)',
  margin: 0,
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [program, setProgram] = useState('')
  const [yearLevel, setYearLevel] = useState<number | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [nameError, setNameError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitState, submitAction, isSubmitting] = useActionState(completeOnboarding, null)

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setIsUploading(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 400,
        useWebWorker: true,
        fileType: 'image/webp',
      })

      // Show local preview immediately
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
          setAvatarPreview(ev.target.result)
        }
      }
      reader.readAsDataURL(compressed)

      // Upload to Supabase Storage
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUploadError('Session expired. Sign in again.')
        return
      }

      const path = `${user.id}/avatar.webp`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' })

      if (error) {
        setUploadError('Upload failed. Try again.')
        return
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(urlData.publicUrl)
    } catch {
      setUploadError('Could not process the image. Try a different photo.')
    } finally {
      setIsUploading(false)
    }
  }

  function advance() {
    if (step === 0) {
      const trimmed = displayName.trim()
      if (trimmed.length < 2 || trimmed.length > 40) {
        setNameError('Name must be 2–40 characters.')
        return
      }
      setNameError('')
    }
    if (step === 4) {
      if (password.length < 8) {
        setPasswordError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match.')
        return
      }
      setPasswordError('')
    }
    setStep((s) => s + 1)
  }

  function retreat() {
    setStep((s) => s - 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: '0.5rem' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--crimson-deep)',
            margin: '0 0 4px',
          }}
        >
          Welcome to
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          Baylo<span style={{ color: 'var(--crimson)' }}>.</span>
        </h1>
      </div>

      <StepDots current={step} />

      <form
        action={submitAction}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
      >
        {/* Hidden fields — always present so final submit has all values */}
        <input type="hidden" name="displayName" value={displayName} />
        <input type="hidden" name="program" value={program} />
        <input type="hidden" name="yearLevel" value={yearLevel ?? ''} />
        <input type="hidden" name="avatarUrl" value={avatarUrl} />
        <input type="hidden" name="password" value={password} />

        {/* ─── Step 0: Display name ─── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="display-name" style={labelStyle}>
              What should we call you?
            </label>
            <input
              id="display-name"
              type="text"
              autoFocus
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  advance()
                }
              }}
              placeholder="Theo Navarro"
              style={inputStyle}
            />
            <p style={hintStyle}>This is what other Agustinians see. Real names build trust.</p>
            {nameError && (
              <p role="alert" style={errorStyle}>
                {nameError}
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={advance}
              style={{ marginTop: '0.5rem' }}
            >
              Next
            </Button>
          </div>
        )}

        {/* ─── Step 1: Program ─── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="program" style={labelStyle}>
              What are you studying?
            </label>
            <input
              id="program"
              type="text"
              autoFocus
              maxLength={60}
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  advance()
                }
              }}
              placeholder="BSIT"
              style={inputStyle}
            />
            <p style={hintStyle}>Abbreviation is fine. You can skip this.</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={retreat}>
                Back
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={advance}>
                {program.trim() ? 'Next' : 'Skip'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Year level ─── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={labelStyle}>What year are you in?</span>
            <div role="group" aria-label="Year level" style={{ display: 'flex', gap: '0.375rem' }}>
              {([1, 2, 3, 4, 5, 6] as const).map((y) => (
                <button
                  key={y}
                  type="button"
                  aria-pressed={yearLevel === y}
                  onClick={() => setYearLevel(yearLevel === y ? null : y)}
                  style={{
                    flex: 1,
                    padding: '0.625rem 0',
                    border: 'var(--stroke)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: yearLevel === y ? 'var(--crimson)' : 'var(--card)',
                    color: yearLevel === y ? 'var(--card)' : 'var(--ink)',
                    boxShadow: yearLevel === y ? 'var(--shadow-hard)' : 'none',
                    transition: 'background-color 0.1s, color 0.1s',
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
            <p style={hintStyle}>Optional. You can skip this.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={retreat}>
                Back
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={advance}>
                {yearLevel !== null ? 'Next' : 'Skip'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Avatar ─── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={labelStyle}>Add a photo so people know it&rsquo;s you.</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              aria-label={avatarUrl ? 'Change profile photo' : 'Add profile photo'}
              style={{
                width: '120px',
                height: '120px',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                boxShadow: 'var(--shadow-hard)',
                cursor: isUploading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                alignSelf: 'center',
                padding: 0,
              }}
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Profile photo preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="16" cy="12" r="5" stroke="var(--ink-45)" strokeWidth="1.5" />
                  <path
                    d="M4 28c0-5.523 5.373-10 12-10s12 4.477 12 10"
                    stroke="var(--ink-45)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="24" cy="24" r="5" fill="var(--crimson)" />
                  <path
                    d="M24 21.5v5M21.5 24h5"
                    stroke="var(--card)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleAvatarPick}
              style={{ display: 'none' }}
            />

            {isUploading && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink-45)',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Uploading…
              </p>
            )}
            {uploadError && (
              <p role="alert" style={errorStyle}>
                {uploadError}
              </p>
            )}
            {avatarUrl && !isUploading && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-45)',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Photo saved. Tap to change it.
              </p>
            )}
            {!avatarUrl && !isUploading && (
              <p style={{ ...hintStyle, textAlign: 'center' }}>
                Optional. Your initials will show if you skip.
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={retreat}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={advance}
                disabled={isUploading}
              >
                {avatarUrl ? 'Next' : 'Skip'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Password ─── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="pw-new" style={labelStyle}>
              Create a password
            </label>
            <input
              id="pw-new"
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={inputStyle}
            />
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              style={{ ...inputStyle, marginTop: '0.25rem' }}
            />
            <p style={hintStyle}>You&rsquo;ll use this to sign in after your first visit.</p>
            {passwordError && (
              <p role="alert" style={errorStyle}>
                {passwordError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={retreat}>
                Back
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={advance}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 5: House rules ─── */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={labelStyle}>The rules of the floor.</span>
            <div
              style={{
                maxHeight: '240px',
                overflowY: 'auto',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                padding: '0.75rem',
                boxShadow: 'var(--shadow-hard)',
              }}
            >
              <ol
                style={{
                  margin: 0,
                  padding: '0 0 0 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem',
                }}
              >
                {HOUSE_RULES_V1.map((rule, i) => (
                  <li
                    key={i}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8125rem',
                      color: 'var(--ink-70)',
                      lineHeight: 1.5,
                    }}
                  >
                    {rule}
                  </li>
                ))}
              </ol>
            </div>

            <label
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                style={{
                  marginTop: '2px',
                  accentColor: 'var(--crimson)',
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--ink)',
                }}
              >
                I&rsquo;ve read these and I&rsquo;m in.
              </span>
            </label>

            {submitState?.error && (
              <p role="alert" style={errorStyle}>
                {submitState.error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="button" variant="ghost" onClick={retreat} disabled={isSubmitting}>
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={!rulesAccepted || isSubmitting}
              >
                {isSubmitting ? 'Setting up…' : 'Enter the floor'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
