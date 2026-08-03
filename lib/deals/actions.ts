'use server'

import { createClient } from '@/lib/supabase/server'
import { offerIdSchema } from '@/lib/offers/schemas'
import {
  proposeMeetupSchema,
  cancelDealSchema,
  type ProposeMeetupInput,
  type CancelDealInput,
} from '@/lib/deals/schemas'

export interface DealActionResult {
  error?: string
}

export async function proposeMeetup(raw: ProposeMeetupInput): Promise<DealActionResult> {
  const result = proposeMeetupSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check the meetup details.' }
  }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('propose_meetup', {
    p_offer_id: input.offerId,
    p_spot_id: input.spotId,
    p_scheduled_at: input.scheduledAt,
  })
  if (error) return { error: error.message }
  return {}
}

export async function confirmMeetup(offerId: string): Promise<DealActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_meetup', { p_offer_id: offerId })
  if (error) return { error: error.message }
  return {}
}

export async function markSwapped(offerId: string): Promise<DealActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_swapped', { p_offer_id: offerId })
  if (error) return { error: error.message }
  return {}
}

export async function cancelDeal(raw: CancelDealInput): Promise<DealActionResult> {
  const result = cancelDealSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check the cancellation details.' }
  }

  const supabase = await createClient()
  const input = result.data
  const { error } = await supabase.rpc('cancel_deal', {
    p_offer_id: input.offerId,
    p_reason_code: input.reasonCode,
    p_reason_text: input.reasonText ?? null,
  })
  if (error) return { error: error.message }
  return {}
}
