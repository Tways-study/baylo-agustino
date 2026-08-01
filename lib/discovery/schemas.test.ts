import { describe, expect, it } from 'vitest'
import { parseFeedFilters } from './schemas'

describe('parseFeedFilters', () => {
  it('parses valid filter params', () => {
    const result = parseFeedFilters({ q: 'calculator', intent: 'sale', condition: 'good' })
    expect(result).toEqual({ q: 'calculator', intent: 'sale', condition: 'good' })
  })

  it('takes the first value when a param appears multiple times', () => {
    const result = parseFeedFilters({ intent: ['sale', 'swap'] })
    expect(result.intent).toBe('sale')
  })

  it('drops invalid enum values instead of throwing', () => {
    const result = parseFeedFilters({ intent: 'not-a-real-intent' })
    expect(result).toEqual({})
  })

  it('returns an empty object for no params', () => {
    expect(parseFeedFilters({})).toEqual({})
  })
})
