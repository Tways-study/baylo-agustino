import { z } from 'zod'

export const listingIntentSchema = z.enum(['swap', 'sale', 'give'])
export const listingConditionSchema = z.enum(['new', 'like_new', 'good', 'fair', 'worn'])

const sharedFields = {
  title: z.string().trim().min(3, 'At least 3 characters.').max(80, 'Max 80 characters.'),
  description: z.string().trim().max(1200, 'Max 1200 characters.').optional(),
  categoryId: z.coerce.number().int().positive('Choose a category.'),
  condition: listingConditionSchema,
  meetupSpotId: z.coerce.number().int().positive('Choose a meetup spot.'),
  images: z.array(z.string().min(1)).max(4, 'Up to 4 photos.'),
}

export const createListingSchema = z.discriminatedUnion('intent', [
  z
    .object({
      intent: z.literal('swap'),
      ...sharedFields,
      wants: z
        .array(z.string().trim().min(1).max(80))
        .min(1, 'Add at least one thing you would take in return.')
        .max(5, 'Up to 5 things.'),
      acceptsCash: z.boolean().default(false),
      estimatedValueCentavos: z.coerce.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      intent: z.literal('sale'),
      ...sharedFields,
      askCentavos: z.coerce.number().int().positive('Enter an asking price.'),
    })
    .strict(),
  z
    .object({
      intent: z.literal('give'),
      ...sharedFields,
    })
    .strict(),
])

export type CreateListingInput = z.infer<typeof createListingSchema>

// Edit: same conditional shape minus `images` (photos aren't editable in
// Phase 2) and minus `intent` (immutable after creation).
export const updateListingSchema = z.discriminatedUnion('intent', [
  z
    .object({
      intent: z.literal('swap'),
      ...sharedFields,
      images: z.never().optional(),
      wants: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
      acceptsCash: z.boolean().default(false),
      estimatedValueCentavos: z.coerce.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      intent: z.literal('sale'),
      ...sharedFields,
      images: z.never().optional(),
      askCentavos: z.coerce.number().int().positive('Enter an asking price.'),
    })
    .strict(),
  z
    .object({
      intent: z.literal('give'),
      ...sharedFields,
      images: z.never().optional(),
    })
    .strict(),
])

export type UpdateListingInput = z.infer<typeof updateListingSchema>

export const listingIdSchema = z.object({ listingId: z.string().uuid() })
