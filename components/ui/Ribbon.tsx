import type { CSSProperties, ReactNode } from 'react'

interface RibbonProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  end?: ReactNode
}

export function Ribbon({ children, className = '', style, end }: RibbonProps) {
  return (
    <div
      className={`relative flex items-center justify-center px-8 py-2 ${className}`}
      style={{
        backgroundColor: 'var(--crimson)',
        color: 'var(--card)',
        clipPath:
          'polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%)',
        minHeight: '2.5rem',
        ...style,
      }}
    >
      <span
        className="font-mono-utility text-xs font-semibold tracking-widest"
        style={{ color: 'var(--card)' }}
      >
        {children}
      </span>
      {end && (
        <span
          style={{
            position: 'absolute',
            right: '1.25rem',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          {end}
        </span>
      )}
    </div>
  )
}
