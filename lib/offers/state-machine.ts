export type OfferStatus =
  'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn' | 'expired' | 'cancelled'

export type OfferAction = 'accept' | 'decline' | 'counter' | 'withdraw'

export type OfferRole = 'offerer' | 'recipient'

/**
 * Pure client-side predictor mirroring the RPCs' actual transition rules —
 * used only to disable/enable action buttons optimistically. The database
 * (accept_offer/decline_offer/counter_offer/withdraw_offer) remains the
 * sole authority; this never substitutes for calling those RPCs.
 */
export function canTransition(status: OfferStatus, action: OfferAction, role: OfferRole): boolean {
  if (status !== 'pending') return false

  switch (action) {
    case 'accept':
    case 'decline':
    case 'counter':
      return role === 'recipient'
    case 'withdraw':
      return role === 'offerer'
  }
}
