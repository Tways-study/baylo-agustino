export type BalanceRead =
  | 'heavily_theirs'
  | 'slightly_theirs'
  | 'close_enough'
  | 'slightly_yours'
  | 'heavily_yours'
  | 'cant_gauge'

export interface BalanceInput {
  listingValueCentavos: number | null
  offeredItemsValueCentavos: (number | null)[]
  cashCentavos: number
  cashDirection: 'from_offerer' | 'to_offerer'
}

export function computeBalance(input: BalanceInput): BalanceRead {
  if (input.listingValueCentavos === null || input.listingValueCentavos === 0) {
    return 'cant_gauge'
  }
  if (input.offeredItemsValueCentavos.some((v) => v === null)) {
    return 'cant_gauge'
  }

  const itemsTotal = input.offeredItemsValueCentavos.reduce((sum, v) => sum + (v ?? 0), 0)
  const cashDelta =
    input.cashDirection === 'from_offerer' ? input.cashCentavos : -input.cashCentavos
  const offeredValue = itemsTotal + cashDelta

  const ratio = offeredValue / input.listingValueCentavos

  if (ratio < 0.7) return 'heavily_theirs'
  if (ratio < 0.9) return 'slightly_theirs'
  if (ratio <= 1.1) return 'close_enough'
  if (ratio <= 1.3) return 'slightly_yours'
  return 'heavily_yours'
}

export const BALANCE_READ_COPY: Record<BalanceRead, string> = {
  heavily_theirs: 'Heavily in their favor',
  slightly_theirs: 'Slightly in their favor',
  close_enough: 'Close enough — send it',
  slightly_yours: 'Slightly in your favor',
  heavily_yours: 'Heavily in your favor',
  cant_gauge: "Hard to gauge — there's no estimate to compare against",
}
