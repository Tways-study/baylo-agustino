import { z } from 'zod'
import { listingIntentSchema, listingConditionSchema } from '@/lib/listings/schemas'

export const priceBandSchema = z.enum(['under-200', '200-500', '500-1000', '1000-plus'])
export type PriceBand = z.infer<typeof priceBandSchema>

export const feedFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  intent: listingIntentSchema.optional(),
  category: z.string().max(60).optional(),
  condition: listingConditionSchema.optional(),
  price: priceBandSchema.optional(),
  photos: z.literal('1').optional(),
})
export type FeedFilters = z.infer<typeof feedFiltersSchema>

/**
 * Next's searchParams gives `string | string[] | undefined` per key, and
 * may contain values that don't match the schema (a hand-edited or stale
 * URL). Falls back to an empty filter set rather than throwing — a bad
 * filter param should never break the page.
 */
export function parseFeedFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FeedFilters {
  const flat: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    flat[key] = Array.isArray(value) ? value[0] : value
  }
  const result = feedFiltersSchema.safeParse(flat)
  return result.success ? result.data : {}
}
