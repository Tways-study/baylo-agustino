export interface MeetupIcsInput {
  offerId: string
  spotName: string
  spotHint: string | null
  scheduledAt: string
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function toIcsUtc(iso: string): string {
  const isoNoMillis = new Date(iso).toISOString().split('.')[0]
  return `${isoNoMillis!.replace(/[-:]/g, '')}Z`
}

/**
 * A minimal, hand-written VEVENT block — no ics library, the format is
 * simple enough to produce directly and this avoids a new dependency for
 * one small feature. Times are emitted in plain UTC (Z suffix), which every
 * calendar app converts to local time on import — no VTIMEZONE needed.
 */
export function buildMeetupIcs(input: MeetupIcsInput): string {
  const start = toIcsUtc(input.scheduledAt)
  const end = toIcsUtc(new Date(new Date(input.scheduledAt).getTime() + 30 * 60_000).toISOString())
  const summary = escapeIcsText(`Baylo Agustino meetup — ${input.spotName}`)
  const location = escapeIcsText(input.spotName)
  const description = escapeIcsText(input.spotHint ?? 'Campus safe spot meetup.')
  const uid = `${input.offerId}@baylo-agustino`

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Baylo Agustino//Deal Room//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
