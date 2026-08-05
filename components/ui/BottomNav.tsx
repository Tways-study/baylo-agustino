'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  isPost?: boolean
}

function FeedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="16" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BrowseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PostIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 5v12M5 11h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function DealsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 10l4 4 10-8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface BottomNavProps {
  className?: string
  style?: CSSProperties
}

export function BottomNav({ className = '', style }: BottomNavProps) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    { href: '/', label: 'Feed', icon: <FeedIcon /> },
    { href: '/browse', label: 'Browse', icon: <BrowseIcon /> },
    { href: '/post', label: 'Post', icon: <PostIcon />, isPost: true },
    { href: '/deals', label: 'Deals', icon: <DealsIcon /> },
    { href: '/profile', label: 'Profile', icon: <ProfileIcon /> },
  ]

  return (
    <nav
      aria-label="Main navigation"
      className={`fixed bottom-0 left-0 right-0 flex items-center justify-around ${className}`}
      style={{
        backgroundColor: 'var(--card)',
        borderTop: 'var(--stroke)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: 'calc(3.5rem + env(safe-area-inset-bottom))',
        zIndex: 30,
        ...style,
      }}
    >
      {navItems.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)

        if (item.isPost) {
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label="Post a listing"
              className="flex items-center justify-center transition-transform active:scale-95"
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '50%',
                backgroundColor: 'var(--crimson)',
                color: 'var(--card)',
                border: 'var(--stroke)',
                boxShadow: 'var(--shadow-hard)',
                marginBottom: '0.5rem',
              }}
            >
              {item.icon}
            </Link>
          )
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-0.5 py-2 px-3 transition-colors"
            style={{
              color: isActive ? 'var(--crimson)' : 'var(--ink-45)',
              minWidth: '3rem',
            }}
          >
            {item.icon}
            <span
              className="font-mono-utility"
              style={{
                fontSize: '9px',
                letterSpacing: '0.08em',
                color: 'inherit',
              }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
