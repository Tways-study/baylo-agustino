import type { PriceBand } from './schemas'

export interface CentavosRange {
  min: number
  max: number | null
}

const PRICE_BAND_RANGES: Record<PriceBand, CentavosRange> = {
  'under-200': { min: 0, max: 19999 },
  '200-500': { min: 20000, max: 49999 },
  '500-1000': { min: 50000, max: 99999 },
  '1000-plus': { min: 100000, max: null },
}

export function priceBandToRange(band: PriceBand): CentavosRange {
  return PRICE_BAND_RANGES[band]
}
