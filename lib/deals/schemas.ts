import { z } from 'zod'
import { offerIdSchema } from '@/lib/offers/schemas'

export const proposeMeetupSchema = offerIdSchema.merge(
  z.object({
    spotId: z.coerce.number().int().positive(),
    scheduledAt: z.string().datetime(),
  }),
)
export type ProposeMeetupInput = z.infer<typeof proposeMeetupSchema>

export const cancelReasonCodeSchema = z.enum([
  'changed_mind',
  'item_unavailable',
  'unreachable',
  'scheduling_conflict',
  'other',
])

export const cancelDealSchema = offerIdSchema
  .merge(
    z.object({
      reasonCode: cancelReasonCodeSchema,
      reasonText: z.string().trim().max(300).optional(),
    }),
  )
  .refine((v) => v.reasonCode !== 'other' || !!v.reasonText, {
    message: 'Tell us a bit more.',
    path: ['reasonText'],
  })
export type CancelDealInput = z.infer<typeof cancelDealSchema>

export const sendMessageSchema = offerIdSchema.merge(
  z.object({
    body: z.string().trim().min(1).max(1000),
  }),
)
export type SendMessageInput = z.infer<typeof sendMessageSchema>
