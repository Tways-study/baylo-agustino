'use client'

import { useState } from 'react'

interface HeroCarouselProps {
  imageUrls: string[]
}

export function HeroCarousel({ imageUrls }: HeroCarouselProps) {
  const [index, setIndex] = useState(0)

  if (imageUrls.length === 0) {
    return (
      <div
        style={{
          aspectRatio: '4/3',
          backgroundColor: 'var(--crimson)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--card)',
            letterSpacing: '0.1em',
          }}
        >
          NO PHOTO
        </span>
      </div>
    )
  }

  const current = imageUrls[index] ?? imageUrls[0]

  return (
    <div style={{ position: 'relative', aspectRatio: '4/3', backgroundColor: 'var(--paper-dim)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {imageUrls.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setIndex((i) => (i - 1 + imageUrls.length) % imageUrls.length)}
            style={{
              position: 'absolute',
              left: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              border: 'var(--stroke)',
              backgroundColor: 'var(--card)',
              cursor: 'pointer',
            }}
          >
            &lsaquo;
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => setIndex((i) => (i + 1) % imageUrls.length)}
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              border: 'var(--stroke)',
              backgroundColor: 'var(--card)',
              cursor: 'pointer',
            }}
          >
            &rsaquo;
          </button>
          <span
            style={{
              position: 'absolute',
              bottom: '0.5rem',
              right: '0.5rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              padding: '2px 6px',
              backgroundColor: 'var(--card)',
              border: 'var(--stroke)',
              borderRadius: 'var(--radius)',
            }}
          >
            {index + 1} / {imageUrls.length}
          </span>
        </>
      )}
    </div>
  )
}
