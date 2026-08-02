'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Panel } from '@/components/ui'
import type { Intent } from '@/components/ui'
import type { CategoryRow, MeetupSpotRow } from '@/types/database'
import { updateListing } from '@/lib/listings/actions'
import { centavosToPesos, pesosToCentavos } from '@/lib/listings/format'
import { scanListingText, type ScanResult } from '@/lib/listings/banned-words'
import { ListingDetailsFields, type ListingDetailsValue } from '../../../post/ListingDetailsFields'

interface EditListingFormProps {
  listingId: string
  code: string
  intent: Intent
  categories: CategoryRow[]
  meetupSpots: MeetupSpotRow[]
  initial: {
    title: string
    description: string | null
    categoryId: number | null
    condition: ListingDetailsValue['condition']
    meetupSpotId: number | null
    askCentavos: number | null
    estimatedValueCentavos: number | null
    acceptsCash: boolean
    wants: string[]
  }
}

export function EditListingForm({
  listingId,
  code,
  intent,
  categories,
  meetupSpots,
  initial,
}: EditListingFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<ListingDetailsValue>({
    title: initial.title,
    description: initial.description ?? '',
    categoryId: initial.categoryId,
    condition: initial.condition,
    meetupSpotId: initial.meetupSpotId,
    wants: initial.wants.length > 0 ? initial.wants : [''],
    acceptsCash: initial.acceptsCash,
    askPesos: initial.askCentavos ? centavosToPesos(initial.askCentavos) : '',
    estimatedValuePesos: initial.estimatedValueCentavos
      ? centavosToPesos(initial.estimatedValueCentavos)
      : '',
  })

  const bannedScan: ScanResult = useMemo(
    () => scanListingText(`${details.title} ${details.description}`),
    [details.title, details.description],
  )

  function canSubmit(): boolean {
    if (bannedScan.severity === 'hard') return false
    if (
      details.title.trim().length < 3 ||
      !details.categoryId ||
      !details.condition ||
      !details.meetupSpotId
    )
      return false
    if (intent === 'swap' && details.wants.every((w) => w.trim().length === 0)) return false
    if (intent === 'sale' && !details.askPesos.trim()) return false
    return true
  }

  function handleSubmit() {
    setError(null)

    const base = {
      title: details.title,
      description: details.description || undefined,
      categoryId: details.categoryId ?? 0,
      condition: details.condition ?? 'good',
      meetupSpotId: details.meetupSpotId ?? 0,
    }

    const payload =
      intent === 'swap'
        ? {
            ...base,
            intent: 'swap' as const,
            wants: details.wants.map((w) => w.trim()).filter(Boolean),
            acceptsCash: details.acceptsCash,
            estimatedValueCentavos: details.estimatedValuePesos
              ? pesosToCentavos(details.estimatedValuePesos)
              : undefined,
          }
        : intent === 'sale'
          ? {
              ...base,
              intent: 'sale' as const,
              askCentavos: pesosToCentavos(details.askPesos || '0'),
            }
          : { ...base, intent: 'give' as const }

    startTransition(async () => {
      const res = await updateListing(listingId, payload)
      if (res.error) {
        setError(res.error)
      } else {
        router.push(`/l/${code}`)
      }
    })
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ListingDetailsFields
        intent={intent}
        categories={categories}
        meetupSpots={meetupSpots}
        value={details}
        onChange={setDetails}
        bannedScan={bannedScan}
      />

      {error && bannedScan.severity !== 'hard' && (
        <Panel style={{ backgroundColor: 'var(--paper-dim)' }}>
          <p
            role="alert"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: 'var(--crimson)',
              margin: 0,
            }}
          >
            {error}
          </p>
        </Panel>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/l/${code}`)}
          disabled={isPending}
        >
          Cancel
        </Button>
        {bannedScan.severity === 'hard' ? (
          <Button type="button" variant="primary" fullWidth disabled>
            Blocked
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={!canSubmit() || isPending}
            onClick={handleSubmit}
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  )
}
