import { describe, expect, it } from 'vitest'
import { scanListingText } from './banned-words'

describe('scanListingText', () => {
  it('hard-blocks an exam answer key', () => {
    const r = scanListingText('Selling the answer key for the midterm exam')
    expect(r.severity).toBe('hard')
    expect(r.matches[0]?.rule).toBe('Academic integrity')
  })

  it('does not false-positive on legitimate reviewers', () => {
    const r = scanListingText('Gen Ed reviewers, bundle of 4, highlighted but still readable')
    expect(r.severity).toBe('clean')
  })

  it('soft-warns on ticket resale', () => {
    const r = scanListingText("Selling my concert ticket, can't go anymore")
    expect(r.severity).toBe('soft')
  })

  it('is clean for an ordinary listing', () => {
    const r = scanListingText('Casio fx-991EX ClassWiz, good condition, solar OK')
    expect(r.severity).toBe('clean')
  })

  it('hard-blocks a school ID listing', () => {
    const r = scanListingText('Found school ID, will trade for snacks')
    expect(r.severity).toBe('hard')
    expect(r.matches[0]?.rule).toBe('Identity documents')
  })
})
