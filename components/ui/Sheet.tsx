'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  className?: string
  style?: CSSProperties
}

export function Sheet({ open, onClose, children, title, className = '', style }: SheetProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const content = (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(19,16,16,0.6)',
              zIndex: 40,
            }}
          />

          {/* Sheet panel */}
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose()
            }}
            className={`${className}`}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'var(--card)',
              border: 'var(--stroke)',
              borderBottom: 'none',
              borderRadius: '4px 4px 0 0',
              paddingBottom: 'env(safe-area-inset-bottom)',
              zIndex: 50,
              maxHeight: '90dvh',
              overflowY: 'auto',
              ...style,
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                aria-hidden="true"
                style={{
                  width: '2.5rem',
                  height: '4px',
                  backgroundColor: 'var(--ink-45)',
                  borderRadius: '2px',
                }}
              />
            </div>

            {title && (
              <div
                className="px-4 pb-3 font-display text-lg"
                style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
              >
                {title}
              </div>
            )}

            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (!mounted) return null
  return createPortal(content, document.body)
}
