import { describe, expect, it } from 'vitest'
import { createListingSchema } from './schemas'

const base = {
  title: 'Casio fx-991EX ClassWiz',
  categoryId: 1,
  condition: 'good' as const,
  meetupSpotId: 1,
  images: ['a.webp'],
}

describe('createListingSchema', () => {
  it('accepts a valid swap listing', () => {
    const r = createListingSchema.safeParse({
      ...base,
      intent: 'swap',
      wants: ['Ethics textbook'],
      acceptsCash: false,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a swap listing with zero wants', () => {
    const r = createListingSchema.safeParse({
      ...base,
      intent: 'swap',
      wants: [],
      acceptsCash: false,
    })
    expect(r.success).toBe(false)
  })

  it('accepts a valid sale listing', () => {
    const r = createListingSchema.safeParse({ ...base, intent: 'sale', askCentavos: 35000 })
    expect(r.success).toBe(true)
  })

  it('rejects a sale listing with no price', () => {
    const r = createListingSchema.safeParse({ ...base, intent: 'sale' })
    expect(r.success).toBe(false)
  })

  it('accepts a valid give listing', () => {
    const r = createListingSchema.safeParse({ ...base, intent: 'give' })
    expect(r.success).toBe(true)
  })

  it('rejects a give listing carrying a price field', () => {
    const r = createListingSchema.safeParse({ ...base, intent: 'give', askCentavos: 100 })
    expect(r.success).toBe(false)
  })

  it('rejects more than 4 images', () => {
    const r = createListingSchema.safeParse({
      ...base,
      intent: 'give',
      images: ['a', 'b', 'c', 'd', 'e'],
    })
    expect(r.success).toBe(false)
  })

  it('rejects a title under 3 characters', () => {
    const r = createListingSchema.safeParse({ ...base, intent: 'give', title: 'Hi' })
    expect(r.success).toBe(false)
  })
})
