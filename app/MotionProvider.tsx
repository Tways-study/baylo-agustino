'use client'

import type { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'

// The prefers-reduced-motion CSS rule in globals.css only reaches
// CSS-driven animation/transition — it can't touch framer-motion's
// JS-driven spring physics (Sheet.tsx's slide-up and drag-to-dismiss).
// reducedMotion="user" makes every current and future motion.* component in
// the app honor the OS setting automatically, with no per-component change.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
