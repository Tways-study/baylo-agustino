import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
  fullWidth?: boolean
  style?: CSSProperties
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; color: string }> = {
  primary: { bg: 'var(--crimson)', color: 'var(--card)' },
  secondary: { bg: 'var(--paper)', color: 'var(--ink)' },
  ghost: { bg: 'transparent', color: 'var(--ink)' },
}

export function Button({
  variant = 'secondary',
  children,
  fullWidth = false,
  className = '',
  style,
  disabled,
  ...props
}: ButtonProps) {
  const { bg, color } = VARIANT_STYLES[variant]

  return (
    <button
      {...props}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2
        font-body font-medium text-sm
        px-4 py-2.5
        transition-all duration-100
        select-none
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'}
        ${className}
      `
        .replace(/\s+/g, ' ')
        .trim()}
      style={{
        backgroundColor: disabled ? 'var(--paper-dim)' : bg,
        color: disabled ? 'var(--ink-45)' : color,
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        boxShadow: disabled ? 'none' : 'var(--shadow-hard)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
