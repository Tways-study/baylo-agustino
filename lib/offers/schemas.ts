import { z } from 'zod'

export const cashDirectionSchema = z.enum(['from_offerer', 'to_offerer'])

export const createOfferSchema = z
  .object({
    listingId: z.string().uuid(),
    itemListingIds: z.array(z.string().uuid()).max(20).default([]),
    cashCentavos: z.coerce.number().int().min(0).default(0),
    cashDirection: cashDirectionSchema.default('from_offerer'),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.itemListingIds.length > 0 || v.cashCentavos > 0, {
    message: 'Add at least one item or some cash.',
    path: ['itemListingIds'],
  })
export type CreateOfferInput = z.infer<typeof createOfferSchema>

// Give-listing "claim" path: no items, no cash, just an optional note.
// A separate schema rather than making the fields above optional — the
// discriminated shape keeps the give path from silently accepting a
// mistaken cash/item payload the server would strip anyway (Design
// Decision 4: give listings are enforced server-side regardless, but the
// client-side schema should already reflect the same intent).
export const claimOfferSchema = z.object({
  listingId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
})
export type ClaimOfferInput = z.infer<typeof claimOfferSchema>

export const counterOfferSchema = z.object({
  offerId: z.string().uuid(),
  cashCentavos: z.coerce.number().int().min(0),
  cashDirection: cashDirectionSchema,
  note: z.string().trim().max(500).optional(),
})
export type CounterOfferInput = z.infer<typeof counterOfferSchema>

export const offerIdSchema = z.object({ offerId: z.string().uuid() })
