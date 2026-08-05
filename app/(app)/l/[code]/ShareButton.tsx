'use client'

interface ShareButtonProps {
  code: string
  title: string
}

export function ShareButton({ code, title }: ShareButtonProps) {
  const ogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/og/${code}`

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url: `${process.env.NEXT_PUBLIC_APP_URL}/l/${code}` })
        return
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }
    // Fallback: copy the OG image URL
    await navigator.clipboard.writeText(ogUrl)
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share listing"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.625rem 0.75rem',
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-hard)',
        backgroundColor: 'var(--paper)',
        color: 'var(--ink)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M12 3l3 3-3 3M15 6H9a4 4 0 000 8h1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
