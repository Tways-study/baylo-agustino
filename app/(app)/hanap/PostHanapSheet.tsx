'use client'

import { useActionState, useState } from 'react'
import { Sheet, Button } from '@/components/ui'
import { postWant } from '@/lib/wants/actions'

interface PostHanapSheetProps {
  open: boolean
  onClose: () => void
}

export function PostHanapSheet({ open, onClose }: PostHanapSheetProps) {
  const [state, action, pending] = useActionState(postWant, null)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(formData: FormData) {
    setSubmitted(true)
    action(formData)
  }

  // Close on success (no error returned)
  if (submitted && state !== null && !state.error && !pending) {
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Post a Hanap">
      <form action={handleSubmit} className="flex flex-col gap-4 px-4 pb-6">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="want-title"
            className="font-mono-utility"
            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--ink-45)' }}
          >
            WHAT ARE YOU LOOKING FOR
          </label>
          <input
            id="want-title"
            name="title"
            required
            maxLength={120}
            placeholder="e.g. Chem lab manual, 2nd year"
            className="w-full rounded-none border px-3 py-2 text-sm font-body bg-transparent outline-none focus:ring-0"
            style={{
              border: 'var(--stroke)',
              color: 'var(--ink)',
              backgroundColor: 'var(--paper)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="want-offering"
            className="font-mono-utility"
            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--ink-45)' }}
          >
            WHAT YOU&apos;D OFFER IN RETURN (OPTIONAL)
          </label>
          <input
            id="want-offering"
            name="offering"
            maxLength={200}
            placeholder="e.g. Lab gown, size M"
            className="w-full rounded-none border px-3 py-2 text-sm font-body bg-transparent outline-none"
            style={{
              border: 'var(--stroke)',
              color: 'var(--ink)',
              backgroundColor: 'var(--paper)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="want-budget"
            className="font-mono-utility"
            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--ink-45)' }}
          >
            MAX BUDGET IN ₱ (OPTIONAL)
          </label>
          <div
            className="flex items-center"
            style={{ border: 'var(--stroke)', backgroundColor: 'var(--paper)' }}
          >
            <span
              className="px-3 py-2 font-mono-utility text-sm select-none"
              style={{ color: 'var(--ink-45)', borderRight: 'var(--stroke)' }}
            >
              ₱
            </span>
            <input
              id="want-budget"
              name="budgetCentavos"
              type="number"
              min="1"
              placeholder="0"
              className="flex-1 px-3 py-2 text-sm font-body bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        </div>

        {state?.error && (
          <p className="text-sm" style={{ color: 'var(--crimson)' }}>
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full mt-2">
          {pending ? 'Posting…' : 'Post Hanap'}
        </Button>
      </form>
    </Sheet>
  )
}
