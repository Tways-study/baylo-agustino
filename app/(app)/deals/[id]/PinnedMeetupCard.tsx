'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Panel } from '@/components/ui'
import { proposeMeetup, confirmMeetup } from '@/lib/deals/actions'
import { buildMeetupIcs } from '@/lib/deals/ics'
import type { MeetupWithSpot } from '@/lib/deals/queries'
import type { MeetupSpotRow } from '@/types/database'

interface PinnedMeetupCardProps {
  offerId: string
  meetup: MeetupWithSpot | null
  meetupSpots: MeetupSpotRow[]
  currentUserId: string
  ownerId: string
}

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-45)',
  display: 'block',
  marginBottom: '0.25rem',
}

const inputStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: '1rem',
  padding: '0.625rem 0.875rem',
  border: 'var(--stroke)',
  borderRadius: 'var(--radius)',
  width: '100%',
  boxSizing: 'border-box' as const,
}

function toDatetimeLocalMin(): string {
  return new Date().toISOString().slice(0, 16)
}

export function PinnedMeetupCard({
  offerId,
  meetup,
  meetupSpots,
  currentUserId,
  ownerId,
}: PinnedMeetupCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [spotId, setSpotId] = useState<string>(meetupSpots[0]?.id.toString() ?? '')
  const [when, setWhen] = useState('')

  const isOwner = currentUserId === ownerId
  const myConfirmed = meetup
    ? isOwner
      ? meetup.confirmed_by_owner
      : meetup.confirmed_by_offerer
    : false
  const bothConfirmed = meetup ? meetup.confirmed_by_offerer && meetup.confirmed_by_owner : false

  function handlePropose() {
    if (!spotId || !when) return
    setError(null)
    startTransition(async () => {
      const res = await proposeMeetup({
        offerId,
        spotId: Number(spotId),
        scheduledAt: new Date(when).toISOString(),
      })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await confirmMeetup(offerId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function handleDownloadIcs() {
    if (!meetup) return
    const ics = buildMeetupIcs({
      offerId,
      spotName: meetup.spot.name,
      spotHint: meetup.spot.hint,
      scheduledAt: meetup.scheduled_at,
    })
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'baylo-agustino-meetup.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel>
      {error && (
        <p
          role="alert"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--crimson)', marginTop: 0 }}
        >
          {error}
        </p>
      )}

      {!meetup ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            Pick a time and place
          </p>
          <div>
            <label htmlFor="meetup-spot" style={labelStyle}>
              Meetup spot
            </label>
            <select
              id="meetup-spot"
              value={spotId}
              onChange={(e) => setSpotId(e.target.value)}
              style={inputStyle}
            >
              {meetupSpots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="meetup-when" style={labelStyle}>
              When
            </label>
            <input
              id="meetup-when"
              type="datetime-local"
              min={toDatetimeLocalMin()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={inputStyle}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={isPending || !spotId || !when}
            onClick={handlePropose}
          >
            Propose
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-45)',
              margin: 0,
            }}
          >
            {new Intl.DateTimeFormat('en-PH', {
              timeZone: 'Asia/Manila',
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date(meetup.scheduled_at))}
          </p>
          <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
            {meetup.spot.name}
          </h4>
          {meetup.spot.hint && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--ink-70)',
                margin: 0,
              }}
            >
              {meetup.spot.hint}
            </p>
          )}

          {bothConfirmed ? (
            <Button type="button" variant="secondary" onClick={handleDownloadIcs}>
              Add to calendar
            </Button>
          ) : myConfirmed ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Waiting for the other side to confirm.
            </p>
          ) : (
            <Button type="button" variant="primary" disabled={isPending} onClick={handleConfirm}>
              Confirm
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}
