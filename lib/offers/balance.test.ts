import { describe, expect, it } from 'vitest'
import { computeBalance } from './balance'

describe('computeBalance', () => {
  it('reads close_enough at exact parity', () => {
    expect(
      computeBalance({
        listingValueCentavos: 60000,
        offeredItemsValueCentavos: [60000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('reads heavily_theirs just under the 0.7 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [69999],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('heavily_theirs')
  })

  it('reads slightly_theirs exactly at the 0.7 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [70000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('slightly_theirs')
  })

  it('reads close_enough exactly at the 0.9 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [90000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('reads close_enough exactly at the 1.1 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [110000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('reads slightly_yours just over the 1.1 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [110001],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('slightly_yours')
  })

  it('reads slightly_yours exactly at the 1.3 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [130000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('slightly_yours')
  })

  it('reads heavily_yours just over the 1.3 boundary', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [130001],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('heavily_yours')
  })

  it('adds cash from_offerer to the offered side', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [80000],
        cashCentavos: 20000,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('subtracts cash to_offerer from the offered side', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [130000],
        cashCentavos: 30000,
        cashDirection: 'to_offerer',
      }),
    ).toBe('close_enough')
  })

  it('sums multiple offered items', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [40000, 60000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('close_enough')
  })

  it('cant_gauge when the listing has no value', () => {
    expect(
      computeBalance({
        listingValueCentavos: null,
        offeredItemsValueCentavos: [50000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('cant_gauge')
  })

  it('cant_gauge when the listing value is zero (division guard)', () => {
    expect(
      computeBalance({
        listingValueCentavos: 0,
        offeredItemsValueCentavos: [50000],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('cant_gauge')
  })

  it('cant_gauge when any offered item has an unknown value, even mixed with known ones', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [50000, null],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('cant_gauge')
  })

  it('cant_gauge with zero offered items and zero cash still resolves (no divide-by-zero on the numerator side)', () => {
    expect(
      computeBalance({
        listingValueCentavos: 100000,
        offeredItemsValueCentavos: [],
        cashCentavos: 0,
        cashDirection: 'from_offerer',
      }),
    ).toBe('heavily_theirs')
  })
})
