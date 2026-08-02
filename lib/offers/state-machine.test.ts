import { describe, expect, it } from 'vitest'
import { canTransition, type OfferAction, type OfferRole, type OfferStatus } from './state-machine'

const ALL_STATUSES: OfferStatus[] = [
  'pending',
  'accepted',
  'declined',
  'countered',
  'withdrawn',
  'expired',
  'cancelled',
]
const ALL_ACTIONS: OfferAction[] = ['accept', 'decline', 'counter', 'withdraw']
const ALL_ROLES: OfferRole[] = ['offerer', 'recipient']

const LEGAL: Array<[OfferStatus, OfferAction, OfferRole]> = [
  ['pending', 'accept', 'recipient'],
  ['pending', 'decline', 'recipient'],
  ['pending', 'counter', 'recipient'],
  ['pending', 'withdraw', 'offerer'],
]

function isLegal(status: OfferStatus, action: OfferAction, role: OfferRole): boolean {
  return LEGAL.some(([s, a, r]) => s === status && a === action && r === role)
}

describe('canTransition', () => {
  for (const status of ALL_STATUSES) {
    for (const action of ALL_ACTIONS) {
      for (const role of ALL_ROLES) {
        const expected = isLegal(status, action, role)
        it(`${status} + ${action} + ${role} → ${expected}`, () => {
          expect(canTransition(status, action, role)).toBe(expected)
        })
      }
    }
  }
})
