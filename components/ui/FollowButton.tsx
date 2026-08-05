'use client'

import { useTransition } from 'react'
import { followUser, unfollowUser } from '@/lib/social/actions'

interface FollowButtonProps {
  followeeId: string
  initiallyFollowing: boolean
}

export function FollowButton({ followeeId, initiallyFollowing }: FollowButtonProps) {
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      if (initiallyFollowing) {
        await unfollowUser(followeeId)
      } else {
        await followUser(followeeId)
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className="font-mono-utility text-[10px] px-3 py-1 transition-all active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40"
      style={{
        border: 'var(--stroke)',
        borderRadius: 'var(--radius)',
        backgroundColor: initiallyFollowing ? 'var(--paper)' : 'var(--ink)',
        color: initiallyFollowing ? 'var(--ink)' : 'var(--card)',
        boxShadow: 'var(--shadow-hard)',
        letterSpacing: '0.08em',
        cursor: isPending ? 'wait' : 'pointer',
      }}
    >
      {initiallyFollowing ? 'FOLLOWING' : 'FOLLOW'}
    </button>
  )
}
