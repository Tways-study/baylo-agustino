import { z } from 'zod'

export const postWantSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters.').max(120, 'Max 120 characters.'),
  details: z.string().trim().max(500, 'Max 500 characters.').optional(),
  budgetCentavos: z.coerce.number().int().positive('Enter a positive amount.').optional(),
  offering: z.string().trim().max(200, 'Max 200 characters.').optional(),
})

export type PostWantInput = z.infer<typeof postWantSchema>
