'use client'

import { useEffect } from 'react'

// Replaces the entire root layout on a root-render failure, so it cannot
// rely on app/globals.css's custom properties or fonts being loaded —
// hardcoded hex here is the same approved exception used in
// app/api/og/[code]/route.tsx (Satori can't resolve CSS variables there;
// here, the thing that may have failed to load is the root layout itself).
const C = {
  ink: '#131010',
  ink70: '#4a4340',
  crimson: '#cc0000',
  paper: '#ede3d0',
  card: '#fbf7ef',
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            minHeight: '100vh',
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: C.paper,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: C.ink, margin: 0 }}>
            Baylo Agustino hit a snag.
          </h1>
          <p style={{ fontSize: '0.9375rem', color: C.ink70, margin: 0, maxWidth: '20rem' }}>
            That&rsquo;s on us, not you. Try reloading the page.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: C.crimson,
              color: C.card,
              border: `1.5px solid ${C.ink}`,
              borderRadius: '4px',
              boxShadow: `3px 3px 0 ${C.ink}`,
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
