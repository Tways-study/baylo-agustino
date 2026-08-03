import { describe, expect, it } from 'vitest'
import { dealSteps, type OfferStatus } from './stepper'

describe('dealSteps', () => {
  it('pending: only Offered is current', () => {
    expect(dealSteps({ status: 'pending' })).toEqual({
      offered: 'now',
      accepted: 'future',
      meetup: 'future',
      swapped: 'future',
      cancelled: false,
    })
  })

  it('accepted: Offered and Accepted done, Meetup current', () => {
    expect(dealSteps({ status: 'accepted' })).toEqual({
      offered: 'done',
      accepted: 'done',
      meetup: 'now',
      swapped: 'future',
      cancelled: false,
    })
  })

  it('completed: everything done through Swapped current', () => {
    expect(dealSteps({ status: 'completed' })).toEqual({
      offered: 'done',
      accepted: 'done',
      meetup: 'done',
      swapped: 'now',
      cancelled: false,
    })
  })

  it('cancelled: cancelled flag set, steps still reflect having reached accepted', () => {
    expect(dealSteps({ status: 'cancelled' })).toEqual({
      offered: 'done',
      accepted: 'done',
      meetup: 'done',
      swapped: 'future',
      cancelled: true,
    })
  })

  const deadEndStatuses: OfferStatus[] = ['declined', 'countered', 'withdrawn', 'expired']
  for (const status of deadEndStatuses) {
    it(`${status}: same as pending (deal room only mounts the stepper once accepted+)`, () => {
      expect(dealSteps({ status })).toEqual({
        offered: 'now',
        accepted: 'future',
        meetup: 'future',
        swapped: 'future',
        cancelled: false,
      })
    })
  }
})
