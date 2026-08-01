import { describe, expect, it } from 'vitest'
import { priceBandToRange } from './format'

describe('priceBandToRange', () => {
  it('maps under-200 to 0-19999 centavos', () => {
    expect(priceBandToRange('under-200')).toEqual({ min: 0, max: 19999 })
  })

  it('maps 200-500 to 20000-49999 centavos', () => {
    expect(priceBandToRange('200-500')).toEqual({ min: 20000, max: 49999 })
  })

  it('maps 500-1000 to 50000-99999 centavos', () => {
    expect(priceBandToRange('500-1000')).toEqual({ min: 50000, max: 99999 })
  })

  it('maps 1000-plus to an open-ended range', () => {
    expect(priceBandToRange('1000-plus')).toEqual({ min: 100000, max: null })
  })
})
