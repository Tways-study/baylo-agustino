'use client'

import { useEffect } from 'react'

// Moved out of app/layout.tsx's inline <script dangerouslySetInnerHTML> so
// script-src in the CSP (see middleware.ts) doesn't need 'unsafe-inline' —
// this runs as a normal bundled script (same-origin, 'self' already covers
// it) instead of an inline one.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
    })
  }, [])

  return null
}
