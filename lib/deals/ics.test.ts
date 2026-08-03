import { describe, expect, it } from 'vitest'
import { buildMeetupIcs } from './ics'

describe('buildMeetupIcs', () => {
  it('converts a +08:00 local time to a Z-suffixed UTC DTSTART', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: 'Ground floor, beside the guard desk',
      scheduledAt: '2026-09-20T10:30:00+08:00',
    })
    expect(ics).toContain('DTSTART:20260920T023000Z')
  })

  it('sets DTEND 30 minutes after DTSTART', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00+08:00',
    })
    expect(ics).toContain('DTEND:20260920T030000Z')
  })

  it('escapes commas and semicolons in the location hint', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: 'Ground floor, beside the guard desk; ask for room 3',
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('DESCRIPTION:Ground floor\\, beside the guard desk\\; ask for room 3')
  })

  it('falls back to a generic description when no hint is set', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('DESCRIPTION:Campus safe spot meetup.')
  })

  it('includes the spot name in both SUMMARY and LOCATION', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('SUMMARY:Baylo Agustino meetup — Library lobby')
    expect(ics).toContain('LOCATION:Library lobby')
  })

  it('derives a stable UID from the offer id', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics).toContain('UID:abc-123@baylo-agustino')
  })

  it('wraps the event in a valid VCALENDAR/VEVENT block', () => {
    const ics = buildMeetupIcs({
      offerId: 'abc-123',
      spotName: 'Library lobby',
      spotHint: null,
      scheduledAt: '2026-09-20T10:30:00Z',
    })
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
  })
})
