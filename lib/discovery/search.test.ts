import { describe, expect, it } from 'vitest'
import { buildPrefixTsQuery } from './search'

describe('buildPrefixTsQuery', () => {
  it('builds a single-token prefix query', () => {
    expect(buildPrefixTsQuery('calcu')).toBe('calcu:*')
  })

  it('builds a multi-token AND query', () => {
    expect(buildPrefixTsQuery('lab gown')).toBe('lab:* & gown:*')
  })

  it('strips tsquery special characters', () => {
    expect(buildPrefixTsQuery("casio's & (best) calc!")).toBe('casio:* & s:* & best:* & calc:*')
  })

  it('collapses repeated whitespace', () => {
    expect(buildPrefixTsQuery('  lab   gown  ')).toBe('lab:* & gown:*')
  })

  it('returns empty string for input with no usable tokens', () => {
    expect(buildPrefixTsQuery('   ')).toBe('')
    expect(buildPrefixTsQuery('!!!')).toBe('')
    expect(buildPrefixTsQuery('')).toBe('')
  })
})
