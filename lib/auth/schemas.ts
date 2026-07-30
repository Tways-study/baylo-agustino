import { z } from 'zod'

const ALLOWED_DOMAIN = process.env['ALLOWED_EMAIL_DOMAIN'] ?? 'usa.edu.ph'

export const sendOtpSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address.')
    .refine((e) => e.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`), {
      message: `Only @${ALLOWED_DOMAIN} addresses can join.`,
    }),
})

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6, 'The code is 6 digits.').regex(/^\d+$/, 'Digits only.'),
})

export const onboardingSchema = z.object({
  displayName: z.string().min(2, 'At least 2 characters.').max(40, 'Max 40 characters.'),
  program: z.string().max(60).optional(),
  yearLevel: z.coerce.number().int().min(1).max(6).optional(),
  avatarUrl: z.string().url().optional(),
})

export type SendOtpInput = z.infer<typeof sendOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
