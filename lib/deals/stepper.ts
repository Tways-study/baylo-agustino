export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'countered'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'completed'

export type StepState = 'done' | 'now' | 'future'

export interface DealSteps {
  offered: StepState
  accepted: StepState
  meetup: StepState
  swapped: StepState
  cancelled: boolean
}

const PENDING_STATE: DealSteps = {
  offered: 'now',
  accepted: 'future',
  meetup: 'future',
  swapped: 'future',
  cancelled: false,
}

/**
 * Pure mapping from offers.status to the deal room's 4-step stepper —
 * no new stored state. Cancellation can only happen from 'accepted'
 * (see cancel_deal's own guard), so a cancelled deal is rendered as having
 * reached "Meetup" before the cancelled flag takes over the display —
 * callers show a Stamp instead of the stepper when cancelled is true.
 */
export function dealSteps(offer: { status: OfferStatus }): DealSteps {
  switch (offer.status) {
    case 'accepted':
      return {
        offered: 'done',
        accepted: 'done',
        meetup: 'now',
        swapped: 'future',
        cancelled: false,
      }
    case 'completed':
      return { offered: 'done', accepted: 'done', meetup: 'done', swapped: 'now', cancelled: false }
    case 'cancelled':
      return {
        offered: 'done',
        accepted: 'done',
        meetup: 'done',
        swapped: 'future',
        cancelled: true,
      }
    case 'pending':
    case 'declined':
    case 'countered':
    case 'withdrawn':
    case 'expired':
      return PENDING_STATE
  }
}
